import type { AvatarRuntimeStateDebugSnapshot } from '@/features/graph-v2/renderer/avatar/avatarDebug'
import type { VisibleProfileWarmupDebugSnapshot } from '@/features/graph-v2/ui/visibleProfileWarmup'

export interface AvatarRuntimeDebugBrowserSnapshot {
  userAgent: string
  language?: string
  devicePixelRatio: number
  viewport: {
    width: number
    height: number
  }
}

export interface AvatarRuntimeDebugLocationSnapshot {
  pathname: string
  search: string
}

export interface AvatarRuntimeDebugPayloadInput {
  generatedAt: string
  debugFileName: string
  state: AvatarRuntimeStateDebugSnapshot
  profileWarmup?: VisibleProfileWarmupDebugSnapshot | null
  browser?: AvatarRuntimeDebugBrowserSnapshot
  location?: AvatarRuntimeDebugLocationSnapshot
}

export const isAvatarRuntimeDebugDownloadEnabled = (
  nodeEnv = readNodeEnv(),
) => nodeEnv === 'development'

export const buildAvatarRuntimeDebugFilename = (stamp: string) =>
  `sigma-avatar-runtime-${stamp}.debug.json`

export const buildAvatarRuntimeDebugPayload = ({
  generatedAt,
  debugFileName,
  state,
  profileWarmup,
  browser,
  location,
}: AvatarRuntimeDebugPayloadInput) => {
  const overlay = state.overlay
  const cache = state.cache
  const scheduler = state.scheduler
  const loader = state.loader
  const cacheRecentEvents = cache?.recentEvents ?? []
  const failedReasons = Object.fromEntries(
    Object.entries(
      (cache?.entries ?? []).reduce<Record<string, number>>((acc, entry) => {
        if (entry.state !== 'failed') {
          return acc
        }
        const key = entry.reason ?? 'cache_failed'
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      }, {}),
    ).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  )
  const blockedReasons = Object.fromEntries(
    Object.entries(
      (loader?.blocked ?? []).reduce<Record<string, number>>((acc, entry) => {
        const key = entry.reason ?? 'blocked'
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      }, {}),
    ).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  )
  const readyLossEvents = cacheRecentEvents.filter(
    (event) => event.previousState === 'ready' && event.nextState !== 'ready',
  )
  const readyLossSummary = Object.fromEntries(
    Object.entries(
      readyLossEvents.reduce<Record<string, number>>((acc, event) => {
        const key =
          event.type === 'clear'
            ? 'clear'
            : `${event.type}:${event.reason ?? 'none'}`
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      }, {}),
    ).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  )

  const latency = buildAvatarRuntimeLatencyDebug({
    state,
    profileWarmup,
  })

  return {
    schemaVersion: 3,
    type: 'sigma-avatar-runtime-debug',
    generatedAt,
    environment: {
      nodeEnv: readNodeEnv() ?? null,
      devOnly: true,
    },
    surface: {
      route: '/labs/sigma',
      debugFileName,
      location: location ?? null,
      rootPubkey: state.rootPubkey,
      selectedNodePubkey: state.selectedNodePubkey,
      viewport: state.viewport,
      camera: state.camera,
      physicsRunning: state.physicsRunning,
      motionActive: state.motionActive,
      hideAvatarsOnMove: state.hideAvatarsOnMove,
    },
    browser: browser ?? null,
    counts: {
      visibleNodes: overlay?.counts.visibleNodes ?? null,
      nodesWithPictureUrl: overlay?.counts.nodesWithPictureUrl ?? null,
      nodesWithSafePictureUrl: overlay?.counts.nodesWithSafePictureUrl ?? null,
      selectedForImage: overlay?.counts.selectedForImage ?? null,
      loadCandidates: overlay?.counts.loadCandidates ?? null,
      pendingCacheMiss: overlay?.counts.pendingCacheMiss ?? null,
      pendingCandidates: overlay?.counts.pendingCandidates ?? null,
      blockedCandidates: overlay?.counts.blockedCandidates ?? null,
      inflightCandidates: overlay?.counts.inflightCandidates ?? null,
      drawnImages: overlay?.counts.drawnImages ?? null,
      sourceImageDraws: overlay?.counts.sourceImageDraws ?? null,
      sourceMonogramDraws: overlay?.counts.sourceMonogramDraws ?? null,
      frameCacheHit: overlay?.counts.frameCacheHit ?? null,
      frameCacheBlits: overlay?.counts.frameCacheBlits ?? null,
      monogramDraws: overlay?.counts.monogramDraws ?? null,
      withPictureMonogramDraws: overlay?.counts.withPictureMonogramDraws ?? null,
      visualConcurrency:
        overlay?.resolvedBudget.visualConcurrency ??
        overlay?.resolvedBudget.concurrency ??
        null,
      effectiveLoadConcurrency:
        overlay?.resolvedBudget.effectiveLoadConcurrency ?? null,
      cacheReady: cache?.byState.ready ?? null,
      cacheLoading: cache?.byState.loading ?? null,
      cacheFailed: cache?.byState.failed ?? null,
      loaderBlocked: loader?.blockedCount ?? null,
      inflight: scheduler?.inflightCount ?? null,
    },
    reasons: {
      disableImage: sortCountMap(overlay?.byDisableReason),
      loadSkip: sortCountMap(overlay?.byLoadSkipReason),
      drawFallback: sortCountMap(overlay?.byDrawFallbackReason),
      cacheState: sortCountMap(overlay?.byCacheState),
      cacheFailures: failedReasons,
      blockedReasons,
    },
    transitions: {
      readyLossCount: readyLossEvents.length,
      readyLossSummary,
      recentReadyLosses: readyLossEvents.slice(-20),
    },
    latency,
    profileWarmup: profileWarmup ?? null,
    runtime: {
      options: state.runtimeOptions,
      perfBudget: state.perfBudget,
      cache: cache ?? null,
      loader: loader ?? null,
      scheduler: scheduler ?? null,
      overlay: overlay ?? null,
    },
  }
}

