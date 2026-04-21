import type { Filter } from 'nostr-tools'

import type {
  GraphLink,
  GraphNode,
  NodeExpansionPhase,
  NodeExpansionState,
} from '@/features/graph-runtime/app/store'
import type { ExpandNodeResult } from '@/features/graph-runtime/kernel/runtime'
import type { KernelContext, RelayAdapterInstance } from '@/features/graph-runtime/kernel/modules/context'
import {
  MAX_SESSION_RELAYS,
  NODE_EXPAND_CONNECT_TIMEOUT_MS,
  NODE_EXPAND_HARD_TIMEOUT_MS,
  NODE_EXPAND_INBOUND_QUERY_LIMIT,
  NODE_EXPAND_PAGE_TIMEOUT_MS,
  NODE_EXPAND_RETRY_COUNT,
  NODE_EXPAND_STRAGGLER_GRACE_MS,
} from '@/features/graph-runtime/kernel/modules/constants'
import {
  collectInboundFollowerEvidence,
  collectRelayEvents,
  collectTargetedReciprocalFollowerEvidence,
  mergeBoundedRelayUrlSets,
  selectLatestReplaceableEvent,
  selectLatestReplaceableEventsByPubkey,
  serializeContactListEvent,
} from '@/features/graph-runtime/kernel/modules/helpers'
import type { AnalysisModule } from '@/features/graph-runtime/kernel/modules/analysis'
import type { PersistenceModule } from '@/features/graph-runtime/kernel/modules/persistence'
import type { ProfileHydrationModule } from '@/features/graph-runtime/kernel/modules/profile-hydration'
import type { RootLoaderModule } from '@/features/graph-runtime/kernel/modules/root-loader'
import type { ZapLayerModule } from '@/features/graph-runtime/kernel/modules/zap-layer'
import type { NodeDetailModule } from '@/features/graph-runtime/kernel/modules/node-detail'
import type { ParseContactListResult } from '@/features/graph-runtime/workers/events/contracts'
import {
  buildContactListPartialMessage,
  buildDiscoveredMessage,
  buildExpandedStructureMessage,
} from '@/features/graph-runtime/kernel/modules/text-helpers'

const NODE_EXPANSION_TOTAL_STEPS = 4
const MAX_PROFILE_HYDRATION_RELAY_URLS = MAX_SESSION_RELAYS

