import type Sigma from 'sigma'

import {
  applyImageBucketHysteresis,
  isSafeAvatarUrl,
  type ImageLodBucket,
} from '@/features/graph/render/avatar'

import type { AvatarBitmapCache, MonogramInput } from '@/features/graph-v2/renderer/avatar/avatarBitmapCache'
import type { AvatarCandidate, AvatarScheduler } from '@/features/graph-v2/renderer/avatar/avatarScheduler'
import type { PerfBudget } from '@/features/graph-v2/renderer/avatar/perfBudget'
import type {
  SigmaEdgeAttributes,
  SigmaNodeAttributes,
} from '@/features/graph-v2/renderer/graphologyProjectionStore'

export interface AvatarOverlayRendererDeps {
  sigma: Sigma<SigmaNodeAttributes, SigmaEdgeAttributes>
  cache: AvatarBitmapCache
  scheduler: AvatarScheduler
  budget: PerfBudget
  isMoving: () => boolean
  getDevicePixelRatio?: () => number
}

const buildUrlKey = (pubkey: string, url: string): string => `${pubkey}::${url}`

export class AvatarOverlayRenderer {
  private readonly sigma: Sigma<SigmaNodeAttributes, SigmaEdgeAttributes>
  private readonly cache: AvatarBitmapCache
  private readonly scheduler: AvatarScheduler
  private readonly budget: PerfBudget
  private readonly isMoving: () => boolean
  private readonly getDevicePixelRatio: () => number
  private readonly lastBucketByUrl = new Map<string, ImageLodBucket>()
  private lastFrameTs = 0
  private readonly boundAfterRender: () => void
  private disposed = false

  constructor(deps: AvatarOverlayRendererDeps) {
    this.sigma = deps.sigma
    this.cache = deps.cache
    this.scheduler = deps.scheduler
    this.budget = deps.budget
    this.isMoving = deps.isMoving
    this.getDevicePixelRatio = deps.getDevicePixelRatio ?? (() => {
      if (typeof globalThis !== 'undefined' && typeof globalThis.devicePixelRatio === 'number') {
        return Math.min(globalThis.devicePixelRatio, 2)
      }
      return 1
    })
    this.boundAfterRender = () => this.onAfterRender()
    this.sigma.on('afterRender', this.boundAfterRender)
  }

  public dispose() {
    if (this.disposed) return
    this.disposed = true
    this.sigma.off('afterRender', this.boundAfterRender)
  }

  private onAfterRender() {
    if (this.disposed) {
      return
    }
    const nowMs = performance.now()
    if (this.lastFrameTs > 0) {
      this.budget.recordFrame(nowMs - this.lastFrameTs)
    }
    this.lastFrameTs = nowMs

    const budget = this.budget.getBudget()
    if (!budget.drawAvatars) {
      return
    }

    const ctx = this.getOverlayContext()
    if (!ctx) {
      return
    }

    if (this.isMoving()) {
      return
    }

    const cameraRatio = this.sigma.getCamera().getState().ratio
    const graph = this.sigma.getGraph()
    const candidates: AvatarCandidate[] = []
    const dpr = this.getDevicePixelRatio()

    graph.forEachNode((pubkey, attrs) => {
      const nodeAttrs = attrs as SigmaNodeAttributes
      if (nodeAttrs.hidden) {
        return
      }
      const display = this.sigma.getNodeDisplayData(pubkey)
      if (!display) {
        return
      }
      const sizePx = display.size
      if (sizePx < budget.sizeThreshold) {
        return
      }
      const viewport = this.sigma.graphToViewport(display)
      if (!this.isInViewport(viewport.x, viewport.y, sizePx)) {
        return
      }

      const monogramInput: MonogramInput = {
        label: nodeAttrs.label || pubkey.slice(0, 2),
        color: nodeAttrs.color || '#7dd3a7',
      }
      const monogramCanvas = this.cache.getMonogram(pubkey, monogramInput)

      this.drawAvatarCircle({
        ctx,
        x: viewport.x,
        y: viewport.y,
        r: sizePx,
        bitmap: null,
        monogram: monogramCanvas,
        pubkey,
        url: nodeAttrs.pictureUrl,
      })

      if (cameraRatio > budget.zoomThreshold) {
        return
      }
      if (!isSafeAvatarUrl(nodeAttrs.pictureUrl)) {
        return
      }
      const url = nodeAttrs.pictureUrl
      const urlKey = buildUrlKey(pubkey, url)
      const bucket = this.resolveBucket(urlKey, sizePx * dpr, budget.maxBucket)

      const priority = resolvePriority(nodeAttrs, viewport, this.sigma)
      candidates.push({
        pubkey,
        urlKey,
        url,
        bucket,
        priority,
        monogram: monogramInput,
      })
    })

    this.scheduler.reconcile(candidates, budget)
  }

  private drawAvatarCircle({
    ctx,
    x,
    y,
    r,
    monogram,
    pubkey,
    url,
  }: {
    ctx: CanvasRenderingContext2D
    x: number
    y: number
    r: number
    bitmap: ImageBitmap | HTMLCanvasElement | null
    monogram: HTMLCanvasElement
    pubkey: string
    url: string | null
  }) {
    let drawable: CanvasImageSource = monogram
    if (url) {
      const urlKey = buildUrlKey(pubkey, url)
      const entry = this.cache.get(urlKey)
      if (entry && entry.state === 'ready') {
        drawable = entry.bitmap
      }
    }
    const size = r * 2
    try {
      ctx.drawImage(drawable, x - r, y - r, size, size)
    } catch {
      // canvas source may be invalidated; fall back silently
    }
  }

  private resolveBucket(
    urlKey: string,
    requestedPixels: number,
    maxBucket: ImageLodBucket,
  ): ImageLodBucket {
    const previous = this.lastBucketByUrl.get(urlKey) ?? null
    const next = applyImageBucketHysteresis({
      previousBucket: previous,
      requestedPixels,
    })
    const clamped = Math.min(next, maxBucket) as ImageLodBucket
    this.lastBucketByUrl.set(urlKey, clamped)
    return clamped
  }

  private isInViewport(x: number, y: number, r: number): boolean {
    const container = this.sigma.getContainer()
    const w = container.clientWidth
    const h = container.clientHeight
    return x + r >= 0 && x - r <= w && y + r >= 0 && y - r <= h
  }

  private getOverlayContext(): CanvasRenderingContext2D | null {
    const canvases = this.sigma.getCanvases()
    const labels = canvases.labels ?? canvases.mouse ?? null
    if (!labels) {
      return null
    }
    return labels.getContext('2d')
  }
}

const resolvePriority = (
  attrs: SigmaNodeAttributes,
  viewport: { x: number; y: number },
  sigma: Sigma<SigmaNodeAttributes, SigmaEdgeAttributes>,
): number => {
  if (attrs.isRoot) return 0
  if (attrs.isSelected) return 1
  if (attrs.isNeighbor) return 2
  const container = sigma.getContainer()
  const cx = container.clientWidth / 2
  const cy = container.clientHeight / 2
  const dx = viewport.x - cx
  const dy = viewport.y - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  return 3 + dist
}