const buildAvatarRuntimeLatencyDebug = ({
  state,
  profileWarmup,
}: Pick<AvatarRuntimeDebugPayloadInput, 'state' | 'profileWarmup'>) => {
  const loaderRecentAttempts = state.loader?.recentAttempts?.slice(-120) ?? []
  const visiblePaints =
    state.overlay?.nodes
      .filter(
        (node) =>
          node.hasPictureUrl &&
          (node.candidateSinceMs !== undefined ||
            node.firstImageDrawAtMs !== undefined ||
            node.lastImageDrawAtMs !== undefined),
      )
      .map((node) => ({
        pubkey: node.pubkey,
        label: node.label,
        host: node.host,
        urlKey: node.urlKey,
        candidateSinceMs: node.candidateSinceMs ?? null,
        firstImageDrawAtMs: node.firstImageDrawAtMs ?? null,
        lastImageDrawAtMs: node.lastImageDrawAtMs ?? null,
        imageDrawCount: node.imageDrawCount ?? 0,
        drawResult: node.drawResult,
        cacheState: node.cacheState,
        inflight: node.inflight,
      }))
      .slice(0, 120) ?? []

  return {
    scope: 'visible-candidate-to-first-image-paint-with-profile-warmup-context',
    profileWarmup: profileWarmup?.latency ?? null,
    loaderRecentAttempts,
    visiblePaints,
  }
}

export const readAvatarRuntimeDebugBrowserSnapshot =
  (): AvatarRuntimeDebugBrowserSnapshot | undefined => {
    if (typeof window === 'undefined') return undefined
    return {
      userAgent: window.navigator.userAgent,
      language: window.navigator.language,
      devicePixelRatio: window.devicePixelRatio,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    }
  }

export const readAvatarRuntimeDebugLocationSnapshot =
  (): AvatarRuntimeDebugLocationSnapshot | undefined => {
    if (typeof window === 'undefined') return undefined
    return {
      pathname: window.location.pathname,
      search: window.location.search,
    }
  }

const readNodeEnv = () => {
  if (typeof process === 'undefined') return undefined
  return process.env.NODE_ENV
}

const sortCountMap = (values: Record<string, number> | undefined) =>
  Object.fromEntries(
    Object.entries(values ?? {}).sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    ),
  )