export function createNodeExpansionModule(
  ctx: KernelContext,
  collaborators: {
    analysis: AnalysisModule
    persistence: PersistenceModule
    profileHydration: ProfileHydrationModule
    rootLoader: RootLoaderModule
    zapLayer: ZapLayerModule
    nodeDetail: NodeDetailModule
    loadDirectInboundFollowerEvidence?: (input: {
      adapter: RelayAdapterInstance
      pubkey: string
    }) => Promise<{
      followerPubkeys: string[]
      partial: boolean
    }>
    loadTargetedReciprocalFollowerEvidence?: (
      input: Parameters<typeof collectTargetedReciprocalFollowerEvidence>[0],
    ) => ReturnType<typeof collectTargetedReciprocalFollowerEvidence>
  },
) {
  const activeNodeExpansionRequests = new Map<string, Promise<ExpandNodeResult>>()
  const activeInboundEnrichmentRequests = new Map<string, Promise<void>>()
  const activeReciprocalEnrichmentRequests = new Map<string, Promise<void>>()
  const loadDirectInboundFollowerEvidence =
    collaborators.loadDirectInboundFollowerEvidence ??
    (async ({ adapter, pubkey }) => {
      const inboundFollowerResult = await collectRelayEvents(adapter, [
        {
          kinds: [3],
          '#p': [pubkey],
          limit: NODE_EXPAND_INBOUND_QUERY_LIMIT,
        } satisfies Filter & { '#p': string[] },
      ], {
        hardTimeoutMs: NODE_EXPAND_HARD_TIMEOUT_MS,
      })

      const inboundFollowerEvidence = await collectInboundFollowerEvidence(
        ctx.eventsWorker,
        selectLatestReplaceableEventsByPubkey(inboundFollowerResult.events),
        pubkey,
      )

      return {
        followerPubkeys: inboundFollowerEvidence.followerPubkeys,
        partial:
          inboundFollowerEvidence.partial || inboundFollowerResult.error !== null,
      }
    })
  const loadTargetedReciprocalFollowerEvidence =
    collaborators.loadTargetedReciprocalFollowerEvidence ??
    collectTargetedReciprocalFollowerEvidence

  const buildNodeExpansionState = (
    state: Partial<NodeExpansionState> & Pick<NodeExpansionState, 'status' | 'message'>,
  ): NodeExpansionState => ({
    phase: 'idle',
    step: null,
    totalSteps: null,
    startedAt: null,
    updatedAt: ctx.now(),
    ...state,
  })

  const normalizeExpansionError = (error: unknown, fallbackMessage: string) =>
    error instanceof Error ? error : new Error(fallbackMessage)

  const getCachedContactList = async (targetPubkey: string) => {
    try {
      return await ctx.repositories.contactLists.get(targetPubkey)
    } catch (error) {
      console.warn(
        'Contact list cache lookup failed during node expansion:',
        error,
      )
      return null
    }
  }

  const collectExpansionRelayEvents = async (
    adapter: RelayAdapterInstance,
    filters: Parameters<typeof collectRelayEvents>[1],
    options: Parameters<typeof collectRelayEvents>[2],
  ): ReturnType<typeof collectRelayEvents> => {
    try {
      return await collectRelayEvents(adapter, filters, options)
    } catch (error) {
      return {
        events: [],
        summary: null,
        error: normalizeExpansionError(
          error,
          'No se pudo consultar la estructura del nodo.',
        ),
      }
    }
  }

  const loadDirectInboundFollowerEvidenceSafely = async (input: {
    adapter: RelayAdapterInstance
    pubkey: string
  }) => {
    try {
      return await loadDirectInboundFollowerEvidence(input)
    } catch (error) {
      console.warn(
        'Direct inbound follower evidence failed during node expansion:',
        error,
      )
      return {
        followerPubkeys: [],
        partial: true,
      }
    }
  }

  const buildRecoverableExpansionMessage = (pubkey: string, error: unknown) => {
    const detail =
      error instanceof Error && error.message.trim().length > 0
        ? ` ${error.message}`
        : ''
    return `Expansion parcial para ${pubkey.slice(0, 8)}...${detail}`
  }

  const setLoadingState = (
    pubkey: string,
    phase: Exclude<NodeExpansionPhase, 'idle'>,
    step: number,
    message: string,
    startedAt: number,
  ) => {
    ctx.store.getState().setNodeExpansionState(
      pubkey,
      buildNodeExpansionState({
        status: 'loading',
        message,
        phase,
        step,
        totalSteps: NODE_EXPANSION_TOTAL_STEPS,
        startedAt,
      }),
    )
  }

  const setTerminalState = (
    pubkey: string,
    status: Exclude<NodeExpansionState['status'], 'loading'>,
    message: string | null,
    startedAt: number | null = null,
  ) => {
    ctx.store.getState().setNodeExpansionState(
      pubkey,
      buildNodeExpansionState({
        status,
        message,
        startedAt,
      }),
    )
  }

  const applySupplementalInboundFollowerEvidence = (
    pubkey: string,
    inboundFollowerPubkeys: readonly string[],
    options: {
      relayUrls: readonly string[]
    },
  ) => {
    const uniqueInboundFollowerPubkeys = Array.from(
      new Set(
        inboundFollowerPubkeys.filter(
          (followerPubkey) => followerPubkey && followerPubkey !== pubkey,
        ),
      ),
    )

    if (uniqueInboundFollowerPubkeys.length === 0) {
      return
    }

    const state = ctx.store.getState()
    if (!state.nodes[pubkey] || !state.expandedNodePubkeys.has(pubkey)) {
      return
    }

    const discoveredAt = ctx.now()
    const inboundNewNodes: GraphNode[] = uniqueInboundFollowerPubkeys
      .filter((followerPubkey) => !state.nodes[followerPubkey])
      .map((followerPubkey) => ({
        pubkey: followerPubkey,
        keywordHits: 0,
        discoveredAt,
        profileState: 'loading',
        source: 'inbound' as const,
      }))

    const inboundNodeResult =
      inboundNewNodes.length > 0
        ? state.upsertNodes(inboundNewNodes)
        : { acceptedPubkeys: [], rejectedPubkeys: [] }

    const freshState = ctx.store.getState()
    if (!freshState.nodes[pubkey] || !freshState.expandedNodePubkeys.has(pubkey)) {
      return
    }

    const existingInboundFollowers = new Set(
      freshState.inboundAdjacency[pubkey] ?? [],
    )
    const supplementalInboundLinks: GraphLink[] = uniqueInboundFollowerPubkeys
      .filter((followerPubkey) => freshState.nodes[followerPubkey])
      .filter((followerPubkey) => !existingInboundFollowers.has(followerPubkey))
      .map((followerPubkey) => ({
        source: followerPubkey,
        target: pubkey,
        relation: 'inbound' as const,
      }))

    if (supplementalInboundLinks.length > 0) {
      freshState.upsertInboundLinks(supplementalInboundLinks)
    }

    if (
      inboundNodeResult.acceptedPubkeys.length === 0 &&
      supplementalInboundLinks.length === 0
    ) {
      return
    }

    collaborators.analysis.schedule()

    const loadSequence = collaborators.rootLoader.getLoadSequence()
    const profileHydrationRelayUrls = mergeBoundedRelayUrlSets(
      MAX_PROFILE_HYDRATION_RELAY_URLS,
      options.relayUrls,
    )

    if (inboundNodeResult.acceptedPubkeys.length > 0) {
      void collaborators.profileHydration.hydrateNodeProfiles(
        inboundNodeResult.acceptedPubkeys,
        profileHydrationRelayUrls,
        () => collaborators.rootLoader.isStaleLoad(loadSequence),
        {
          persistProfileEvent: collaborators.persistence.persistProfileEvent,
        },
      ).catch((error) => {
        console.warn(
          'Profile hydration failed after reciprocal node expansion enrichment:',
          error,
        )
      })
    }

    void collaborators.zapLayer.prefetchZapLayer(
      collaborators.zapLayer.getZapTargetPubkeys(),
      options.relayUrls.slice(),
    ).catch((error) => {
      console.warn('Zap layer prefetch failed after reciprocal enrichment:', error)
    })
  }

  const scheduleReciprocalInboundEnrichment = (
    pubkey: string,
    followPubkeys: readonly string[],
    relayUrls: readonly string[],
  ) => {
    const candidatePubkeys = Array.from(
      new Set(
        followPubkeys.filter(
          (followPubkey) => followPubkey && followPubkey !== pubkey,
        ),
      ),
    )

    if (
      candidatePubkeys.length === 0 ||
      activeReciprocalEnrichmentRequests.has(pubkey)
    ) {
      return
    }

    let adapter: RelayAdapterInstance
    try {
      adapter = ctx.createRelayAdapter({
        relayUrls: relayUrls.slice(),
        connectTimeoutMs: NODE_EXPAND_CONNECT_TIMEOUT_MS,
        pageTimeoutMs: NODE_EXPAND_PAGE_TIMEOUT_MS,
        retryCount: NODE_EXPAND_RETRY_COUNT,
        stragglerGraceMs: NODE_EXPAND_STRAGGLER_GRACE_MS,
      })
    } catch (error) {
      console.warn(
        'Background targeted reciprocal adapter creation failed during expansion:',
        error,
      )
      return
    }

    const request = loadTargetedReciprocalFollowerEvidence({
      adapter,
      eventsWorker: ctx.eventsWorker,
      followPubkeys: candidatePubkeys,
      targetPubkey: pubkey,
    })
      .then((reciprocalEvidence) => {
        applySupplementalInboundFollowerEvidence(
          pubkey,
          reciprocalEvidence.followerPubkeys,
          {
            relayUrls,
          },
        )
      })
      .catch((error) => {
        console.warn(
          'Background targeted reciprocal follower evidence failed during expansion:',
          error,
        )
      })
      .finally(() => {
        adapter.close()
        activeReciprocalEnrichmentRequests.delete(pubkey)
      })

    activeReciprocalEnrichmentRequests.set(pubkey, request)
  }

  const scheduleDirectInboundEnrichment = (
    pubkey: string,
    relayUrls: readonly string[],
  ) => {
    if (activeInboundEnrichmentRequests.has(pubkey)) {
      return
    }

    let adapter: RelayAdapterInstance
    try {
      adapter = ctx.createRelayAdapter({
        relayUrls: relayUrls.slice(),
        connectTimeoutMs: NODE_EXPAND_CONNECT_TIMEOUT_MS,
        pageTimeoutMs: NODE_EXPAND_PAGE_TIMEOUT_MS,
        retryCount: NODE_EXPAND_RETRY_COUNT,
        stragglerGraceMs: NODE_EXPAND_STRAGGLER_GRACE_MS,
      })
    } catch (error) {
      console.warn(
        'Background direct inbound adapter creation failed during expansion:',
        error,
      )
      return
    }

    const request = loadDirectInboundFollowerEvidence({
      adapter,
      pubkey,
    })
      .then((inboundEvidence) => {
        applySupplementalInboundFollowerEvidence(
          pubkey,
          inboundEvidence.followerPubkeys,
          {
            relayUrls,
          },
        )
      })
      .catch((error) => {
        console.warn(
          'Background direct inbound follower evidence failed during expansion:',
          error,
        )
      })
      .finally(() => {
        adapter.close()
        activeInboundEnrichmentRequests.delete(pubkey)
      })

    activeInboundEnrichmentRequests.set(pubkey, request)
  }

  async function expandNode(pubkey: string): Promise<ExpandNodeResult> {
    const activeRequest = activeNodeExpansionRequests.get(pubkey)
    if (activeRequest) {
      return activeRequest
    }

    const request = expandNodeOnce(pubkey).finally(() => {
      activeNodeExpansionRequests.delete(pubkey)
    })
    activeNodeExpansionRequests.set(pubkey, request)

    return request
  }

  async function expandNodeOnce(pubkey: string): Promise<ExpandNodeResult> {
    const state = ctx.store.getState()

    if (!state.nodes[pubkey]) {
      setTerminalState(
        pubkey,
        'error',
        `Nodo ${pubkey.slice(0, 8)}... no existe en el grafo descubierto.`,
      )
      return {
        status: 'error',
        discoveredFollowCount: 0,
        rejectedPubkeys: [],
        message: `Nodo ${pubkey.slice(0, 8)}... no existe en el grafo descubierto.`,
      }
    }

    if (state.expandedNodePubkeys.has(pubkey)) {
      setTerminalState(
        pubkey,
        'ready',
        `Nodo ${pubkey.slice(0, 8)}... ya fue expandido.`,
      )
      return {
        status: 'ready',
        discoveredFollowCount: 0,
        rejectedPubkeys: [],
        message: `Nodo ${pubkey.slice(0, 8)}... ya fue expandido.`,
      }
    }

    if (state.graphCaps.capReached) {
      setTerminalState(
        pubkey,
        'error',
        `Cap de ${state.graphCaps.maxNodes} nodos alcanzado. No se puede expandir.`,
      )
      return {
        status: 'error',
        discoveredFollowCount: 0,
        rejectedPubkeys: [],
        message: `Cap de ${state.graphCaps.maxNodes} nodos alcanzado. No se puede expandir.`,
      }
    }

    const relayUrls =
      state.relayUrls.length > 0
        ? state.relayUrls.slice()
        : ctx.defaultRelayUrls.slice()

    const startedAt = ctx.now()
    setLoadingState(
      pubkey,
      'preparing',
      1,
      'Preparando expansion del vecindario seleccionado...',
      startedAt,
    )

    const previewState = state.nodeStructurePreviewStates?.[pubkey]
    const isRecentFallbackOrEmpty =
      previewState &&
      (previewState.status === 'partial' || previewState.status === 'empty') &&
      !collaborators.nodeDetail.getActivePreviewRequest(pubkey)

    if (isRecentFallbackOrEmpty) {
      setLoadingState(
        pubkey,
        'fetching-structure',
        2,
        'Revisando evidencia local para acelerar la expansion...',
        startedAt,
      )
      const cachedContactList = await getCachedContactList(pubkey)
      if (cachedContactList) {
        const cachePreviewMessage =
          buildContactListPartialMessage({
            discoveredFollowCount: cachedContactList.follows.length,
            diagnostics: [],
            rejectedPubkeyCount: 0,
            loadedFromCache: true,
          }) ??
          buildDiscoveredMessage(cachedContactList.follows.length, true, true)

        setLoadingState(
          pubkey,
          'merging',
          4,
          'Integrando follows recuperados desde cache local...',
          startedAt,
        )
        const result = applyExpandedStructureEvidence(
          pubkey,
          cachedContactList.follows,
          [],
          {
            relayUrls,
            relayHints: cachedContactList.relayHints,
            authoredHasPartialSignals: true,
            inboundHasPartialSignals: false,
            authoredDiagnostics: [],
            authoredLoadedFromCache: true,
            previewMessage:
              cachedContactList.follows.length > 0
                ? cachePreviewMessage
                : `Sin lista de follows descubierta para ${pubkey.slice(0, 8)}...`,
          },
        )
        scheduleReciprocalInboundEnrichment(
          pubkey,
          cachedContactList.follows,
          relayUrls,
        )
        scheduleDirectInboundEnrichment(pubkey, relayUrls)
        return result
      }
    }

    let adapter: RelayAdapterInstance | null = null

    try {
      adapter = ctx.createRelayAdapter({
        relayUrls,
        connectTimeoutMs: NODE_EXPAND_CONNECT_TIMEOUT_MS,
        pageTimeoutMs: NODE_EXPAND_PAGE_TIMEOUT_MS,
        retryCount: NODE_EXPAND_RETRY_COUNT,
        stragglerGraceMs: NODE_EXPAND_STRAGGLER_GRACE_MS,
      })
      setLoadingState(
        pubkey,
        'fetching-structure',
        2,
        'Consultando relays activos para recuperar follows y followers...',
        startedAt,
      )
      const contactListResult = await collectExpansionRelayEvents(adapter, [
        { authors: [pubkey], kinds: [3] } satisfies Filter,
      ], {
        hardTimeoutMs: NODE_EXPAND_HARD_TIMEOUT_MS,
      })
      const authoredRelayHadPartialSignals = contactListResult.error !== null

      setLoadingState(
        pubkey,
        'correlating-followers',
        3,
        'Correlacionando followers entrantes y validando evidencia...',
        startedAt,
      )
      const latestContactListEvent = selectLatestReplaceableEvent(contactListResult.events)

      if (!latestContactListEvent) {
        const cachedContactList = await getCachedContactList(pubkey)
        if (cachedContactList) {
          const cachePreviewMessage =
            buildContactListPartialMessage({
              discoveredFollowCount: cachedContactList.follows.length,
              diagnostics: [],
              rejectedPubkeyCount: 0,
              loadedFromCache: true,
          }) ??
          buildDiscoveredMessage(cachedContactList.follows.length, true, true)
          setLoadingState(
            pubkey,
            'merging',
            4,
            'Integrando evidencia estructural recuperada...',
            startedAt,
          )
          const result = applyExpandedStructureEvidence(
            pubkey,
            cachedContactList.follows,
            [],
            {
              relayUrls,
              relayHints: cachedContactList.relayHints,
              authoredHasPartialSignals: true,
              inboundHasPartialSignals: false,
              authoredDiagnostics: [],
              authoredLoadedFromCache: true,
              previewMessage:
                cachedContactList.follows.length > 0
                  ? cachePreviewMessage
                  : `Sin lista de follows descubierta para ${pubkey.slice(0, 8)}...`,
            },
          )
          scheduleReciprocalInboundEnrichment(
            pubkey,
            cachedContactList.follows,
            relayUrls,
          )
          scheduleDirectInboundEnrichment(pubkey, relayUrls)
          return result
        }

        const inboundFollowerEvidence = await loadDirectInboundFollowerEvidenceSafely({
          adapter,
          pubkey,
        })
        setLoadingState(
          pubkey,
          'merging',
          4,
          'Actualizando el grafo con la evidencia disponible...',
          startedAt,
        )
        return applyExpandedStructureEvidence(
          pubkey,
          [],
          inboundFollowerEvidence.followerPubkeys,
          {
            relayUrls,
            authoredHasPartialSignals: authoredRelayHadPartialSignals,
            inboundHasPartialSignals: inboundFollowerEvidence.partial,
            previewMessage: `Sin lista de follows descubierta para ${pubkey.slice(0, 8)}...`,
          },
        )
      }

      let parsedContactList: ParseContactListResult
      try {
        parsedContactList = await ctx.eventsWorker.invoke('PARSE_CONTACT_LIST', {
          event: serializeContactListEvent(latestContactListEvent.event),
        })
      } catch (error) {
        console.warn(
          'Contact list parsing failed during node expansion:',
          error,
        )
        const cachedContactList = await getCachedContactList(pubkey)
        if (cachedContactList) {
          const cachePreviewMessage =
            buildContactListPartialMessage({
              discoveredFollowCount: cachedContactList.follows.length,
              diagnostics: [],
              rejectedPubkeyCount: 0,
              loadedFromCache: true,
            }) ??
            buildDiscoveredMessage(cachedContactList.follows.length, true, true)
          setLoadingState(
            pubkey,
            'merging',
            4,
            'Integrando evidencia estructural recuperada...',
            startedAt,
          )
          const result = applyExpandedStructureEvidence(
            pubkey,
            cachedContactList.follows,
            [],
            {
              relayUrls,
              relayHints: cachedContactList.relayHints,
              authoredHasPartialSignals: true,
              inboundHasPartialSignals: false,
              authoredDiagnostics: [],
              authoredLoadedFromCache: true,
              previewMessage:
                cachedContactList.follows.length > 0
                  ? cachePreviewMessage
                  : `Sin lista de follows descubierta para ${pubkey.slice(0, 8)}...`,
            },
          )
          scheduleReciprocalInboundEnrichment(
            pubkey,
            cachedContactList.follows,
            relayUrls,
          )
          scheduleDirectInboundEnrichment(pubkey, relayUrls)
          return result
        }

        const inboundFollowerEvidence =
          await loadDirectInboundFollowerEvidenceSafely({
            adapter,
            pubkey,
          })
        setLoadingState(
          pubkey,
          'merging',
          4,
          'Actualizando el grafo con la evidencia disponible...',
          startedAt,
        )
        return applyExpandedStructureEvidence(
          pubkey,
          [],
          inboundFollowerEvidence.followerPubkeys,
          {
            relayUrls,
            authoredHasPartialSignals: true,
            inboundHasPartialSignals: inboundFollowerEvidence.partial,
            previewMessage: `Sin lista de follows confiable para ${pubkey.slice(0, 8)}...`,
          },
        )
      }

      const cachedContactListBeforePersist =
        parsedContactList.followPubkeys.length === 0
          ? await getCachedContactList(pubkey)
          : null

      let persistFailed = false
      try {
        await collaborators.persistence.persistContactListEvent(
          latestContactListEvent,
          parsedContactList,
        )
      } catch (error) {
        persistFailed = true
        console.warn(
          'Contact list persistence failed during node expansion:',
          error,
        )
      }

      if (
        parsedContactList.followPubkeys.length === 0 &&
        cachedContactListBeforePersist &&
        cachedContactListBeforePersist.follows.length > 0
      ) {
        const cachePreviewMessage =
          buildContactListPartialMessage({
            discoveredFollowCount: cachedContactListBeforePersist.follows.length,
            diagnostics: [],
            rejectedPubkeyCount: 0,
            loadedFromCache: true,
          }) ??
          buildDiscoveredMessage(
            cachedContactListBeforePersist.follows.length,
            true,
            true,
          )
        setLoadingState(
          pubkey,
          'merging',
          4,
          'Integrando evidencia estructural recuperada...',
          startedAt,
        )
        const result = applyExpandedStructureEvidence(
          pubkey,
          cachedContactListBeforePersist.follows,
          [],
          {
            relayUrls,
            relayHints: cachedContactListBeforePersist.relayHints,
            authoredHasPartialSignals: true,
            inboundHasPartialSignals: false,
            authoredDiagnostics: [],
            authoredLoadedFromCache: true,
            previewMessage: cachePreviewMessage,
          },
        )
        scheduleReciprocalInboundEnrichment(
          pubkey,
          cachedContactListBeforePersist.follows,
          relayUrls,
        )
        scheduleDirectInboundEnrichment(pubkey, relayUrls)
        return result
      }

      setLoadingState(
        pubkey,
        'merging',
        4,
        'Integrando nodos y conexiones al grafo...',
        startedAt,
      )
      const result = applyExpandedStructureEvidence(
        pubkey,
        parsedContactList.followPubkeys,
        [],
        {
          relayUrls,
          relayHints: parsedContactList.relayHints,
          authoredHasPartialSignals:
            authoredRelayHadPartialSignals ||
            persistFailed ||
            parsedContactList.diagnostics.length > 0,
          inboundHasPartialSignals: false,
          authoredDiagnostics: parsedContactList.diagnostics,
        },
      )
      scheduleDirectInboundEnrichment(pubkey, relayUrls)
      scheduleReciprocalInboundEnrichment(
        pubkey,
        parsedContactList.followPubkeys,
        relayUrls,
      )
      return result
    } catch (error) {
      console.warn('Node expansion degraded to partial after failure:', error)
      const message = buildRecoverableExpansionMessage(pubkey, error)
      setTerminalState(pubkey, 'partial', message, startedAt)
      return {
        status: 'partial',
        discoveredFollowCount: 0,
        rejectedPubkeys: [],
        message,
      }
    } finally {
      adapter?.close()
    }
  }

  function applyExpandedStructureEvidence(
    pubkey: string,
    followPubkeys: string[],
    inboundFollowerPubkeys: string[],
    options: {
      relayUrls: string[]
      relayHints?: string[]
      authoredHasPartialSignals: boolean
      inboundHasPartialSignals: boolean
      authoredDiagnostics?: readonly { code: string }[]
      authoredLoadedFromCache?: boolean
      previewMessage?: string
    },
  ): ExpandNodeResult {
    const state = ctx.store.getState()
    const discoveredAt = ctx.now()
    const outboundNewNodes: GraphNode[] = followPubkeys
      .filter((followPubkey) => !state.nodes[followPubkey])
      .map((followPubkey) => ({
        pubkey: followPubkey,
        keywordHits: 0,
        discoveredAt,
        profileState: 'loading',
        source: 'follow' as const,
      }))

    const outboundNodeResult = state.upsertNodes(outboundNewNodes)
    const stateAfterOutboundNodes = ctx.store.getState()
    const inboundNewNodes: GraphNode[] = inboundFollowerPubkeys
      .filter((followerPubkey) => !stateAfterOutboundNodes.nodes[followerPubkey])
      .map((followerPubkey) => ({
        pubkey: followerPubkey,
        keywordHits: 0,
        discoveredAt,
        profileState: 'loading',
        source: 'inbound' as const,
      }))

    const inboundNodeResult = state.upsertNodes(inboundNewNodes)
    const freshState = ctx.store.getState()

    const newLinks: GraphLink[] = followPubkeys
      .filter(
        (followPubkey) =>
          outboundNodeResult.acceptedPubkeys.includes(followPubkey) ||
          freshState.nodes[followPubkey],
      )
      .map((followPubkey) => ({
        source: pubkey,
        target: followPubkey,
        relation: 'follow' as const,
      }))

    const newInboundLinks: GraphLink[] = inboundFollowerPubkeys
      .filter(
        (followerPubkey) =>
          inboundNodeResult.acceptedPubkeys.includes(followerPubkey) ||
          freshState.nodes[followerPubkey],
      )
      .filter((followerPubkey) => followerPubkey !== pubkey)
      .map((followerPubkey) => ({
        source: followerPubkey,
        target: pubkey,
        relation: 'inbound' as const,
      }))

    state.upsertLinks(newLinks)
    state.upsertInboundLinks(newInboundLinks)
    state.markNodeExpanded(pubkey)
    if (ctx.store.getState().selectedNodePubkey === pubkey) {
      ctx.store.getState().setSelectedNodePubkey(null)
      ctx.store.getState().setOpenPanel('overview')
    }
    collaborators.analysis.schedule()

    const loadSequence = collaborators.rootLoader.getLoadSequence()
    const profileHydrationRelayUrls = mergeBoundedRelayUrlSets(
      MAX_PROFILE_HYDRATION_RELAY_URLS,
      options.relayUrls,
      options.relayHints,
    )
    void collaborators.profileHydration.hydrateNodeProfiles(
      [pubkey, ...outboundNodeResult.acceptedPubkeys, ...inboundNodeResult.acceptedPubkeys],
      profileHydrationRelayUrls,
      () => collaborators.rootLoader.isStaleLoad(loadSequence),
      {
        persistProfileEvent: collaborators.persistence.persistProfileEvent,
      },
    ).catch((err) => {
      console.warn('Profile hydration failed after expansion:', err)
    })
    void collaborators.zapLayer.prefetchZapLayer(
      collaborators.zapLayer.getZapTargetPubkeys(),
      options.relayUrls,
    ).catch((err) => {
      console.warn('Zap layer prefetch failed after expansion:', err)
    })

    const rejectedPubkeys = Array.from(
      new Set([
        ...outboundNodeResult.rejectedPubkeys,
        ...inboundNodeResult.rejectedPubkeys,
      ]),
    )
    const discoveredFollowerCount = newInboundLinks.length
    const hasPartialSignals =
      options.authoredHasPartialSignals ||
      options.inboundHasPartialSignals ||
      rejectedPubkeys.length > 0
    const status =
      hasPartialSignals
        ? 'partial'
        : newLinks.length + discoveredFollowerCount === 0
          ? 'empty'
          : 'ready'
    const acceptedNodesCount =
      outboundNodeResult.acceptedPubkeys.length +
      inboundNodeResult.acceptedPubkeys.length
    const expansionMessage = buildExpandedStructureMessage({
      pubkey,
      discoveredFollowCount: followPubkeys.length,
      discoveredFollowerCount,
      hasPartialSignals,
      authoredDiagnostics: options.authoredDiagnostics ?? [],
      rejectedPubkeyCount: rejectedPubkeys.length,
      maxGraphNodes: state.graphCaps.maxNodes,
      authoredLoadedFromCache: options.authoredLoadedFromCache,
      acceptedNodesCount,
    })

    state.setNodeStructurePreviewState(pubkey, {
      status:
        followPubkeys.length === 0
          ? 'empty'
          : options.authoredHasPartialSignals || options.authoredLoadedFromCache
            ? 'partial'
            : 'ready',
      message: options.previewMessage ?? null,
      discoveredFollowCount: followPubkeys.length,
    })
    setTerminalState(pubkey, status, expansionMessage)

    ctx.emitter.emit({
      type: 'node-expanded',
      pubkey,
      followCount: followPubkeys.length,
    })

    return {
      status,
      discoveredFollowCount: followPubkeys.length,
      rejectedPubkeys,
      message: expansionMessage,
    }
  }

  return {
    expandNode,
  }
}

export type NodeExpansionModule = ReturnType<typeof createNodeExpansionModule>
