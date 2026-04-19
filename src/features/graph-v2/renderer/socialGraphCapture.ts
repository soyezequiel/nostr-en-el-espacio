import {
  buildAvatarUrlKey,
  isSafeAvatarUrl,
  type ImageLodBucket,
} from '@/features/graph-v2/renderer/avatar/avatarImageUtils'
import type {
  AvatarBitmapCache,
  MonogramInput,
} from '@/features/graph-v2/renderer/avatar/avatarBitmapCache'
import type { AvatarLoader } from '@/features/graph-v2/renderer/avatar/avatarLoader'
import type {
  RenderEdgeAttributes,
  RenderNodeAttributes,
} from '@/features/graph-v2/renderer/graphologyProjectionStore'
import { buildSocialAvatarProxyUrl } from '@/features/graph-v2/renderer/socialAvatarProxy'

export type SocialGraphCaptureFormat = 'wide' | 'square' | 'story'

export type SocialGraphCapturePhase =
  | 'preparing'
  | 'loading-avatars'
  | 'generating-image'
  | 'completed'

export interface SocialGraphCaptureProgress {
  phase: SocialGraphCapturePhase
  loadedAvatarCount?: number
  totalAvatarCount?: number
  failedAvatarCount?: number
  missingPhotoCount?: number
  drawnImageCount?: number
  fallbackWithPhotoCount?: number
  attemptedAvatarCount?: number
  retriedAvatarCount?: number
  failureReasons?: Record<string, number>
  failureHosts?: Record<string, number>
  failureHostReasons?: Record<string, number>
  failureSamples?: Record<string, string[]>
  drawFallbackReasons?: Record<string, number>
  drawFallbackHosts?: Record<string, number>
  drawFallbackSamples?: Record<string, string[]>
  timedOut?: boolean
}

export interface SocialGraphCaptureOptions {
  format?: SocialGraphCaptureFormat
  timeoutMs?: number
  maxBucket?: ImageLodBucket
  concurrency?: number
  onProgress?: (progress: SocialGraphCaptureProgress) => void
}

export interface SocialGraphCaptureNode {
  pubkey: string
  attrs: RenderNodeAttributes
  degree: number
}

export interface SocialGraphCaptureEdge {
  source: string
  target: string
  attrs: RenderEdgeAttributes
}

export interface SocialGraphCaptureDeps {
  nodes: readonly SocialGraphCaptureNode[]
  edges: readonly SocialGraphCaptureEdge[]
  cache: AvatarBitmapCache
  loader: AvatarLoader
  rootPubkey: string | null
  options?: SocialGraphCaptureOptions
  now?: () => Date
}

export const SOCIAL_GRAPH_CAPTURE_FORMATS: Record<
  SocialGraphCaptureFormat,
  { width: number; height: number }
> = {
  wide: { width: 3840, height: 2160 },
  square: { width: 2160, height: 2160 },
  story: { width: 2160, height: 3840 },
}

const DEFAULT_CAPTURE_TIMEOUT_MS = 30000
const MAX_CAPTURE_TIMEOUT_MS = 60000
const DEFAULT_CAPTURE_CONCURRENCY = 20
const MAX_CAPTURE_AVATAR_LOADS = 800
const CAPTURE_MAX_RETRIES = 2
const CAPTURE_RETRY_BASE_DELAY_MS = 180
const CAPTURE_RETRYABLE_REASONS = new Set<string>([
  'timeout',
  'network',
  'avatar_fetch_failed',
  'http_408',
  'http_425',
  'http_429',
  'http_500',
  'http_502',
  'http_503',
  'http_504',
  'image_load_failed',
])
const CAPTURE_PADDING_PX = 144
const FOOTER_HEIGHT_PX = 88
const MIN_CAPTURE_NODE_RADIUS_PX = 10
const MAX_CAPTURE_NODE_RADIUS_PX = 120
const PRIORITY_NODE_MIN_RADIUS_PX = 44
const HUB_LABEL_LIMIT = 10
const EXPORT_PROBE_SIZE_PX = 1

