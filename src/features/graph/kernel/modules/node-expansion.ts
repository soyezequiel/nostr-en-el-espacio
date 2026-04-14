import type { Filter } from 'nostr-tools'

import type {
  GraphLink,
  GraphNode,
  NodeExpansionEnrichmentStatus,
  NodeExpansionPhase,
  NodeExpansionState,
  NodeExpansionStatus,
} from '@/features/graph/app/store'
import type { ExpandNodeResult } from '@/features/graph/kernel/runtime'
import type {
  KernelContext,
  RelayAdapterInstance,
} from '@/features/graph/kernel/modules/context'
import {
  MAX_SESSION_RELAYS,
  NODE_EXPAND_CONNECT_TIMEOUT_MS,
  NODE_EXPAND_INBOUND_QUERY_LIMIT,
  NODE_EXPAND_PAGE_TIMEOUT_MS,
  NODE_EXPAND_RETRY_COUNT,
  NODE_EXPAND_STRAGGLER_GRACE_MS,
} from '@/features/graph/kernel/modules/constants'
import {
  collectInboundFollowerEvidence,
  collectRelayEvents,
  collectTargetedReciprocalFollowerEvidence,
  mergeBoundedRelayUrlSets,
  planTargetedReciprocalFollowerEvidence,
  resolveAdaptiveReciprocalCandidateCap,
  selectLatestReplaceableEvent,
  selectLatestReplaceableEventsByPubkey,
  serializeContactListEvent,
  type InboundFollowerEvidence,
} from '@/features/graph/kernel/modules/helpers'
import type { AnalysisModule } from '@/features/graph/kernel/modules/analysis'
import type { PersistenceModule } from '@/features/graph/kernel/modules/persistence'
import type { ProfileHydrationModule } from '@/features/graph/kernel/modules/profile-hydration'
import type { RootLoaderModule } from '@/features/graph/kernel/modules/root-loader'
import type { KeywordLayerModule } from '@/features/graph/kernel/modules/keyword-layer'
import type { ZapLayerModule } from '@/features/graph/kernel/modules/zap-layer'
import type { NodeDetailModule } from '@/features/graph/kernel/modules/node-detail'
import {
  buildContactListPartialMessage,
  buildDiscoveredMessage,
  buildExpandedStructureMessage,
} from '@/features/graph/kernel/modules/text-helpers'

const NODE_EXPANSION_TOTAL_STEPS = 5
const NODE_EXPANSION_VISIBLE_MERGE_STEP = 4
const MAX_PROFILE_HYDRATION_RELAY_URLS = MAX_SESSION_RELAYS

interface ExpansionStructurePayload {
  followPubkeys: string[]
  relayHints?: string[]
  authoredHasPartialSignals: boolean
  authoredDiagnostics?: readonly { code: string }[]
  authoredLoadedFromCache?: boolean
  previewMessage?: string
}

interface MergeExpandedStructureResult {
  outboundAcceptedPubkeys: string[]
  inboundAcceptedPubkeys: string[]
  rejectedPubkeys: string[]
  newLinksCount: number
  newInboundLinksCount: number
  acceptedNodesCount: number
}

interface ExpansionOutcome {
  status: ExpandNodeResult['status']
  message: string
}

