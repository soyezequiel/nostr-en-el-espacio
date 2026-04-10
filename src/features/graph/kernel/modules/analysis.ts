import { createDiscoveredGraphAnalysisKey } from '@/features/graph/analysis/analysisKey'
import type { AnalyzeDiscoveredGraphRequest } from '@/features/graph/workers/graph/contracts'
import type { KernelContext } from '@/features/graph/kernel/modules/context'
import { DISCOVERED_GRAPH_ANALYSIS_LOADING_MESSAGE } from '@/features/graph/kernel/modules/constants'
import { buildDiscoveredGraphAnalysisMessage } from '@/features/graph/kernel/modules/text-helpers'

export function createAnalysisModule(ctx: KernelContext) {
  let analysisFlushScheduled = false
  let analysisInFlight = false
  let analysisScheduleVersion = 0

  function schedule(): void {
    analysisScheduleVersion += 1

    if (analysisFlushScheduled) {
      return
    }

    analysisFlushScheduled = true
    queueMicrotask(() => {
      analysisFlushScheduled = false
      void flush()
    })
  }

  async function flush(): Promise<void> {
    if (analysisInFlight) {
      return
    }

    const request = buildRequest()
    if (!request) {
      ctx.store.getState().resetGraphAnalysis()
      return
    }

    const state = ctx.store.getState()
    if (
      state.graphAnalysis.analysisKey === request.analysisKey &&
      !state.graphAnalysis.isStale &&
      (state.graphAnalysis.status === 'ready' ||
        state.graphAnalysis.status === 'partial')
    ) {
      return
    }

    const scheduledVersion = analysisScheduleVersion
    state.setGraphAnalysisLoading(
      request.analysisKey,
      DISCOVERED_GRAPH_ANALYSIS_LOADING_MESSAGE,
    )

    analysisInFlight = true

    try {
      const result = await ctx.graphWorker.invoke(
        'ANALYZE_DISCOVERED_GRAPH',
        request,
      )

      if (scheduledVersion !== analysisScheduleVersion) {
        return
      }

      const nextStatus =
        result.mode === 'heuristic' ||
        result.confidence !== 'high' ||
        result.flags.length > 0
          ? 'partial'
          : 'ready'

      ctx.store.getState().setGraphAnalysisResult(
        result,
        nextStatus,
        buildDiscoveredGraphAnalysisMessage(result),
      )
      ctx.emitter.emit({
        type: 'analysis-ready',
        analysisKey: request.analysisKey,
      })
    } catch (error) {
      if (scheduledVersion !== analysisScheduleVersion) {
        return
      }

      ctx.store.getState().setGraphAnalysisError(
        request.analysisKey,
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'No se pudo actualizar la agrupacion del vecindario descubierto.',
      )
    } finally {
      analysisInFlight = false

      if (scheduledVersion !== analysisScheduleVersion) {
        schedule()
      }
    }
  }

  function buildRequest(): AnalyzeDiscoveredGraphRequest | null {
    const state = ctx.store.getState()
    const nodeEntries = Object.values(state.nodes)
      .map((node) => ({
        pubkey: node.pubkey,
        source: node.source,
      }))
      .sort((left, right) => left.pubkey.localeCompare(right.pubkey))
    const sortedLinks = state.links
      .map((link) => ({
        source: link.source,
        target: link.target,
        relation: link.relation,
      }))
      .sort((left, right) => {
        if (left.source !== right.source) {
          return left.source.localeCompare(right.source)
        }

        if (left.target !== right.target) {
          return left.target.localeCompare(right.target)
        }

        return left.relation.localeCompare(right.relation)
      })
    const relayHealth = Object.fromEntries(
      Object.entries(state.relayHealth)
        .sort(([leftRelayUrl], [rightRelayUrl]) =>
          leftRelayUrl.localeCompare(rightRelayUrl),
        )
        .map(([relayUrl, health]) => [
          relayUrl,
          {
            status: health.status,
          },
        ]),
    )

    if (!state.rootNodePubkey || nodeEntries.length === 0) {
      return null
    }

    return {
      analysisKey: createDiscoveredGraphAnalysisKey({
        nodes: state.nodes,
        links: state.links,
        rootNodePubkey: state.rootNodePubkey,
        capReached: state.graphCaps.capReached,
        isGraphStale: state.isGraphStale,
        relayHealth: state.relayHealth,
      }),
      nodes: nodeEntries,
      links: sortedLinks,
      rootNodePubkey: state.rootNodePubkey,
      capReached: state.graphCaps.capReached,
      isGraphStale: state.isGraphStale,
      relayHealth,
    }
  }

  return {
    schedule,
    flush,
    isInFlight: () => analysisInFlight,
    isFlushScheduled: () => analysisFlushScheduled,
  }
}

export type AnalysisModule = ReturnType<typeof createAnalysisModule>