export const resolveSocialGraphCaptureFormat = (
  format: SocialGraphCaptureFormat | undefined,
) => SOCIAL_GRAPH_CAPTURE_FORMATS[format ?? 'wide']

export const compareSocialCaptureNodes = (
  left: SocialGraphCaptureNode,
  right: SocialGraphCaptureNode,
) => {
  const leftRank = getSocialCaptureRank(left)
  const rightRank = getSocialCaptureRank(right)
  if (leftRank !== rightRank) return leftRank - rightRank
  if (left.degree !== right.degree) return right.degree - left.degree
  if (left.attrs.size !== right.attrs.size) return right.attrs.size - left.attrs.size
  return left.pubkey.localeCompare(right.pubkey)
}

export const selectSocialCaptureAvatarNodes = <T extends SocialGraphCaptureNode>(
  nodes: readonly T[],
  cap = MAX_CAPTURE_AVATAR_LOADS,
) =>
  [...nodes]
    .filter((node) => !node.attrs.hidden && isSafeAvatarUrl(node.attrs.pictureUrl))
    .sort(compareSocialCaptureNodes)
    .slice(0, Math.max(0, cap))

const getSocialCaptureRank = (node: SocialGraphCaptureNode) => {
  if (node.attrs.isRoot) return 0
  if (node.attrs.isSelected) return 1
  if (node.attrs.isPinned) return 2
  if (node.degree > 0) return 3
  return 4
}