export function createNodeExpansionModule(
  ctx: KernelContext,
  collaborators: {
    analysis: AnalysisModule
    persistence: PersistenceModule
    profileHydration: ProfileHydrationModule
    rootLoader: RootLoaderModule
    keywordLayer: KeywordLayerModule
    zapLayer: ZapLayerModule
    nodeDetail: NodeDetailModule
  },
) {
  const activeNodeExpansionRequests = new Map<string, Promise<ExpandNodeResult>>()
  let nextExpansionRunId = 1

  const buildNodeExpansionState = (
    state: Partial<NodeExpansionState> & Pick<NodeExpansionState, 'status' | 'message'>,
  ): NodeExpansionState => ({
    phase: 'idle',
    step: null,
    totalSteps: null,
    startedAt: null,
    updatedAt: ctx.now(),
    runId: null,
    visibleStatus: 'idle',
    backgroundStatus: 'idle',
    visibleAppliedAt: null,
    enrichmentStatus: 'idle',
    enrichmentProcessedBatches: null,
    enrichmentTotalBatches: null,
    enrichmentProcessedCandidates: null,
    enrichmentTotalCandidates: null,
    enrichmentNewInboundCount: null,
    ...state,
  })

  const setNodeExpansionState = (
    pubkey: string,
    state: Partial<NodeExpansionState> & Pick<NodeExpansionState, 'status' | 'message'>,
  ) => {
    const currentState = ctx.store.getState().nodeExpansionStates[pubkey]
    const backgroundStatus =
      state.backgroundStatus ??
      state.enrichmentStatus ??
      currentState?.backgroundStatus ??
      currentState?.enrichmentStatus ??
      'idle'

    ctx.store.getState().setNodeExpansionState(
      pubkey,
      buildNodeExpansionState({
        ...currentState,
        ...state,
        visibleStatus:
          state.visibleStatus ??
          currentState?.visibleStatus ??
          (state.status === 'loading' ? 'loading' : 'idle'),
        backgroundStatus,
        enrichmentStatus: backgroundStatus,
        visibleAppliedAt:
          state.visibleAppliedAt === undefined
            ? currentState?.visibleAppliedAt ?? null
            : state.visibleAppliedAt,
      }),
    )
  }

  const setLoadingState = (
    pubkey: string,
    phase: Exclude<NodeExpansionPhase, 'idle'>,
    step: number,
    message: string,
    startedAt: number,
    runId: string,
  ) => {
    setNodeExpansionState(pubkey, {
      status: 'loading',
      message,
      phase,
      step,
      totalSteps: NODE_EXPANSION_TOTAL_STEPS,
      startedAt,
      runId,
      visibleStatus: 'loading',
      backgroundStatus: 'idle',
      visibleAppliedAt: null,
      enrichmentStatus: 'idle',
      enrichmentProcessedBatches: null,
      enrichmentTotalBatches: null,
      enrichmentProcessedCandidates: null,
      enrichmentTotalCandidates: null,
      enrichmentNewInboundCount: null,
    })
  }

  const setTerminalState = (
    pubkey: string,
    status: Exclude<NodeExpansionStatus, 'loading'>,
    message: string | null,
    startedAt: number | null = null,
    runId: string | null = null,
    backgroundStatus: NodeExpansionEnrichmentStatus | 'idle' = 'idle',
    enrichment: Partial<
      Pick<
        NodeExpansionState,
        | 'enrichmentProcessedBatches'
        | 'enrichmentTotalBatches'
        | 'enrichmentProcessedCandidates'
        | 'enrichmentTotalCandidates'
        | 'enrichmentNewInboundCount'
      >
    > = {},
    options: Partial<
      Pick<NodeExpansionState, 'visibleStatus' | 'visibleAppliedAt'>
    > = {},
  ) => {
    const currentState = ctx.store.getState().nodeExpansionStates[pubkey]
    setNodeExpansionState(pubkey, {
      status,
      message,
      phase: 'idle',
      step: null,
      totalSteps: null,
      startedAt,
      runId,
      visibleStatus:
        options.visibleStatus ??
        currentState?.visibleStatus ??
        (status === 'error' ? 'error' : 'idle'),
      backgroundStatus,
      enrichmentStatus: backgroundStatus,
      visibleAppliedAt:
        options.visibleAppliedAt === undefined
          ? currentState?.visibleAppliedAt ?? null
          : options.visibleAppliedAt,
      ...enrichment,
    })
  }

  const createRunId = () => `${ctx.now()}-${nextExpansionRunId++}`

  const isStaleRun = (pubkey: string, runId: string) => {
    const currentState = ctx.store.getState().nodeExpansionStates[pubkey]
    return !currentState || currentState.runId !== runId
  }

  const createExpansionAdapter = (relayUrls: string[]) =>
    ctx.createRelayAdapter({
      relayUrls,
      connectTimeoutMs: NODE_EXPAND_CONNECT_TIMEOUT_MS,
      pageTimeoutMs: NODE_EXPAND_PAGE_TIMEOUT_MS,
      retryCount: NODE_EXPAND_RETRY_COUNT,
      stragglerGraceMs: NODE_EXPAND_STRAGGLER_GRACE_MS,
    })

  const buildCachePreviewMessage = (pubkey: string, follows: readonly string[]) =>
    buildContactListPartialMessage({
      discoveredFollowCount: follows.length,
      diagnostics: [],
      rejectedPubkeyCount: 0,
      loadedFromCache: true,
    }) ??
    buildDiscoveredMessage(follows.length, true, true) ??
    `Sin lista de follows descubierta para ${pubkey.slice(0, 8)}...`

  const buildReciprocityProgressMessage = (input: {
    progress: {
      processedBatches: number
      totalBatches: number
      processedCandidates: number
      totalCandidates: number
      totalAvailableCandidates: number
      capped: boolean
    }
    newlyAddedInboundCount: number
  }) => {
    const { progress, newlyAddedInboundCount } = input
    const budgetCopy = progress.capped
      ? ` Se priorizan ${progress.totalCandidates} de ${progress.totalAvailableCandidates} candidatos por el presupuesto actual.`
      : ''
    return `Enriqueciendo reciprocidad en background: ${progress.processedCandidates}/${progress.totalCandidates} candidatos y ${progress.processedBatches}/${progress.totalBatches} batches verificados. ${newlyAddedInboundCount} inbound nuevos integrados.${budgetCopy}`
  }

  const buildReciprocityTerminalMessage = (input: {
    baseMessage: string
    mode: 'ready' | 'partial' | 'capped' | 'error'
    newlyAddedInboundCount: number
    progress: {
      processedCandidates: number
      totalCandidates: number
      totalAvailableCandidates: number
    }
    errorMessage?: string
  }) => {
    if (input.mode === 'ready') {
      return input.baseMessage
    }

    if (input.mode === 'error') {
      return `${input.baseMessage} Reciprocidad parcial: ${input.errorMessage ?? 'fallo el barrido reciproco en background.'} El grafo visible ya quedo integrado.`
    }

    if (input.mode === 'capped') {
      return `${input.baseMessage} Reciprocidad parcial: se verificaron ${input.progress.processedCandidates}/${input.progress.totalAvailableCandidates} candidatos priorizados por el presupuesto actual y se integraron ${input.newlyAddedInboundCount} inbound nuevos.`
    }

    return `${input.baseMessage} Reciprocidad parcial: se integraron ${input.newlyAddedInboundCount} inbound nuevos, pero quedaron batches con cobertura degradada.`
  }

  const buildExpandedStructureOutcome = (input: {
    pubkey: string
    discoveredFollowCount: number
    discoveredFollowerCount: number
    authoredHasPartialSignals: boolean
    inboundHasPartialSignals: boolean
    authoredDiagnostics?: readonly { code: string }[]
    authoredLoadedFromCache?: boolean
    rejectedPubkeys: readonly string[]
    acceptedNodesCount: number
    forcePartial?: boolean
  }): ExpansionOutcome => {
    const state = ctx.store.getState()
    const hasPartialSignals =
      input.forcePartial ||
      input.authoredHasPartialSignals ||
      input.inboundHasPartialSignals ||
      input.rejectedPubkeys.length > 0
    const hasAnyVisibleEvidence =
      input.discoveredFollowCount > 0 || input.discoveredFollowerCount > 0
    const status: ExpandNodeResult['status'] = hasAnyVisibleEvidence
      ? hasPartialSignals
        ? 'partial'
        : 'ready'
      : hasPartialSignals
        ? 'partial'
        : 'empty'

    return {
      status,
      message: buildExpandedStructureMessage({
        pubkey: input.pubkey,
        discoveredFollowCount: input.discoveredFollowCount,
        discoveredFollowerCount: input.discoveredFollowerCount,
        hasPartialSignals,
        authoredDiagnostics: input.authoredDiagnostics ?? [],
        rejectedPubkeyCount: input.rejectedPubkeys.length,
        maxGraphNodes: state.graphCaps.maxNodes,
        authoredLoadedFromCache: input.authoredLoadedFromCache,
        acceptedNodesCount: input.acceptedNodesCount,
      }),
    }
  }

  const updateNodeStructurePreviewState = (
    pubkey: string,
    payload: ExpansionStructurePayload,
  ) => {
    ctx.store.getState().setNodeStructurePreviewState(pubkey, {
      status:
        payload.followPubkeys.length === 0
          ? 'empty'
          : payload.authoredHasPartialSignals || payload.authoredLoadedFromCache
            ? 'partial'
            : 'ready',
      message: payload.previewMessage ?? null,
      discoveredFollowCount: payload.followPubkeys.length,
    })
  }

  const mergeExpandedStructureEvidence = (
    pubkey: string,
    followPubkeys: readonly string[],
    inboundFollowerPubkeys: readonly string[],
  ): MergeExpandedStructureResult => {
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
          Boolean(freshState.nodes[followPubkey]),
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
          Boolean(freshState.nodes[followerPubkey]),
      )
      .filter((followerPubkey) => followerPubkey !== pubkey)
      .map((followerPubkey) => ({
        source: followerPubkey,
        target: pubkey,
        relation: 'inbound' as const,
      }))

    state.upsertLinks(newLinks)
    state.upsertInboundLinks(newInboundLinks)

    return {
      outboundAcceptedPubkeys: outboundNodeResult.acceptedPubkeys,
      inboundAcceptedPubkeys: inboundNodeResult.acceptedPubkeys,
      rejectedPubkeys: Array.from(
        new Set([
          ...outboundNodeResult.rejectedPubkeys,
          ...inboundNodeResult.rejectedPubkeys,
        ]),
      ),
      newLinksCount: newLinks.length,
      newInboundLinksCount: newInboundLinks.length,
      acceptedNodesCount:
        outboundNodeResult.acceptedPubkeys.length +
        inboundNodeResult.acceptedPubkeys.length,
    }
  }

  const triggerPostMergeSideEffects = (input: {
    pubkey: string
    mergeResult: MergeExpandedStructureResult
    relayUrls: string[]
    relayHints?: string[]
    prefetchAncillaryLayers?: boolean
  }) => {
    const hasStructuralChanges =
      input.mergeResult.newLinksCount > 0 ||
      input.mergeResult.newInboundLinksCount > 0 ||
      input.mergeResult.acceptedNodesCount > 0

    if (hasStructuralChanges) {
      collaborators.analysis.schedule()
    }

    const loadSequence = collaborators.rootLoader.getLoadSequence()
    const profileHydrationRelayUrls = mergeBoundedRelayUrlSets(
      MAX_PROFILE_HYDRATION_RELAY_URLS,
      input.relayUrls,
      input.relayHints,
    )
    void collaborators.profileHydration
      .hydrateNodeProfiles(
        [
          input.pubkey,
          ...input.mergeResult.outboundAcceptedPubkeys,
          ...input.mergeResult.inboundAcceptedPubkeys,
        ],
        profileHydrationRelayUrls,
        () => collaborators.rootLoader.isStaleLoad(loadSequence),
        {
          persistProfileEvent: collaborators.persistence.persistProfileEvent,
        },
      )
      .catch((err) => {
        console.warn('Profile hydration failed after expansion:', err)
      })

    if (!input.prefetchAncillaryLayers) {
      return
    }

    void collaborators.zapLayer
      .prefetchZapLayer(
        collaborators.zapLayer.getZapTargetPubkeys(),
        input.relayUrls,
      )
      .catch((err) => {
        console.warn('Zap layer prefetch failed after expansion:', err)
      })
    void collaborators.keywordLayer
      .prefetchKeywordCorpus(
        collaborators.keywordLayer.getKeywordCorpusTargetPubkeys(),
        input.relayUrls,
      )
      .catch((err) => {
        console.warn('Keyword corpus prefetch failed after expansion:', err)
      })
  }
  const startBackgroundReciprocityEnrichment = (input: {
    pubkey: string
    runId: string
    startedAt: number
    visibleAppliedAt: number
    adapter: RelayAdapterInstance
    relayUrls: string[]
    structure: ExpansionStructurePayload
    visibleResult: MergeExpandedStructureResult
    basicInboundEvidence: InboundFollowerEvidence
  }) => {
    const stateSnapshot = ctx.store.getState()
    const candidateCap = resolveAdaptiveReciprocalCandidateCap({
      currentNodeCount: Object.keys(stateSnapshot.nodes).length,
      maxGraphNodes: stateSnapshot.graphCaps.maxNodes,
      effectiveGraphMaxNodes: stateSnapshot.effectiveGraphCaps.maxNodes,
      devicePerformanceProfile: stateSnapshot.devicePerformanceProfile,
    })
    const existingGraphPubkeys = new Set(Object.keys(stateSnapshot.nodes))
    const candidatePlan = planTargetedReciprocalFollowerEvidence({
      followPubkeys: input.structure.followPubkeys,
      targetPubkey: input.pubkey,
      existingGraphPubkeys,
      candidateCap,
    })

    if (candidatePlan.totalCandidates === 0) {
      input.adapter.close()
      return null
    }

    setNodeExpansionState(input.pubkey, {
      status: 'partial',
      message: buildReciprocityProgressMessage({
        progress: candidatePlan,
        newlyAddedInboundCount: 0,
      }),
      phase: 'idle',
      step: null,
      totalSteps: null,
      startedAt: input.startedAt,
      runId: input.runId,
      visibleStatus: 'ready',
      backgroundStatus: 'loading',
      visibleAppliedAt: input.visibleAppliedAt,
      enrichmentStatus: 'loading',
      enrichmentProcessedBatches: 0,
      enrichmentTotalBatches: candidatePlan.totalBatches,
      enrichmentProcessedCandidates: 0,
      enrichmentTotalCandidates: candidatePlan.totalCandidates,
      enrichmentNewInboundCount: 0,
    })

    void (async () => {
      let newlyAddedInboundCount = 0
      const rejectedPubkeys = new Set(input.visibleResult.rejectedPubkeys)
      let partialSignals = input.basicInboundEvidence.partial

      try {
        const finalReciprocalEvidence = await collectTargetedReciprocalFollowerEvidence({
          adapter: input.adapter,
          eventsWorker: ctx.eventsWorker,
          followPubkeys: input.structure.followPubkeys,
          targetPubkey: input.pubkey,
          existingGraphPubkeys,
          candidateCap,
          onBatchComplete: async ({ followerPubkeys, partial, progress }) => {
            if (isStaleRun(input.pubkey, input.runId)) {
              return
            }

            partialSignals = partialSignals || partial
            if (followerPubkeys.length > 0) {
              const batchResult = mergeExpandedStructureEvidence(
                input.pubkey,
                [],
                followerPubkeys,
              )
              newlyAddedInboundCount += batchResult.newInboundLinksCount
              batchResult.rejectedPubkeys.forEach((pubkey) => rejectedPubkeys.add(pubkey))
              triggerPostMergeSideEffects({
                pubkey: input.pubkey,
                mergeResult: batchResult,
                relayUrls: input.relayUrls,
                relayHints: input.structure.relayHints,
                prefetchAncillaryLayers: false,
              })
            }

            if (isStaleRun(input.pubkey, input.runId)) {
              return
            }

            setNodeExpansionState(input.pubkey, {
              status: 'partial',
              message: buildReciprocityProgressMessage({
                progress,
                newlyAddedInboundCount,
              }),
              phase: 'idle',
              step: null,
              totalSteps: null,
              startedAt: input.startedAt,
              runId: input.runId,
              visibleStatus: 'ready',
              backgroundStatus: 'loading',
              visibleAppliedAt: input.visibleAppliedAt,
              enrichmentStatus: 'loading',
              enrichmentProcessedBatches: progress.processedBatches,
              enrichmentTotalBatches: progress.totalBatches,
              enrichmentProcessedCandidates: progress.processedCandidates,
              enrichmentTotalCandidates: progress.totalCandidates,
              enrichmentNewInboundCount: newlyAddedInboundCount,
            })
          },
        })

        if (isStaleRun(input.pubkey, input.runId)) {
          return
        }

        partialSignals = partialSignals || finalReciprocalEvidence.partial
        const finalOutcome = buildExpandedStructureOutcome({
          pubkey: input.pubkey,
          discoveredFollowCount: input.structure.followPubkeys.length,
          discoveredFollowerCount:
            input.visibleResult.newInboundLinksCount + newlyAddedInboundCount,
          authoredHasPartialSignals: input.structure.authoredHasPartialSignals,
          inboundHasPartialSignals:
            partialSignals || finalReciprocalEvidence.capped,
          authoredDiagnostics: input.structure.authoredDiagnostics,
          authoredLoadedFromCache: input.structure.authoredLoadedFromCache,
          rejectedPubkeys: Array.from(rejectedPubkeys),
          acceptedNodesCount: input.visibleResult.acceptedNodesCount,
        })

        const terminalMode = finalReciprocalEvidence.hadError
          ? 'error'
          : finalReciprocalEvidence.capped
          ? 'capped'
          : finalOutcome.status === 'ready'
            ? 'ready'
            : 'partial'
        const enrichmentStatus = finalReciprocalEvidence.hadError
          ? 'error'
          : finalReciprocalEvidence.capped
          ? 'capped'
          : finalOutcome.status === 'ready'
            ? 'ready'
            : 'partial'

        setTerminalState(
          input.pubkey,
          finalOutcome.status,
          buildReciprocityTerminalMessage({
            baseMessage: finalOutcome.message,
            mode: terminalMode,
            newlyAddedInboundCount,
            progress: finalReciprocalEvidence,
          }),
          input.startedAt,
          input.runId,
          enrichmentStatus,
          {
            enrichmentProcessedBatches: finalReciprocalEvidence.processedBatches,
            enrichmentTotalBatches: finalReciprocalEvidence.totalBatches,
            enrichmentProcessedCandidates: finalReciprocalEvidence.processedCandidates,
            enrichmentTotalCandidates: finalReciprocalEvidence.totalCandidates,
            enrichmentNewInboundCount: newlyAddedInboundCount,
          },
          {
            visibleStatus: 'ready',
            visibleAppliedAt: input.visibleAppliedAt,
          },
        )
      } catch (error) {
        if (isStaleRun(input.pubkey, input.runId)) {
          return
        }

        const currentState = ctx.store.getState().nodeExpansionStates[input.pubkey]
        const finalOutcome = buildExpandedStructureOutcome({
          pubkey: input.pubkey,
          discoveredFollowCount: input.structure.followPubkeys.length,
          discoveredFollowerCount:
            input.visibleResult.newInboundLinksCount + newlyAddedInboundCount,
          authoredHasPartialSignals: input.structure.authoredHasPartialSignals,
          inboundHasPartialSignals: true,
          authoredDiagnostics: input.structure.authoredDiagnostics,
          authoredLoadedFromCache: input.structure.authoredLoadedFromCache,
          rejectedPubkeys: Array.from(rejectedPubkeys),
          acceptedNodesCount: input.visibleResult.acceptedNodesCount,
          forcePartial: true,
        })

        setTerminalState(
          input.pubkey,
          'partial',
          buildReciprocityTerminalMessage({
            baseMessage: finalOutcome.message,
            mode: 'error',
            newlyAddedInboundCount,
            progress: {
              processedCandidates:
                currentState?.enrichmentProcessedCandidates ?? 0,
              totalCandidates:
                currentState?.enrichmentTotalCandidates ??
                candidatePlan.totalCandidates,
              totalAvailableCandidates: candidatePlan.totalAvailableCandidates,
            },
            errorMessage:
              error instanceof Error && error.message.trim().length > 0
                ? error.message
                : 'fallo la correlacion reciproca en background.',
          }),
          input.startedAt,
          input.runId,
          'error',
          {
            enrichmentProcessedBatches:
              currentState?.enrichmentProcessedBatches ?? 0,
            enrichmentTotalBatches: candidatePlan.totalBatches,
            enrichmentProcessedCandidates:
              currentState?.enrichmentProcessedCandidates ?? 0,
            enrichmentTotalCandidates: candidatePlan.totalCandidates,
            enrichmentNewInboundCount: newlyAddedInboundCount,
          },
          {
            visibleStatus: 'ready',
            visibleAppliedAt: input.visibleAppliedAt,
          },
        )
      } finally {
        input.adapter.close()
      }
    })()

    return true
  }

  const applyVisibleExpansion = (input: {
    pubkey: string
    runId: string
    startedAt: number
    relayUrls: string[]
    structure: ExpansionStructurePayload
    inboundFollowerEvidence: InboundFollowerEvidence
    adapter?: RelayAdapterInstance
  }): ExpandNodeResult => {
    const visibleResult = mergeExpandedStructureEvidence(
      input.pubkey,
      input.structure.followPubkeys,
      input.inboundFollowerEvidence.followerPubkeys,
    )
    const baseOutcome = buildExpandedStructureOutcome({
      pubkey: input.pubkey,
      discoveredFollowCount: input.structure.followPubkeys.length,
      discoveredFollowerCount: visibleResult.newInboundLinksCount,
      authoredHasPartialSignals: input.structure.authoredHasPartialSignals,
      inboundHasPartialSignals: input.inboundFollowerEvidence.partial,
      authoredDiagnostics: input.structure.authoredDiagnostics,
      authoredLoadedFromCache: input.structure.authoredLoadedFromCache,
      rejectedPubkeys: visibleResult.rejectedPubkeys,
      acceptedNodesCount: visibleResult.acceptedNodesCount,
    })

    ctx.store.getState().markNodeExpanded(input.pubkey)
    const visibleAppliedAt = ctx.now()
    updateNodeStructurePreviewState(input.pubkey, input.structure)
    triggerPostMergeSideEffects({
      pubkey: input.pubkey,
      mergeResult: visibleResult,
      relayUrls: input.relayUrls,
      relayHints: input.structure.relayHints,
      prefetchAncillaryLayers: true,
    })
    ctx.emitter.emit({
      type: 'node-expanded',
      pubkey: input.pubkey,
      followCount: input.structure.followPubkeys.length,
    })

    const startedBackgroundEnrichment =
      input.adapter && input.structure.followPubkeys.length > 0
        ? startBackgroundReciprocityEnrichment({
            pubkey: input.pubkey,
            runId: input.runId,
            startedAt: input.startedAt,
            visibleAppliedAt,
            adapter: input.adapter,
            relayUrls: input.relayUrls,
            structure: input.structure,
            visibleResult,
            basicInboundEvidence: input.inboundFollowerEvidence,
          })
        : null

    if (startedBackgroundEnrichment) {
      return {
        status: 'partial',
        discoveredFollowCount: input.structure.followPubkeys.length,
        rejectedPubkeys: visibleResult.rejectedPubkeys,
        message:
          ctx.store.getState().nodeExpansionStates[input.pubkey]?.message ??
          baseOutcome.message,
      }
    }

    setTerminalState(
      input.pubkey,
      baseOutcome.status,
      baseOutcome.message,
      input.startedAt,
      input.runId,
      'idle',
      {},
      {
        visibleStatus: 'ready',
        visibleAppliedAt,
      },
    )

    return {
      status: baseOutcome.status,
      discoveredFollowCount: input.structure.followPubkeys.length,
      rejectedPubkeys: visibleResult.rejectedPubkeys,
      message: baseOutcome.message,
    }
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
    const currentExpansionState = state.nodeExpansionStates[pubkey]

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
      const inFlightEnrichment =
        currentExpansionState?.backgroundStatus === 'loading' ||
        currentExpansionState?.enrichmentStatus === 'loading'
      const message =
        currentExpansionState?.message ??
        `Nodo ${pubkey.slice(0, 8)}... ya fue expandido.`

      if (inFlightEnrichment) {
        return {
          status: 'partial',
          discoveredFollowCount:
            state.adjacency[pubkey]?.length ??
            state.nodeStructurePreviewStates?.[pubkey]?.discoveredFollowCount ??
            0,
          rejectedPubkeys: [],
          message,
        }
      }

      setTerminalState(
        pubkey,
        'ready',
        message,
        currentExpansionState?.startedAt ?? null,
        currentExpansionState?.runId ?? null,
        currentExpansionState?.backgroundStatus ??
          currentExpansionState?.enrichmentStatus ??
          'idle',
        {
          enrichmentProcessedBatches:
            currentExpansionState?.enrichmentProcessedBatches ?? null,
          enrichmentTotalBatches:
            currentExpansionState?.enrichmentTotalBatches ?? null,
          enrichmentProcessedCandidates:
            currentExpansionState?.enrichmentProcessedCandidates ?? null,
          enrichmentTotalCandidates:
            currentExpansionState?.enrichmentTotalCandidates ?? null,
          enrichmentNewInboundCount:
            currentExpansionState?.enrichmentNewInboundCount ?? null,
        },
        {
          visibleStatus: 'ready',
          visibleAppliedAt: currentExpansionState?.visibleAppliedAt ?? null,
        },
      )
      return {
        status: 'ready',
        discoveredFollowCount: state.adjacency[pubkey]?.length ?? 0,
        rejectedPubkeys: [],
        message,
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
    const runId = createRunId()
    setLoadingState(
      pubkey,
      'preparing',
      1,
      'Preparando expansion del vecindario seleccionado...',
      startedAt,
      runId,
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
        runId,
      )
      const cachedContactList = await ctx.repositories.contactLists.get(pubkey)
      if (cachedContactList) {
        const adapter = createExpansionAdapter(relayUrls)
        setLoadingState(
          pubkey,
          'merging',
          NODE_EXPANSION_VISIBLE_MERGE_STEP,
          'Integrando follows recuperados desde cache local...',
          startedAt,
          runId,
        )
        return applyVisibleExpansion({
          pubkey,
          runId,
          startedAt,
          relayUrls,
          structure: {
            followPubkeys: cachedContactList.follows,
            relayHints: cachedContactList.relayHints,
            authoredHasPartialSignals: true,
            authoredDiagnostics: [],
            authoredLoadedFromCache: true,
            previewMessage: buildCachePreviewMessage(
              pubkey,
              cachedContactList.follows,
            ),
          },
          inboundFollowerEvidence: {
            followerPubkeys: [],
            partial: false,
          },
          adapter,
        })
      }
    }

    const adapter = createExpansionAdapter(relayUrls)
    let adapterHandedOffToBackground = false

    try {
      setLoadingState(
        pubkey,
        'fetching-structure',
        2,
        'Consultando relays activos para recuperar follows y followers...',
        startedAt,
        runId,
      )
      const [contactListResult, inboundFollowerResult] = await Promise.all([
        collectRelayEvents(adapter, [
          { authors: [pubkey], kinds: [3] } satisfies Filter,
        ]),
        collectRelayEvents(adapter, [
          {
            kinds: [3],
            '#p': [pubkey],
            limit: NODE_EXPAND_INBOUND_QUERY_LIMIT,
          } satisfies Filter & { '#p': string[] },
        ]),
      ])

      setLoadingState(
        pubkey,
        'correlating-followers',
        3,
        'Correlacionando followers entrantes y validando evidencia basica...',
        startedAt,
        runId,
      )
      const inboundFollowerEvidence = await collectInboundFollowerEvidence(
        ctx.eventsWorker,
        selectLatestReplaceableEventsByPubkey(inboundFollowerResult.events),
        pubkey,
      )
      const latestContactListEvent = selectLatestReplaceableEvent(contactListResult.events)

      let structure: ExpansionStructurePayload | null = null

      if (!latestContactListEvent) {
        let cachedContactList = await ctx.repositories.contactLists.get(pubkey)
        if (!cachedContactList) {
          const activePreviewRequest =
            collaborators.nodeDetail.getActivePreviewRequest(pubkey)
          if (activePreviewRequest) {
            await activePreviewRequest
            cachedContactList = await ctx.repositories.contactLists.get(pubkey)
          }
        }

        if (cachedContactList) {
          structure = {
            followPubkeys: cachedContactList.follows,
            relayHints: cachedContactList.relayHints,
            authoredHasPartialSignals: true,
            authoredDiagnostics: [],
            authoredLoadedFromCache: true,
            previewMessage: buildCachePreviewMessage(
              pubkey,
              cachedContactList.follows,
            ),
          }
        } else {
          structure = {
            followPubkeys: [],
            authoredHasPartialSignals: false,
            authoredDiagnostics: [],
            previewMessage: `Sin lista de follows descubierta para ${pubkey.slice(0, 8)}...`,
          }
        }
      } else {
        const parsedContactList = await ctx.eventsWorker.invoke('PARSE_CONTACT_LIST', {
          event: serializeContactListEvent(latestContactListEvent.event),
        })

        const cachedContactListBeforePersist =
          parsedContactList.followPubkeys.length === 0
            ? await ctx.repositories.contactLists.get(pubkey)
            : null

        await collaborators.persistence.persistContactListEvent(
          latestContactListEvent,
          parsedContactList,
        )

        if (
          parsedContactList.followPubkeys.length === 0 &&
          cachedContactListBeforePersist &&
          cachedContactListBeforePersist.follows.length > 0
        ) {
          structure = {
            followPubkeys: cachedContactListBeforePersist.follows,
            relayHints: cachedContactListBeforePersist.relayHints,
            authoredHasPartialSignals: true,
            authoredDiagnostics: [],
            authoredLoadedFromCache: true,
            previewMessage: buildCachePreviewMessage(
              pubkey,
              cachedContactListBeforePersist.follows,
            ),
          }
        } else {
          structure = {
            followPubkeys: parsedContactList.followPubkeys,
            relayHints: parsedContactList.relayHints,
            authoredHasPartialSignals: parsedContactList.diagnostics.length > 0,
            authoredDiagnostics: parsedContactList.diagnostics,
            previewMessage:
              parsedContactList.followPubkeys.length > 0
                ? undefined
                : `Sin lista de follows descubierta para ${pubkey.slice(0, 8)}...`,
          }
        }
      }

      if (!structure) {
        throw new Error('No se pudo resolver la estructura visible para esta expansion.')
      }

      setLoadingState(
        pubkey,
        'merging',
        NODE_EXPANSION_VISIBLE_MERGE_STEP,
        'Integrando nodos y conexiones visibles al grafo...',
        startedAt,
        runId,
      )

      const result = applyVisibleExpansion({
        pubkey,
        runId,
        startedAt,
        relayUrls,
        structure,
        inboundFollowerEvidence: {
          followerPubkeys: inboundFollowerEvidence.followerPubkeys,
          partial:
            inboundFollowerEvidence.partial || inboundFollowerResult.error !== null,
        },
        adapter,
      })
      adapterHandedOffToBackground = result.status === 'partial'
      return result
    } catch (error) {
      setTerminalState(
        pubkey,
        'error',
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'No se pudo expandir este nodo.',
        startedAt,
        runId,
        'error',
      )
      throw error
    } finally {
      if (!adapterHandedOffToBackground) {
        adapter.close()
      }
    }
  }

  return {
    expandNode,
  }
}

export type NodeExpansionModule = ReturnType<typeof createNodeExpansionModule>
