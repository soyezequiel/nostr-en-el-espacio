// Imperative canvas overlay that renders "electron" zaps on top of Sigma.
// Lives in the Sigma container as a pointer-events: none canvas and is
// driven by a single requestAnimationFrame loop while animations exist.
//
// Radius scale (documented):
//   radiusPx = clamp(3 + log10(sats + 1) * 3.2, 3, 22)
// Log-based so a 1 sat blip stays visible (~3px) and a 1M sat mega-zap is
// bounded (~22px). Anything above the clamp ceiling looks the same — this is
// intentional to keep huge zaps from taking over the canvas.

import type { ParsedZap } from '@/features/graph-v2/zaps/zapParser'

const DEFAULT_DURATION_MS = 1500
const MIN_RADIUS_PX = 3
const MAX_RADIUS_PX = 22
const TAIL_COUNT = 6

export interface ViewportPositionResolver {
  (pubkey: string): { x: number; y: number } | null
}

interface ActiveElectron {
  fromPubkey: string
  toPubkey: string
  radiusPx: number
  startMs: number
  durationMs: number
  color: string
}

export function satsToRadiusPx(sats: number): number {
  if (!Number.isFinite(sats) || sats <= 0) return MIN_RADIUS_PX
  const raw = 3 + Math.log10(sats + 1) * 3.2
  return Math.min(Math.max(raw, MIN_RADIUS_PX), MAX_RADIUS_PX)
}

export class ZapElectronOverlay {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly resizeObserver: ResizeObserver | null = null
  private animations: ActiveElectron[] = []
  private rafId: number | null = null
  private disposed = false
  private devicePixelRatio = 1

  constructor(
    private readonly container: HTMLElement,
    private readonly getCssViewportPosition: ViewportPositionResolver,
  ) {
    const canvas = document.createElement('canvas')
    canvas.style.position = 'absolute'
    canvas.style.inset = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '5'
    canvas.setAttribute('data-zap-overlay', 'true')

    const containerStyle = getComputedStyle(container)
    if (containerStyle.position === 'static') {
      container.style.position = 'relative'
    }

    container.appendChild(canvas)
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('ZapElectronOverlay: failed to acquire 2D context')
    }
    this.ctx = ctx
    this.resize()

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize())
      this.resizeObserver.observe(container)
    }
  }

  public play(zap: Pick<ParsedZap, 'fromPubkey' | 'toPubkey' | 'sats'>): boolean {
    if (this.disposed) return false
    // Visibility/connection checks are the caller's responsibility, but we
    // re-verify positions are resolvable: if either endpoint can't be projected
    // there's nothing to animate.
    if (!this.getCssViewportPosition(zap.fromPubkey)) return false
    if (!this.getCssViewportPosition(zap.toPubkey)) return false

    this.animations.push({
      fromPubkey: zap.fromPubkey,
      toPubkey: zap.toPubkey,
      radiusPx: satsToRadiusPx(zap.sats),
      startMs: performance.now(),
      durationMs: DEFAULT_DURATION_MS,
      color: '#ffd86b',
    })
    this.ensureTicking()
    return true
  }

  public dispose(): void {
    this.disposed = true
    this.animations = []
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.resizeObserver?.disconnect()
    if (this.canvas.parentElement === this.container) {
      this.container.removeChild(this.canvas)
    }
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect()
    const dpr = Math.max(window.devicePixelRatio || 1, 1)
    this.devicePixelRatio = dpr
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr))
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr))
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private ensureTicking(): void {
    if (this.rafId !== null || this.disposed) return
    this.rafId = requestAnimationFrame(this.tick)
  }

  private readonly tick = (timestamp: number) => {
    this.rafId = null
    if (this.disposed) return

    const ctx = this.ctx
    const widthCss = this.canvas.width / this.devicePixelRatio
    const heightCss = this.canvas.height / this.devicePixelRatio
    ctx.clearRect(0, 0, widthCss, heightCss)

    const next: ActiveElectron[] = []
    for (const anim of this.animations) {
      const elapsed = timestamp - anim.startMs
      if (elapsed >= anim.durationMs) continue

      const from = this.getCssViewportPosition(anim.fromPubkey)
      const to = this.getCssViewportPosition(anim.toPubkey)
      // If a node left the viewport/graph mid-flight, drop the animation so we
      // never paint on stale or offscreen positions.
      if (!from || !to) continue

      const progress = Math.min(1, Math.max(0, elapsed / anim.durationMs))
      this.drawElectron(ctx, from, to, progress, anim)
      next.push(anim)
    }

    this.animations = next
    if (this.animations.length > 0) {
      this.ensureTicking()
    }
  }

  private drawElectron(
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    progress: number,
    anim: ActiveElectron,
  ): void {
    const eased = easeInOutQuad(progress)
    const x = from.x + (to.x - from.x) * eased
    const y = from.y + (to.y - from.y) * eased

    // Tail
    for (let i = TAIL_COUNT; i >= 1; i--) {
      const t = Math.max(0, eased - i * 0.025)
      const tx = from.x + (to.x - from.x) * t
      const ty = from.y + (to.y - from.y) * t
      const alpha = ((TAIL_COUNT - i + 1) / TAIL_COUNT) * 0.25 * (1 - progress * 0.4)
      const r = anim.radiusPx * (0.45 + (TAIL_COUNT - i) * 0.06)
      ctx.beginPath()
      ctx.globalAlpha = alpha
      ctx.fillStyle = anim.color
      ctx.arc(tx, ty, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Glow
    ctx.globalAlpha = 0.35
    ctx.beginPath()
    ctx.fillStyle = anim.color
    ctx.arc(x, y, anim.radiusPx * 2.2, 0, Math.PI * 2)
    ctx.fill()

    // Core
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.fillStyle = '#fff6cf'
    ctx.strokeStyle = anim.color
    ctx.lineWidth = 1.5
    ctx.arc(x, y, anim.radiusPx, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    ctx.globalAlpha = 1
  }
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}