export const captureSocialGraphImage = async ({
  nodes,
  edges,
  cache,
  loader,
  rootPubkey,
  options,
  now = () => new Date(),
}: SocialGraphCaptureDeps): Promise<Blob> => {
  const format = resolveSocialGraphCaptureFormat(options?.format)
  const timeoutMs = clampFinite(
    options?.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS,
    500,
    MAX_CAPTURE_TIMEOUT_MS,
  )
  const maxBucket = options?.maxBucket ?? 1024
  const concurrency = Math.round(
    clampFinite(options?.concurrency ?? DEFAULT_CAPTURE_CONCURRENCY, 1, 32),
  )
  const visibleNodes = nodes.filter((node) => !node.attrs.hidden)

  options?.onProgress?.({ phase: 'preparing' })

  const frame = resolveCaptureFrame(visibleNodes, format.width, format.height)
  const renderNodes = visibleNodes.map((node) => {
    const point = projectGraphPoint(node.attrs, frame)
    const radius = resolveCaptureNodeRadius(node, format)
    const monogram = createMonogramInput(node)
    return {
      ...node,
      x: point.x,
      y: point.y,
      r: radius,
      // Capture always requests the highest bucket available so avatars
      // stay sharp when scaled down to the final node radius. The canvas
      // uses high-quality smoothing at draw time.
      bucket: maxBucket,
      monogram,
    }
  })

  const avatarNodes = selectSocialCaptureAvatarNodes(renderNodes)
  const originalCacheCap = cache.capacity()
  cache.setCap(
    resolveSocialCaptureCacheCap({
      currentCap: originalCacheCap,
      currentSize: cache.size(),
      avatarNodeCount: avatarNodes.length,
    }),
  )

  try {
    options?.onProgress?.({
      phase: 'loading-avatars',
      loadedAvatarCount: 0,
      totalAvatarCount: avatarNodes.length,
    })

    const preloadResult = await preloadCaptureAvatars({
      nodes: avatarNodes,
      cache,
      loader,
      timeoutMs,
      concurrency,
      onProgress: options?.onProgress,
    })

    logCaptureDiagnostics({
      visibleNodes: visibleNodes.length,
      nodesWithPicture: avatarNodes.length,
      preload: preloadResult,
    })

    options?.onProgress?.({
      phase: 'generating-image',
      loadedAvatarCount: preloadResult.loaded,
      totalAvatarCount: avatarNodes.length,
      failedAvatarCount: preloadResult.failed,
      missingPhotoCount: visibleNodes.length - avatarNodes.length,
      attemptedAvatarCount: preloadResult.attempted,
      retriedAvatarCount: preloadResult.retried,
      failureReasons: preloadResult.failureReasons,
      failureHosts: preloadResult.failureHosts,
      failureHostReasons: preloadResult.failureHostReasons,
      failureSamples: preloadResult.failureSamples,
      timedOut: preloadResult.timedOut,
    })

    const canvas = document.createElement('canvas')
    canvas.width = format.width
    canvas.height = format.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('canvas_unavailable')
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    drawCaptureBackground(ctx, format.width, format.height)
    drawCaptureEdges(ctx, edges, renderNodes, format)
    const drawStats = drawCaptureNodes(ctx, renderNodes, cache)
    drawCaptureLabels(ctx, renderNodes, format)
    drawCaptureFooter(ctx, {
      width: format.width,
      height: format.height,
      rootLabel:
        renderNodes.find((node) => node.pubkey === rootPubkey)?.attrs.label ??
        renderNodes.find((node) => node.attrs.isRoot)?.attrs.label ??
        null,
      nodeCount: visibleNodes.length,
      edgeCount: edges.filter((edge) => !edge.attrs.hidden).length,
      now: now(),
      drawnImageCount: drawStats.drawnImageCount,
      fallbackWithPhotoCount: drawStats.fallbackWithPhotoCount,
      missingPhotoCount: drawStats.missingPhotoCount,
    })

    options?.onProgress?.({
      phase: 'completed',
      loadedAvatarCount: preloadResult.loaded,
      totalAvatarCount: avatarNodes.length,
      failedAvatarCount: preloadResult.failed,
      missingPhotoCount: drawStats.missingPhotoCount,
      drawnImageCount: drawStats.drawnImageCount,
      fallbackWithPhotoCount: drawStats.fallbackWithPhotoCount,
      attemptedAvatarCount: preloadResult.attempted,
      retriedAvatarCount: preloadResult.retried,
      failureReasons: preloadResult.failureReasons,
      failureHosts: preloadResult.failureHosts,
      failureHostReasons: preloadResult.failureHostReasons,
      failureSamples: preloadResult.failureSamples,
      drawFallbackReasons: drawStats.fallbackReasons,
      drawFallbackHosts: drawStats.fallbackHosts,
      drawFallbackSamples: drawStats.fallbackSamples,
      timedOut: preloadResult.timedOut,
    })

    return await canvasToPngBlob(canvas)
  } finally {
    cache.setCap(originalCacheCap)
  }
}

export const resolveSocialCaptureCacheCap = ({
  currentCap,
  currentSize,
  avatarNodeCount,
}: {
  currentCap: number
  currentSize: number
  avatarNodeCount: number
}) =>
  Math.max(
    16,
    ceilFinite(currentCap),
    ceilFinite(currentSize) + ceilFinite(avatarNodeCount),
  )

const ceilFinite = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.ceil(value)) : 0

export interface PreloadCaptureResult {
  loaded: number
  failed: number
  attempted: number
  retried: number
  failureReasons: Record<string, number>
  failureHosts: Record<string, number>
  failureHostReasons: Record<string, number>
  failureSamples: Record<string, string[]>
  timedOut: boolean
}

