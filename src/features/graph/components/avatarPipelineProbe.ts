import type { ImageResidencySnapshot } from '@/features/graph/render'

export interface AvatarPipelineProbeSnapshot {
  sampledAt: number
  rootLoadStatus: string
  activeLayer: string
  readyImageCount: number
  visibleScreenNodes: number
  visibleNodes: number
  runtimeReadyVisibleNodes: number
  paintedVisibleNodes: number
  missingVisibleNodes: number
  visibleQueuedRequests: number
  visibleInFlightRequests: number
  queuedVisibleBaseRequests: number
  queuedVisibleHdRequests: number
  queuedCriticalVisibleBaseRequests: number
  inFlightVisibleBaseRequests: number
  inFlightVisibleHdRequests: number
  inFlightCriticalVisibleBaseRequests: number
  iconLayerPendingVisibleNodes: number
  iconLayerFailedVisibleNodes: number
  blockedSourceUrls: number
  timedOutRequests: number
  hydrationBacklog: number
  proxyFallbackSources: number
  runtimePaintGap: number
  visiblePaintCoverage: number | null
  health: ImageResidencySnapshot['diagnostics']['health']
  bottleneckStage: ImageResidencySnapshot['diagnostics']['bottleneckStage']
  frameComputationMode: ImageResidencySnapshot['diagnostics']['frameComputationMode']
  frameSkipReason: ImageResidencySnapshot['diagnostics']['frameSkipReason']
  primarySummary: string
  secondarySummary: string | null
}

export interface AvatarPipelineProbeState {
  version: 1
  latest: AvatarPipelineProbeSnapshot | null
}

declare global {
  interface Window {
    __NOSTR_AVATAR_PIPELINE_PROBE__?: AvatarPipelineProbeState
  }
}

const PROBE_QUERY_PARAM = 'avatarProbe'
const PROBE_WINDOW_KEY = '__NOSTR_AVATAR_PIPELINE_PROBE__'

const readProbeNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

export const isAvatarPipelineProbeEnabled = () => {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    new URLSearchParams(window.location.search).get(PROBE_QUERY_PARAM) === '1'
  )
}

export const publishAvatarPipelineProbe = ({
  activeLayer,
  readyImageCount,
  rootLoadStatus,
  snapshot,
}: {
  activeLayer: string
  readyImageCount: number
  rootLoadStatus: string
  snapshot: ImageResidencySnapshot
}) => {
  if (!isAvatarPipelineProbeEnabled() || typeof window === 'undefined') {
    return
  }

  const visibleQueuedRequests =
    snapshot.pendingWork.queuedVisibleBaseRequests +
    snapshot.pendingWork.queuedVisibleHdRequests
  const visibleInFlightRequests =
    snapshot.pendingWork.inFlightVisibleBaseRequests +
    snapshot.pendingWork.inFlightVisibleHdRequests
  const runtimeReadyVisibleNodes = snapshot.presentation.runtimeReadyVisibleNodes
  const paintedVisibleNodes = snapshot.presentation.paintedVisibleNodes
  const visibleScreenNodes = snapshot.visibility.visibleScreenNodes

  window[PROBE_WINDOW_KEY] = {
    version: 1,
    latest: {
      sampledAt: readProbeNow(),
      rootLoadStatus,
      activeLayer,
      readyImageCount,
      visibleScreenNodes,
      visibleNodes: snapshot.visibility.visibleNodes,
      runtimeReadyVisibleNodes,
      paintedVisibleNodes,
      missingVisibleNodes: snapshot.visibility.missingVisibleNodes,
      visibleQueuedRequests,
      visibleInFlightRequests,
      queuedVisibleBaseRequests: snapshot.pendingWork.queuedVisibleBaseRequests,
      queuedVisibleHdRequests: snapshot.pendingWork.queuedVisibleHdRequests,
      queuedCriticalVisibleBaseRequests:
        snapshot.pendingWork.queuedCriticalVisibleBaseRequests,
      inFlightVisibleBaseRequests:
        snapshot.pendingWork.inFlightVisibleBaseRequests,
      inFlightVisibleHdRequests:
        snapshot.pendingWork.inFlightVisibleHdRequests,
      inFlightCriticalVisibleBaseRequests:
        snapshot.pendingWork.inFlightCriticalVisibleBaseRequests,
      iconLayerPendingVisibleNodes:
        snapshot.presentation.iconLayerPendingVisibleNodes,
      iconLayerFailedVisibleNodes:
        snapshot.presentation.iconLayerFailedVisibleNodes,
      blockedSourceUrls: snapshot.failures.blockedSourceUrls,
      timedOutRequests: snapshot.pendingWork.timedOutRequests,
      hydrationBacklog: snapshot.diagnostics.hydrationBacklog,
      proxyFallbackSources: snapshot.diagnostics.proxyFallbackSources,
      runtimePaintGap: Math.max(
        0,
        runtimeReadyVisibleNodes - paintedVisibleNodes,
      ),
      visiblePaintCoverage:
        visibleScreenNodes > 0
          ? paintedVisibleNodes / visibleScreenNodes
          : null,
      health: snapshot.diagnostics.health,
      bottleneckStage: snapshot.diagnostics.bottleneckStage,
      frameComputationMode: snapshot.diagnostics.frameComputationMode,
      frameSkipReason: snapshot.diagnostics.frameSkipReason,
      primarySummary: snapshot.diagnostics.primarySummary,
      secondarySummary: snapshot.diagnostics.secondarySummary,
    },
  }
}

export const clearAvatarPipelineProbe = () => {
  if (!isAvatarPipelineProbeEnabled() || typeof window === 'undefined') {
    return
  }

  window[PROBE_WINDOW_KEY] = {
    version: 1,
    latest: null,
  }
}
