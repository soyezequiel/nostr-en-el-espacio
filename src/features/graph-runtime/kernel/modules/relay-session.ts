import type { RelayHealthSnapshot } from '@/features/graph-runtime/nostr'
import type {
  LoadRootOptions,
  LoadRootResult,
  ReconfigureRelaysInput,
  ReconfigureRelaysResult,
} from '@/features/graph-runtime/kernel/runtime'
import type { KernelContext } from '@/features/graph-runtime/kernel/modules/context'
import { createIdleRelayHealthSnapshotMap, createRelayHealthSnapshotFromStore, mapRelayHealthStatus, validateRelayOverrideInput, type RelayCollectionResult } from '@/features/graph-runtime/kernel/modules/helpers'
import { RELAY_HEALTH_FLUSH_DELAY_MS } from '@/features/graph-runtime/kernel/modules/constants'
import { transitionRelayOverride } from '@/features/graph-runtime/kernel/transitions/relay-override'

interface RelayOverrideSnapshot {
  relayUrls: string[]
  rootPubkey: string | null
}

export function createRelaySessionModule(ctx: KernelContext) {
  let pendingRelayOverride: RelayOverrideSnapshot | null = null
  let pendingRelayHealthFlush: ReturnType<typeof setTimeout> | null = null
  let pendingRelayHealthSnapshot: Record<string, RelayHealthSnapshot> | null = null
  let loadRoot:
    | ((rootPubkey: string, options?: LoadRootOptions) => Promise<LoadRootResult>)
    | null = null

  function setRelayOverrideStatus(action: Parameters<typeof transitionRelayOverride>[1]) {
    const state = ctx.store.getState()
    const next = transitionRelayOverride(state.relayOverrideStatus, action)
    if (next === null) {
      console.warn(
        `Invalid transition: relayOverride ${state.relayOverrideStatus} -> ${action}`,
      )
      return
    }

    state.setRelayOverrideStatus(next)
  }

  function bindLoadRoot(
    nextLoadRoot: (rootPubkey: string, options?: LoadRootOptions) => Promise<LoadRootResult>,
  ): void {
    loadRoot = nextLoadRoot
  }

  function clearPendingOverride(): void {
    pendingRelayOverride = null
  }

  function prepareRelayOverrideValidation(): void {
    const status = ctx.store.getState().relayOverrideStatus
    if (
      status !== 'editing' &&
      status !== 'validating' &&
      status !== 'applying'
    ) {
      setRelayOverrideStatus('edit')
    }

    if (ctx.store.getState().relayOverrideStatus !== 'validating') {
      setRelayOverrideStatus('validate')
    }
  }

  async function reconfigureRelays(
    input: ReconfigureRelaysInput,
  ): Promise<ReconfigureRelaysResult> {
    const state = ctx.store.getState()
    prepareRelayOverrideValidation()

    const validation = validateRelayOverrideInput(
      input.restoreDefault ? ctx.defaultRelayUrls : input.relayUrls ?? [],
    )

    if (validation.status === 'invalid') {
      setRelayOverrideStatus('invalid')
      state.setRootLoadState({ message: validation.message })

      return {
        status: 'invalid',
        relayUrls: state.relayUrls.slice(),
        message: validation.message,
        diagnostics: validation.diagnostics,
        isGraphStale: state.isGraphStale,
        relayHealth: snapshotStoreRelayHealth(state.relayUrls),
      }
    }

    const previousRelayUrls =
      state.relayUrls.length > 0
        ? state.relayUrls.slice()
        : ctx.defaultRelayUrls.slice()
    const rootPubkey = state.rootNodePubkey

    state.setRelayUrls(validation.relayUrls)
    state.resetRelayHealth(validation.relayUrls)
    setRelayOverrideStatus('apply')
    state.markGraphStale(rootPubkey !== null)

    if (!rootPubkey) {
      setRelayOverrideStatus('applied')
      state.markGraphStale(false)
      state.setRootLoadState({
        message: 'Set de relays aplicado. Carga un root para probar cobertura.',
      })
      ctx.emitter.emit({
        type: 'relay-override-applied',
        relayUrls: validation.relayUrls,
      })

      return {
        status: 'applied',
        relayUrls: validation.relayUrls,
        message: 'Set de relays aplicado. Carga un root para probar cobertura.',
        diagnostics: validation.diagnostics,
        isGraphStale: false,
        relayHealth: createIdleRelayHealthSnapshotMap(
          validation.relayUrls,
          ctx.now(),
        ),
      }
    }

    if (!loadRoot) {
      throw new Error('Relay session is missing loadRoot binding.')
    }

    pendingRelayOverride = {
      relayUrls: previousRelayUrls,
      rootPubkey,
    }

    const loadResult = await loadRoot(rootPubkey, {
      preserveExistingGraph: true,
      relayUrls: validation.relayUrls,
    })

    const appliedSuccessfully =
      loadResult.loadedFrom === 'live' && loadResult.discoveredFollowCount > 0

    if (appliedSuccessfully) {
      setRelayOverrideStatus('applied')
      state.markGraphStale(false)
      pendingRelayOverride = null
      ctx.emitter.emit({
        type: 'relay-override-applied',
        relayUrls: validation.relayUrls,
      })

      return {
        status: 'applied',
        relayUrls: validation.relayUrls,
        message: loadResult.message,
        diagnostics: validation.diagnostics,
        isGraphStale: false,
        relayHealth: loadResult.relayHealth,
      }
    }

    const revertibleMessage = `${loadResult.message} Puedes revertir al set anterior si este override no mejora la cobertura.`
    setRelayOverrideStatus('revertible')
    state.markGraphStale(true)
    state.setRootLoadState({
      status: 'partial',
      message: revertibleMessage,
      loadedFrom: loadResult.loadedFrom,
    })

    return {
      status: 'revertible',
      relayUrls: validation.relayUrls,
      message: revertibleMessage,
      diagnostics: validation.diagnostics,
      isGraphStale: true,
      relayHealth: loadResult.relayHealth,
    }
  }

  async function revertRelayOverride(): Promise<ReconfigureRelaysResult | null> {
    if (!pendingRelayOverride) {
      return null
    }

    const overrideToRevert = pendingRelayOverride
    const state = ctx.store.getState()

    state.setRelayUrls(overrideToRevert.relayUrls)
    state.resetRelayHealth(overrideToRevert.relayUrls)
    setRelayOverrideStatus('revert')
    state.markGraphStale(false)

    if (!overrideToRevert.rootPubkey) {
      setRelayOverrideStatus('applied')
      pendingRelayOverride = null

      return {
        status: 'applied',
        relayUrls: overrideToRevert.relayUrls,
        message: 'Se revirtio el override de relays.',
        diagnostics: [],
        isGraphStale: false,
        relayHealth: createIdleRelayHealthSnapshotMap(
          overrideToRevert.relayUrls,
          ctx.now(),
        ),
      }
    }

    if (!loadRoot) {
      throw new Error('Relay session is missing loadRoot binding.')
    }

    const loadResult = await loadRoot(overrideToRevert.rootPubkey, {
      preserveExistingGraph: true,
      relayUrls: overrideToRevert.relayUrls,
    })

    const isGraphStale =
      loadResult.loadedFrom !== 'live' || loadResult.discoveredFollowCount === 0

    setRelayOverrideStatus('applied')
    state.markGraphStale(isGraphStale)
    state.setRootLoadState({
      status: loadResult.status,
      message: `Se revirtio el override de relays. ${loadResult.message}`,
      loadedFrom: loadResult.loadedFrom,
    })
    pendingRelayOverride = null

    return {
      status: 'applied',
      relayUrls: overrideToRevert.relayUrls,
      message: `Se revirtio el override de relays. ${loadResult.message}`,
      diagnostics: [],
      isGraphStale,
      relayHealth: loadResult.relayHealth,
    }
  }

  function publishRelayHealth(
    relayHealth: Record<string, RelayHealthSnapshot>,
  ): void {
    if (Object.keys(relayHealth).length === 0) {
      return
    }

    pendingRelayHealthSnapshot = {
      ...(pendingRelayHealthSnapshot ?? {}),
      ...relayHealth,
    }

    if (pendingRelayHealthFlush !== null) {
      return
    }

    pendingRelayHealthFlush = setTimeout(() => {
      flushPendingRelayHealth()
    }, RELAY_HEALTH_FLUSH_DELAY_MS)
  }

  function flushPendingRelayHealth(): void {
    if (pendingRelayHealthFlush !== null) {
      clearTimeout(pendingRelayHealthFlush)
      pendingRelayHealthFlush = null
    }

    const pendingRelayHealth = pendingRelayHealthSnapshot
    if (!pendingRelayHealth) {
      return
    }

    pendingRelayHealthSnapshot = null
    ctx.store.getState().updateRelayHealthBatch(
      Object.fromEntries(
        Object.entries(pendingRelayHealth).map(([relayUrl, snapshot]) => [
          relayUrl,
          {
            status: mapRelayHealthStatus(snapshot.status),
            lastCheckedAt: snapshot.lastChangeMs,
            lastNotice: snapshot.lastNotice ?? null,
          },
        ]),
      ),
    )
  }

  function snapshotStoreRelayHealth(
    relayUrls: string[],
  ): Record<string, RelayHealthSnapshot> {
    flushPendingRelayHealth()
    const state = ctx.store.getState()

    return Object.fromEntries(
      relayUrls.map((relayUrl) => [
        relayUrl,
        createRelayHealthSnapshotFromStore(
          relayUrl,
          state.relayHealth[relayUrl],
          ctx.now(),
        ),
      ]),
    )
  }

  function resolveRelayHealthSnapshot(
    relayUrls: string[],
    contactListResult: RelayCollectionResult,
    activeRelayHealth?: Record<string, RelayHealthSnapshot>,
  ): Record<string, RelayHealthSnapshot> {
    return (
      contactListResult.summary?.relayHealth ??
      activeRelayHealth ??
      Object.fromEntries(
        relayUrls.map((relayUrl) => [
          relayUrl,
          {
            url: relayUrl,
            status: 'offline',
            attempt: 0,
            activeSubscriptions: 0,
            consecutiveFailures: 0,
            lastChangeMs: ctx.now(),
          } satisfies RelayHealthSnapshot,
        ]),
      )
    )
  }

  return {
    bindLoadRoot,
    clearPendingOverride,
    reconfigureRelays,
    revertRelayOverride,
    publishRelayHealth,
    flushPendingRelayHealth,
    snapshotStoreRelayHealth,
    resolveRelayHealthSnapshot,
  }
}

export type RelaySessionModule = ReturnType<typeof createRelaySessionModule>