const preloadCaptureAvatars = async ({
  nodes,
  cache,
  loader,
  timeoutMs,
  concurrency,
  onProgress,
}: {
  nodes: ReadonlyArray<
    SocialGraphCaptureNode & {
      bucket: ImageLodBucket
      monogram: MonogramInput
    }
  >
  cache: AvatarBitmapCache
  loader: AvatarLoader
  timeoutMs: number
  concurrency: number
  onProgress?: (progress: SocialGraphCaptureProgress) => void
}): Promise<PreloadCaptureResult> => {
  const deadlineCtrl = new AbortController()
  const timeoutId = setTimeout(() => {
    deadlineCtrl.abort('social_capture_timeout')
  }, timeoutMs)
  let loaded = 0
  let failed = 0
  let attempted = 0
  let retried = 0
  let cursor = 0
  const failureReasons: Record<string, number> = {}
  const failureHosts: Record<string, number> = {}
  const failureHostReasons: Record<string, number> = {}
  const failureSamples: Record<string, string[]> = {}

  const reportFailure = (url: string, reason: string) => {
    failureReasons[reason] = (failureReasons[reason] ?? 0) + 1
    let host = 'unknown'
    try {
      host = new URL(url).hostname || 'unknown'
    } catch {
      /* keep default */
    }
    failureHosts[host] = (failureHosts[host] ?? 0) + 1
    const hostReasonKey = `${reason} @ ${host}`
    failureHostReasons[hostReasonKey] =
      (failureHostReasons[hostReasonKey] ?? 0) + 1
    const samples = failureSamples[hostReasonKey] ?? []
    if (samples.length < 6 && url && !samples.includes(url)) {
      samples.push(url)
      failureSamples[hostReasonKey] = samples
    }
  }

  const loadWithRetries = async (
    sourceUrl: string,
    bucket: ImageLodBucket,
  ) => {
    let lastReason = 'avatar_fetch_failed'
    for (let attempt = 0; attempt <= CAPTURE_MAX_RETRIES; attempt += 1) {
      if (deadlineCtrl.signal.aborted) throw new Error('aborted')
      if (attempt > 0) {
        retried += 1
        const delay = CAPTURE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
        await sleep(delay, deadlineCtrl.signal)
      }
      try {
        attempted += 1
        return await loader.load(
          resolveCaptureAvatarLoadUrl(sourceUrl),
          bucket,
          deadlineCtrl.signal,
          { useImageElementFallback: false },
        )
      } catch (err) {
        if (deadlineCtrl.signal.aborted) throw err
        const reason = extractLoadErrorReason(err)
        lastReason = reason
        if (!CAPTURE_RETRYABLE_REASONS.has(reason)) {
          throw Object.assign(new Error(reason), { reason })
        }
      }
    }
    throw Object.assign(new Error(lastReason), { reason: lastReason })
  }

  const worker = async () => {
    while (!deadlineCtrl.signal.aborted) {
      const node = nodes[cursor]
      cursor += 1
      if (!node) return
      const url = node.attrs.pictureUrl
      if (!url || !isSafeAvatarUrl(url)) {
        failed += 1
        reportFailure(url ?? '', 'unsafe_or_missing_url')
        continue
      }
      const urlKey = buildAvatarUrlKey(node.pubkey, url)
      const existing = cache.get(urlKey)
      if (
        existing?.state === 'ready' &&
        existing.bucket >= node.bucket &&
        isCanvasImageSourceExportSafe(existing.bitmap)
      ) {
        loaded += 1
        onProgress?.({
          phase: 'loading-avatars',
          loadedAvatarCount: loaded,
          totalAvatarCount: nodes.length,
          attemptedAvatarCount: attempted,
          retriedAvatarCount: retried,
        })
        continue
      }
      if (existing?.state === 'ready') {
        cache.delete(urlKey)
      }
      const monogram = cache.getMonogram(node.pubkey, node.monogram)
      cache.markLoading(urlKey, node.bucket, monogram)
      try {
        const result = await loadWithRetries(url, node.bucket)
        if (deadlineCtrl.signal.aborted) {
          return
        }
        cache.markReady(
          urlKey,
          node.bucket,
          result.bitmap,
          monogram,
          result.bytes,
        )
        loaded += 1
        onProgress?.({
          phase: 'loading-avatars',
          loadedAvatarCount: loaded,
          totalAvatarCount: nodes.length,
          attemptedAvatarCount: attempted,
          retriedAvatarCount: retried,
        })
      } catch (err) {
        if (deadlineCtrl.signal.aborted) {
          return
        }
        failed += 1
        reportFailure(url, extractLoadErrorReason(err))
        cache.markFailed(urlKey, monogram)
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, nodes.length) }, worker),
    )
  } finally {
    clearTimeout(timeoutId)
  }

  return {
    loaded,
    failed,
    attempted,
    retried,
    failureReasons,
    failureHosts,
    failureHostReasons,
    failureSamples,
    timedOut: deadlineCtrl.signal.aborted,
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(id)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })

