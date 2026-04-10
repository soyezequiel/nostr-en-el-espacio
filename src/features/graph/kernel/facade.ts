import { createKernelEventEmitter } from '@/features/graph/kernel/events'
import type { AppKernelDependencies } from '@/features/graph/kernel/modules/context'
import { createAnalysisModule } from '@/features/graph/kernel/modules/analysis'
import { createExportModule } from '@/features/graph/kernel/modules/export-orch'
import { createKeywordLayerModule } from '@/features/graph/kernel/modules/keyword-layer'
import { createNodeDetailModule } from '@/features/graph/kernel/modules/node-detail'
import { createNodeExpansionModule } from '@/features/graph/kernel/modules/node-expansion'
import { createPersistenceModule } from '@/features/graph/kernel/modules/persistence'
import { createProfileHydrationModule } from '@/features/graph/kernel/modules/profile-hydration'
import { createRelaySessionModule } from '@/features/graph/kernel/modules/relay-session'
import { createRootLoaderModule } from '@/features/graph/kernel/modules/root-loader'
import { createZapLayerModule } from '@/features/graph/kernel/modules/zap-layer'
import type { RootLoader, ToggleLayerResult } from '@/features/graph/kernel/runtime'
import type { UiLayer } from '@/features/graph/app/store'

export function createKernelFacade(dependencies: AppKernelDependencies) {
  const emitter = createKernelEventEmitter()
  const ctx = {
    ...dependencies,
    defaultRelayUrls: dependencies.defaultRelayUrls?.slice() ?? [],
    now: dependencies.now ?? (() => Date.now()),
    emitter,
  }

  const analysis = createAnalysisModule(ctx)
  const profileHydration = createProfileHydrationModule(ctx)
  const persistence = createPersistenceModule(ctx, { profileHydration })
  const exportOrch = createExportModule(ctx)
  const relaySession = createRelaySessionModule(ctx)
  const keywordLayer = createKeywordLayerModule(ctx, { persistence })
  const nodeDetail = createNodeDetailModule(ctx, {
    persistence,
    profileHydration,
  })

  const rootLoaderRef = {
    isStaleLoad(loadId: number) {
      return rootLoader.isStaleLoad(loadId)
    },
    getLoadSequence() {
      return rootLoader.getLoadSequence()
    },
  }

  const zapLayerRef = {
    cancelActiveZapLoad() {
      zapLayer.cancelActiveZapLoad()
    },
    getZapTargetPubkeys() {
      return zapLayer.getZapTargetPubkeys()
    },
    prefetchZapLayer(targetPubkeys: string[], relayUrls: string[]) {
      return zapLayer.prefetchZapLayer(targetPubkeys, relayUrls)
    },
  }

  const rootLoader = createRootLoaderModule(ctx, {
    analysis,
    persistence,
    profileHydration,
    relaySession,
    keywordLayer,
    zapLayer: zapLayerRef,
  })

  const zapLayer = createZapLayerModule(ctx, {
    analysis,
    persistence,
    profileHydration,
    relaySession,
    rootLoader: rootLoaderRef,
    keywordLayer,
  })

  relaySession.bindLoadRoot(rootLoader.loadRoot)

  const nodeExpansion = createNodeExpansionModule(ctx, {
    analysis,
    persistence,
    profileHydration,
    rootLoader,
    keywordLayer,
    zapLayer,
    nodeDetail,
  })

  function toggleLayer(layer: UiLayer): ToggleLayerResult {
    const state = ctx.store.getState()
    const previousLayer = state.activeLayer

    if (layer === 'zaps' && state.zapLayer.status !== 'enabled') {
      return {
        previousLayer,
        activeLayer: previousLayer,
        message: state.zapLayer.message ?? 'La capa de zaps no esta disponible todavia.',
      }
    }

    if (layer === 'connections' && previousLayer !== 'connections') {
      state.setConnectionsSourceLayer(previousLayer)
    }

    state.setActiveLayer(layer)

    return {
      previousLayer,
      activeLayer: layer,
      message:
        layer === 'zaps'
          ? state.zapLayer.message
          : layer === 'keywords'
            ? state.keywordLayer.message
            : null,
    }
  }

  async function settleBackgroundTasks(): Promise<void> {
    let attempts = 0

    while (
      attempts < 20 &&
      (analysis.isInFlight() ||
        analysis.isFlushScheduled() ||
        keywordLayer.isCorpusInFlight())
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      attempts += 1
    }
  }

  function getState() {
    return ctx.store.getState()
  }

  function dispose(): void {
    relaySession.flushPendingRelayHealth()
    rootLoader.cancelActiveLoad()
    zapLayer.cancelActiveZapLoad()
    keywordLayer.cancelActiveKeywordLoad()
    ctx.eventsWorker.dispose()
    ctx.graphWorker.dispose()
  }

  const facade = {
    loadRoot: rootLoader.loadRoot,
    reconfigureRelays: relaySession.reconfigureRelays,
    revertRelayOverride: relaySession.revertRelayOverride,
    expandNode: nodeExpansion.expandNode,
    searchKeyword: keywordLayer.searchKeyword,
    toggleLayer,
    findPath: nodeDetail.findPath,
    selectNode: nodeDetail.selectNode,
    getNodeDetail: nodeDetail.getNodeDetail,
    exportSnapshot: exportOrch.exportSnapshot,
    downloadDiscoveredProfilePhotos: exportOrch.downloadDiscoveredProfilePhotos,
    settleBackgroundTasks,
    getState,
    dispose,
    on: emitter.on,
  } satisfies RootLoader & {
    exportSnapshot: typeof exportOrch.exportSnapshot
    downloadDiscoveredProfilePhotos: typeof exportOrch.downloadDiscoveredProfilePhotos
    settleBackgroundTasks: typeof settleBackgroundTasks
    getState: typeof getState
    dispose: typeof dispose
    on: typeof emitter.on
  }

  return facade
}

export type KernelFacade = ReturnType<typeof createKernelFacade>