export const extractLoadErrorReason = (err: unknown): string => {
  if (!err) return 'avatar_fetch_failed'
  if (typeof err === 'object' && err !== null) {
    const candidate = err as { reason?: unknown; name?: unknown; message?: unknown }
    if (typeof candidate.reason === 'string' && candidate.reason.length > 0) {
      return candidate.reason
    }
    if (candidate.name === 'AbortError') return 'aborted'
    if (typeof candidate.message === 'string' && candidate.message.length > 0) {
      return candidate.message
    }
  }
  return 'avatar_fetch_failed'
}

const logCaptureDiagnostics = ({
  visibleNodes,
  nodesWithPicture,
  preload,
}: {
  visibleNodes: number
  nodesWithPicture: number
  preload: PreloadCaptureResult
}) => {
  if (
    typeof console === 'undefined' ||
    typeof process === 'undefined' ||
    (process as { env?: Record<string, string | undefined> }).env?.NODE_ENV === 'production'
  ) {
    return
  }
  try {
    const group = (console as { groupCollapsed?: (label: string) => void }).groupCollapsed
    if (typeof group === 'function') {
      group.call(console, '[social-capture] avatar preload summary')
    }
    console.info('visible nodes:', visibleNodes)
    console.info('nodes with pictureUrl:', nodesWithPicture)
    console.info('load attempts (incl. retries):', preload.attempted)
    console.info('retries:', preload.retried)
    console.info('loaded bitmaps:', preload.loaded)
    console.info('failed:', preload.failed)
    console.info('timedOut:', preload.timedOut)
    if (Object.keys(preload.failureReasons).length > 0) {
      console.info('failure reasons:', preload.failureReasons)
    }
    if (Object.keys(preload.failureHosts).length > 0) {
      console.info('failure hosts:', preload.failureHosts)
    }
    if (Object.keys(preload.failureHostReasons).length > 0) {
      console.info('failure host/reasons:', preload.failureHostReasons)
    }
    if (Object.keys(preload.failureSamples).length > 0) {
      console.info('failure samples:', preload.failureSamples)
    }
    const groupEnd = (console as { groupEnd?: () => void }).groupEnd
    if (typeof groupEnd === 'function') {
      groupEnd.call(console)
    }
  } catch {
    /* ignore */
  }
}

const resolveCaptureAvatarLoadUrl = (url: string) => {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return url
  }

  return buildSocialAvatarProxyUrl(url, window.location.origin)
}

const resolveCaptureFrame = (
  nodes: readonly SocialGraphCaptureNode[],
  width: number,
  height: number,
) => {
  if (nodes.length === 0) {
    return {
      minX: -1,
      minY: -1,
      scale: 1,
      offsetX: width / 2,
      offsetY: (height - FOOTER_HEIGHT_PX) / 2,
    }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.attrs.x)
    minY = Math.min(minY, node.attrs.y)
    maxX = Math.max(maxX, node.attrs.x)
    maxY = Math.max(maxY, node.attrs.y)
  }

  const graphWidth = Math.max(1, maxX - minX)
  const graphHeight = Math.max(1, maxY - minY)
  const drawableWidth = Math.max(1, width - CAPTURE_PADDING_PX * 2)
  const drawableHeight = Math.max(
    1,
    height - CAPTURE_PADDING_PX * 2 - FOOTER_HEIGHT_PX,
  )
  const scale = Math.min(drawableWidth / graphWidth, drawableHeight / graphHeight)
  const scaledWidth = graphWidth * scale
  const scaledHeight = graphHeight * scale

  return {
    minX,
    minY,
    scale,
    offsetX: (width - scaledWidth) / 2,
    offsetY: (height - FOOTER_HEIGHT_PX - scaledHeight) / 2,
  }
}

const projectGraphPoint = (
  attrs: Pick<RenderNodeAttributes, 'x' | 'y'>,
  frame: { minX: number; minY: number; scale: number; offsetX: number; offsetY: number },
) => ({
  x: frame.offsetX + (attrs.x - frame.minX) * frame.scale,
  y: frame.offsetY + (attrs.y - frame.minY) * frame.scale,
})

const resolveCaptureNodeRadius = (
  node: SocialGraphCaptureNode,
  format: { width: number; height: number },
) => {
  const formatScale = Math.min(format.width, format.height) / 900
  const base = node.attrs.size * formatScale
  const priorityMin =
    node.attrs.isRoot || node.attrs.isSelected || node.attrs.isPinned
      ? PRIORITY_NODE_MIN_RADIUS_PX
      : MIN_CAPTURE_NODE_RADIUS_PX
  return clampFinite(
    base,
    priorityMin,
    MAX_CAPTURE_NODE_RADIUS_PX,
  )
}

const createMonogramInput = (node: SocialGraphCaptureNode): MonogramInput => ({
  label: node.attrs.label || node.pubkey.slice(0, 2),
  color: node.attrs.color || '#7dd3a7',
  paletteKey: node.pubkey,
  showBackground: true,
  showText: true,
})

const drawCaptureBackground = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) => {
  ctx.fillStyle = '#091017'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = 'rgba(216, 227, 240, 0.06)'
  ctx.lineWidth = Math.max(1, Math.round(Math.min(width, height) / 1080))
  const gridStep = Math.max(80, Math.round(Math.min(width, height) / 18))
  for (let x = 0; x <= width; x += gridStep) {
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, height)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y += gridStep) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(width, y + 0.5)
    ctx.stroke()
  }
}

const drawCaptureEdges = (
  ctx: CanvasRenderingContext2D,
  edges: readonly SocialGraphCaptureEdge[],
  nodes: ReadonlyArray<SocialGraphCaptureNode & { x: number; y: number }>,
  format: { width: number; height: number },
) => {
  const positions = new Map(nodes.map((node) => [node.pubkey, node]))
  ctx.save()
  ctx.lineCap = 'round'
  for (const edge of edges) {
    if (edge.attrs.hidden) continue
    const source = positions.get(edge.source)
    const target = positions.get(edge.target)
    if (!source || !target) continue
    ctx.strokeStyle = edge.attrs.touchesFocus
      ? 'rgba(216, 227, 240, 0.40)'
      : 'rgba(122, 146, 189, 0.20)'
    const edgeScale = Math.max(1, Math.min(format.width, format.height) / 900)
    ctx.lineWidth = clampFinite(edge.attrs.size * edgeScale, 0.5, 8)
    ctx.beginPath()
    ctx.moveTo(source.x, source.y)
    ctx.lineTo(target.x, target.y)
    ctx.stroke()
  }
  ctx.restore()
}

const drawCaptureNodes = (
  ctx: CanvasRenderingContext2D,
  nodes: ReadonlyArray<
    SocialGraphCaptureNode & {
      x: number
      y: number
      r: number
      monogram: MonogramInput
    }
  >,
  cache: AvatarBitmapCache,
) => {
  const exportSafetyBySource = new WeakMap<object, boolean>()
  const stats = {
    drawnImageCount: 0,
    fallbackWithPhotoCount: 0,
    missingPhotoCount: 0,
    fallbackReasons: {} as Record<string, number>,
    fallbackHosts: {} as Record<string, number>,
    fallbackSamples: {} as Record<string, string[]>,
  }
  const ordered = [...nodes].sort((left, right) => {
    const leftZ = left.attrs.zIndex ?? 0
    const rightZ = right.attrs.zIndex ?? 0
    return leftZ - rightZ || left.r - right.r
  })

  for (const node of ordered) {
    const monogram = cache.getMonogram(node.pubkey, node.monogram)
    const url = node.attrs.pictureUrl
    const entry =
      url && isSafeAvatarUrl(url)
        ? cache.get(buildAvatarUrlKey(node.pubkey, url))
        : null
    const canDrawImage =
      entry?.state === 'ready' &&
      isCanvasImageSourceExportSafe(entry.bitmap, exportSafetyBySource)
    const drawable = canDrawImage ? entry.bitmap : monogram
    if (canDrawImage) {
      stats.drawnImageCount += 1
    } else if (url && isSafeAvatarUrl(url)) {
      stats.fallbackWithPhotoCount += 1
      reportDrawFallback(stats, url, resolveDrawFallbackReason(entry))
    } else {
      stats.missingPhotoCount += 1
    }
    const size = node.r * 2
    const shadowScale = Math.max(1, node.r / 20)
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.38)'
    ctx.shadowBlur = (node.attrs.isRoot ? 18 : 8) * shadowScale
    ctx.shadowOffsetY = 2 * shadowScale
    ctx.drawImage(drawable, node.x - node.r, node.y - node.r, size, size)
    ctx.shadowColor = 'transparent'
    ctx.lineWidth =
      (node.attrs.isRoot || node.attrs.isSelected ? 2.4 : 1) * shadowScale
    ctx.strokeStyle =
      node.attrs.isRoot || node.attrs.isSelected
        ? 'rgba(244, 251, 255, 0.9)'
        : 'rgba(244, 251, 255, 0.18)'
    ctx.beginPath()
    ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  return stats
}

const reportDrawFallback = (
  stats: {
    fallbackReasons: Record<string, number>
    fallbackHosts: Record<string, number>
    fallbackSamples: Record<string, string[]>
  },
  url: string,
  reason: string,
) => {
  stats.fallbackReasons[reason] = (stats.fallbackReasons[reason] ?? 0) + 1
  let host = 'unknown'
  try {
    host = new URL(url).hostname || 'unknown'
  } catch {
    /* keep default */
  }
  stats.fallbackHosts[host] = (stats.fallbackHosts[host] ?? 0) + 1
  const key = `${reason} @ ${host}`
  const samples = stats.fallbackSamples[key] ?? []
  if (samples.length < 8 && !samples.includes(url)) {
    samples.push(url)
    stats.fallbackSamples[key] = samples
  }
}

const resolveDrawFallbackReason = (
  entry: ReturnType<AvatarBitmapCache['get']> | null,
) => {
  if (!entry) return 'cache_miss'
  if (entry.state === 'loading') return 'cache_loading'
  if (entry.state === 'failed') return 'cache_failed'
  return 'not_export_safe'
}

export const isCanvasImageSourceExportSafe = (
  source: CanvasImageSource,
  memo?: WeakMap<object, boolean>,
) => {
  const memoKey = source as object
  const memoized = memo?.get(memoKey)
  if (memoized !== undefined) {
    return memoized
  }

  if (typeof document === 'undefined') {
    memo?.set(memoKey, false)
    return false
  }

  const probe = document.createElement('canvas')
  probe.width = EXPORT_PROBE_SIZE_PX
  probe.height = EXPORT_PROBE_SIZE_PX
  const probeCtx = probe.getContext('2d')
  if (!probeCtx) {
    memo?.set(memoKey, false)
    return false
  }

  try {
    probeCtx.drawImage(
      source,
      0,
      0,
      EXPORT_PROBE_SIZE_PX,
      EXPORT_PROBE_SIZE_PX,
    )
    probeCtx.getImageData(0, 0, EXPORT_PROBE_SIZE_PX, EXPORT_PROBE_SIZE_PX)
    memo?.set(memoKey, true)
    return true
  } catch {
    memo?.set(memoKey, false)
    return false
  }
}

const drawCaptureLabels = (
  ctx: CanvasRenderingContext2D,
  nodes: ReadonlyArray<
    SocialGraphCaptureNode & { x: number; y: number; r: number }
  >,
  format: { width: number; height: number },
) => {
  const hubs = [...nodes]
    .filter((node) => !node.attrs.isRoot && !node.attrs.isSelected && !node.attrs.isPinned)
    .sort(compareSocialCaptureNodes)
    .slice(0, HUB_LABEL_LIMIT)
  const labeled = new Set([
    ...nodes
      .filter(
        (node) =>
          node.attrs.isRoot || node.attrs.isSelected || node.attrs.isPinned,
      )
      .map((node) => node.pubkey),
    ...hubs.map((node) => node.pubkey),
  ])

  const scale = Math.min(format.width, format.height) / 900
  const fontPx = Math.round(14 * scale)
  const padX = Math.round(14 * scale)
  const boxHeight = Math.round(26 * scale)
  const gap = Math.round(8 * scale)
  const radius = Math.round(8 * scale)

  ctx.save()
  ctx.font = `600 ${fontPx}px Inter Tight, Inter, ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const node of nodes) {
    if (!labeled.has(node.pubkey) || !node.attrs.label) continue
    const label = node.attrs.label.length > 22
      ? `${node.attrs.label.slice(0, 21)}...`
      : node.attrs.label
    const y = node.y + node.r + gap
    const metrics = ctx.measureText(label)
    const boxWidth = metrics.width + padX
    ctx.fillStyle = 'rgba(9, 16, 23, 0.74)'
    ctx.strokeStyle = 'rgba(216, 227, 240, 0.16)'
    ctx.lineWidth = Math.max(1, Math.round(scale))
    roundRect(ctx, node.x - boxWidth / 2, y, boxWidth, boxHeight, radius)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = 'rgba(244, 251, 255, 0.92)'
    ctx.fillText(label, node.x, y + Math.round(boxHeight / 2 - fontPx / 2))
  }
  ctx.restore()
}

const drawCaptureFooter = (
  ctx: CanvasRenderingContext2D,
  {
    width,
    height,
    rootLabel,
    nodeCount,
    edgeCount,
    now,
    drawnImageCount,
    fallbackWithPhotoCount,
    missingPhotoCount,
  }: {
    width: number
    height: number
    rootLabel: string | null
    nodeCount: number
    edgeCount: number
    now: Date
    drawnImageCount: number
    fallbackWithPhotoCount: number
    missingPhotoCount: number
  },
) => {
  const footerY = height - FOOTER_HEIGHT_PX
  const scale = Math.min(width, height) / 900
  const titleFont = Math.round(18 * scale)
  const statsFont = Math.round(15 * scale)
  const pad = Math.round(28 * scale)
  ctx.save()
  ctx.fillStyle = 'rgba(4, 9, 13, 0.72)'
  ctx.fillRect(0, footerY, width, FOOTER_HEIGHT_PX)
  ctx.fillStyle = 'rgba(244, 251, 255, 0.86)'
  ctx.font = `600 ${titleFont}px Inter Tight, Inter, ui-sans-serif, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(
    rootLabel ? `Sigma graph: ${rootLabel}` : 'Sigma graph',
    pad,
    footerY + FOOTER_HEIGHT_PX / 2,
  )
  ctx.font = `500 ${statsFont}px ui-monospace, SF Mono, JetBrains Mono, monospace`
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(216, 227, 240, 0.68)'
  ctx.fillText(
    `${drawnImageCount} photos / ${fallbackWithPhotoCount} failed / ${missingPhotoCount} no photo / ${nodeCount} nodes / ${edgeCount} edges / ${now.toISOString().slice(0, 10)}`,
    width - pad,
    footerY + FOOTER_HEIGHT_PX / 2,
  )
  ctx.restore()
}

const canvasToPngBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('png_encode_failed'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })

const clampFinite = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
