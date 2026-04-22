import { getAvatarMonogram, getAvatarMonogramPalette } from '@/lib/avatarMonogram'
import {
  summarizeAvatarUrlKey,
  traceAvatarFlow,
  traceAvatarVerboseFlow,
} from '@/features/graph-runtime/debug/avatarTrace'
import type { ImageLodBucket } from '@/features/graph-v2/renderer/avatar/avatarImageUtils'
import type {
  AvatarCacheDebugSnapshot,
  AvatarCacheEntryDebugSnapshot,
  AvatarCacheRecentEventDebugSnapshot,
} from '@/features/graph-v2/renderer/avatar/avatarDebug'

import type {
  AvatarBitmap,
  AvatarEntry,
  AvatarFailedEntry,
  AvatarLoadingEntry,
  AvatarReadyEntry,
  AvatarUrlKey,
} from '@/features/graph-v2/renderer/avatar/types'

const MONOGRAM_SIZE = 64
const FAILED_TTL_MS = 10 * 60 * 1000
const MAX_RECENT_DEBUG_EVENTS = 200

const closeBitmap = (bitmap: AvatarBitmap) => {
  if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) {
    try {
      bitmap.close()
    } catch {
      // ignore
    }
  }
}

const getEntryBucket = (entry: AvatarEntry | undefined): ImageLodBucket | null =>
  entry && 'bucket' in entry ? entry.bucket : null

export interface MonogramInput {
  label: string
  color: string
  paletteKey?: string
  showBackground?: boolean
  showText?: boolean
}

interface MonogramCacheEntry {
  canvas: HTMLCanvasElement
  signature: string
}

const createMonogramSignature = ({
  label,
  color,
  paletteKey,
  showBackground,
  showText,
}: MonogramInput) =>
  [
    label,
    paletteKey ?? color,
    showBackground === false ? 'no-bg' : 'bg',
    showText === false ? 'no-text' : 'text',
  ].join('\0')

const drawClaudeDesignMonogramBackground = (
  ctx: CanvasRenderingContext2D,
  r: number,
  hue: number,
  hue2: number,
  rim: string,
) => {
  ctx.save()
  ctx.beginPath()
  ctx.arc(r, r, r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()

  const baseGradient = ctx.createLinearGradient(
    r - r * 0.92,
    r - r * 0.92,
    r + r * 0.92,
    r + r * 0.92,
  )
  baseGradient.addColorStop(0, `oklch(86% 0.18 ${hue2})`)
  baseGradient.addColorStop(0.52, `oklch(68% 0.22 ${hue})`)
  baseGradient.addColorStop(1, `oklch(48% 0.20 ${hue})`)
  ctx.fillStyle = baseGradient
  ctx.fillRect(0, 0, r * 2, r * 2)

  const topLeftHighlight = ctx.createRadialGradient(
    r - r * 0.52,
    r - r * 0.56,
    0,
    r - r * 0.52,
    r - r * 0.56,
    r * 1.05,
  )
  topLeftHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.58)')
  topLeftHighlight.addColorStop(0.58, 'rgba(255, 255, 255, 0.12)')
  topLeftHighlight.addColorStop(0.76, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = topLeftHighlight
  ctx.fillRect(0, 0, r * 2, r * 2)

  const lowerInsetShadow = ctx.createLinearGradient(0, r * 0.78, 0, r * 2)
  lowerInsetShadow.addColorStop(0, 'rgba(10, 10, 10, 0)')
  lowerInsetShadow.addColorStop(1, 'rgba(10, 10, 10, 0.20)')
  ctx.fillStyle = lowerInsetShadow
  ctx.fillRect(0, r * 0.55, r * 2, r * 1.45)

  const bottomRightShadow = ctx.createRadialGradient(
    r + r * 0.42,
    r + r * 0.44,
    0,
    r + r * 0.42,
    r + r * 0.44,
    r * 0.95,
  )
  bottomRightShadow.addColorStop(0, 'rgba(0, 0, 0, 0.22)')
  bottomRightShadow.addColorStop(0.68, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = bottomRightShadow
  ctx.fillRect(0, 0, r * 2, r * 2)

  const topInnerRim = ctx.createLinearGradient(0, 0, 0, r * 0.85)
  topInnerRim.addColorStop(0, 'rgba(255, 255, 255, 0.24)')
  topInnerRim.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = topInnerRim
  ctx.fillRect(0, 0, r * 2, r * 0.85)

  ctx.restore()

  ctx.strokeStyle = rim
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.arc(r, r, r - 0.4, 0, Math.PI * 2)
  ctx.stroke()
}

const renderMonogramCanvas = ({
  label,
  color,
  paletteKey,
  showBackground = true,
  showText = true,
}: MonogramInput): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = MONOGRAM_SIZE
  canvas.height = MONOGRAM_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return canvas
  }

  const r = MONOGRAM_SIZE / 2
  const palette = getAvatarMonogramPalette(paletteKey || label || color)
  const hue = palette.hue
  const hue2 = palette.hue2
  if (showBackground) {
    drawClaudeDesignMonogramBackground(ctx, r, hue, hue2, palette.rim)
  }

  if (showText) {
    ctx.font = `700 ${Math.round(MONOGRAM_SIZE * 0.48)}px Inter Tight, ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const initials = getAvatarMonogram(label)
    if (!showBackground) {
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(3, 7, 12, 0.82)'
      ctx.strokeText(initials, r, r + 1)
      ctx.fillStyle = 'rgba(245, 250, 255, 0.94)'
    } else {
      ctx.fillStyle = palette.text
    }
    ctx.fillText(initials, r, r + 1)
  }

  return canvas
}

export class AvatarBitmapCache {
  private readonly entries = new Map<AvatarUrlKey, AvatarEntry>()
  private readonly monograms = new Map<string, MonogramCacheEntry>()
  private readonly recentEvents: AvatarCacheRecentEventDebugSnapshot[] = []
  private totalBytes = 0
  private cap: number
  private monogramCap: number

  constructor(cap: number) {
    this.cap = Math.max(16, cap)
    this.monogramCap = this.cap * 2
  }

  public setCap(nextCap: number) {
    this.cap = Math.max(16, nextCap)
    this.monogramCap = this.cap * 2
    this.evictIfNeeded()
    this.evictMonogramsIfNeeded()
  }

  public capacity(): number {
    return this.cap
  }

  public getMonogram(pubkey: string, input: MonogramInput): HTMLCanvasElement {
    const signature = createMonogramSignature(input)
    const existing = this.monograms.get(pubkey)
    if (existing && existing.signature === signature) {
      this.monograms.delete(pubkey)
      this.monograms.set(pubkey, existing)
      return existing.canvas
    }
    const canvas = renderMonogramCanvas(input)
    this.monograms.set(pubkey, { canvas, signature })
    this.evictMonogramsIfNeeded()
    return canvas
  }

  public get(urlKey: AvatarUrlKey): AvatarEntry | undefined {
    return this.resolveEntry(urlKey, true)
  }

  public peek(urlKey: AvatarUrlKey): AvatarEntry | undefined {
    return this.resolveEntry(urlKey, false)
  }

  public markLoading(
    urlKey: AvatarUrlKey,
    bucket: ImageLodBucket,
    monogram: HTMLCanvasElement,
  ): AvatarLoadingEntry {
    const previous = this.entries.get(urlKey)
    const entry: AvatarLoadingEntry = {
      state: 'loading',
      bucket,
      monogram,
      startedAt: Date.now(),
    }
    this.entries.set(urlKey, entry)
    this.recordEvent({
      at: entry.startedAt,
      type: 'mark_loading',
      urlKey,
      previousState: previous?.state ?? null,
      nextState: entry.state,
      previousBucket: getEntryBucket(previous),
      nextBucket: entry.bucket,
      reason: null,
      clearedEntries: null,
      clearedReadyEntries: null,
    })
    traceAvatarVerboseFlow('renderer.avatarBitmapCache.markLoading', () => ({
      urlKey: summarizeAvatarUrlKey(urlKey),
      bucket,
      cacheSize: this.entries.size,
      capacity: this.cap,
      previousState: previous?.state ?? null,
      previousBucket: getEntryBucket(previous),
    }))
    return entry
  }

  public markReady(
    urlKey: AvatarUrlKey,
    bucket: ImageLodBucket,
    bitmap: AvatarBitmap,
    monogram: HTMLCanvasElement,
    bytes: number,
  ): AvatarReadyEntry {
    const previous = this.entries.get(urlKey)
    if (previous && previous.state === 'ready') {
      this.totalBytes -= previous.bytes
      closeBitmap(previous.bitmap)
    }
    const readyAt = Date.now()
    const entry: AvatarReadyEntry = {
      state: 'ready',
      bucket,
      bitmap,
      monogram,
      bytes,
      readyAt,
    }
    this.entries.set(urlKey, entry)
    this.totalBytes += bytes
    this.recordEvent({
      at: readyAt,
      type: 'mark_ready',
      urlKey,
      previousState: previous?.state ?? null,
      nextState: entry.state,
      previousBucket: getEntryBucket(previous),
      nextBucket: entry.bucket,
      reason: null,
      clearedEntries: null,
      clearedReadyEntries: null,
    })
    traceAvatarFlow('renderer.avatarBitmapCache.markReady', () => ({
      urlKey: summarizeAvatarUrlKey(urlKey),
      bucket,
      bytes,
      totalBytes: this.totalBytes,
      cacheSize: this.entries.size,
      capacity: this.cap,
      previousState: previous?.state ?? null,
    }))
    this.evictIfNeeded()
    return entry
  }

  public markFailed(
    urlKey: AvatarUrlKey,
    monogram: HTMLCanvasElement,
    reason: string | null = null,
    ttlMs: number | null = FAILED_TTL_MS,
  ): AvatarFailedEntry {
    const previous = this.entries.get(urlKey)
    if (previous && previous.state === 'ready') {
      this.totalBytes -= previous.bytes
      closeBitmap(previous.bitmap)
    }
    const failedAt = Date.now()
    const entry: AvatarFailedEntry = {
      state: 'failed',
      monogram,
      failedAt,
      expiresAt:
        ttlMs === null ? null : failedAt + Math.max(1, ttlMs),
      reason,
    }
    this.entries.set(urlKey, entry)
    this.recordEvent({
      at: failedAt,
      type: 'mark_failed',
      urlKey,
      previousState: previous?.state ?? null,
      nextState: entry.state,
      previousBucket: getEntryBucket(previous),
      nextBucket: null,
      reason,
      clearedEntries: null,
      clearedReadyEntries: null,
    })
    traceAvatarFlow('renderer.avatarBitmapCache.markFailed', () => ({
      urlKey: summarizeAvatarUrlKey(urlKey),
      reason,
      expiresAt: entry.expiresAt,
      permanent: entry.expiresAt === null,
      cacheSize: this.entries.size,
      capacity: this.cap,
      previousState: previous?.state ?? null,
    }))
    return entry
  }

  public delete(urlKey: AvatarUrlKey, reason = 'explicit') {
    const entry = this.entries.get(urlKey)
    if (!entry) {
      return
    }
    if (entry.state === 'ready') {
      this.totalBytes -= entry.bytes
      closeBitmap(entry.bitmap)
    }
    this.entries.delete(urlKey)
    this.recordEvent({
      at: Date.now(),
      type: 'delete',
      urlKey,
      previousState: entry.state,
      nextState: null,
      previousBucket: 'bucket' in entry ? entry.bucket : null,
      nextBucket: null,
      reason,
      clearedEntries: null,
      clearedReadyEntries: null,
    })
    traceAvatarFlow('renderer.avatarBitmapCache.delete', () => ({
      urlKey: summarizeAvatarUrlKey(urlKey),
      reason,
      previousState: entry.state,
      previousBucket: 'bucket' in entry ? entry.bucket : null,
      totalBytes: this.totalBytes,
      cacheSize: this.entries.size,
      capacity: this.cap,
    }))
  }

  public clear() {
    const beforeSize = this.entries.size
    const beforeMonograms = this.monograms.size
    const beforeBytes = this.totalBytes
    const clearedReadyEntries = [...this.entries.values()].reduce(
      (count, entry) => (entry.state === 'ready' ? count + 1 : count),
      0,
    )
    for (const entry of this.entries.values()) {
      if (entry.state === 'ready') {
        closeBitmap(entry.bitmap)
      }
    }
    this.entries.clear()
    this.monograms.clear()
    this.totalBytes = 0
    if (beforeSize > 0 || beforeMonograms > 0) {
      this.recordEvent({
        at: Date.now(),
        type: 'clear',
        urlKey: null,
        previousState: null,
        nextState: null,
        previousBucket: null,
        nextBucket: null,
        reason: null,
        clearedEntries: beforeSize,
        clearedReadyEntries,
      })
      traceAvatarFlow('renderer.avatarBitmapCache.clear', {
        clearedEntries: beforeSize,
        clearedMonograms: beforeMonograms,
        clearedBytes: beforeBytes,
      })
    }
  }

  public size(): number {
    return this.entries.size
  }

  public bytes(): number {
    return this.totalBytes
  }

  public getDebugSnapshot(): AvatarCacheDebugSnapshot {
    this.pruneExpiredFailedEntries(Date.now())
    const byState: AvatarCacheDebugSnapshot['byState'] = {
      loading: 0,
      ready: 0,
      failed: 0,
    }
    const entries: AvatarCacheEntryDebugSnapshot[] = []

    for (const [urlKey, entry] of this.entries) {
      byState[entry.state] += 1
      entries.push({
        urlKey,
        state: entry.state,
        bucket: 'bucket' in entry ? entry.bucket : null,
        startedAt: entry.state === 'loading' ? entry.startedAt : null,
        readyAt: entry.state === 'ready' ? entry.readyAt : null,
        failedAt: entry.state === 'failed' ? entry.failedAt : null,
        expiresAt: entry.state === 'failed' ? entry.expiresAt : null,
        bytes: entry.state === 'ready' ? entry.bytes : null,
        reason: entry.state === 'failed' ? entry.reason : null,
      })
    }

    return {
      capacity: this.cap,
      size: this.entries.size,
      totalBytes: this.totalBytes,
      monogramCount: this.monograms.size,
      byState,
      entries,
      recentEvents: [...this.recentEvents],
    }
  }

  private recordEvent(event: AvatarCacheRecentEventDebugSnapshot) {
    this.recentEvents.push(event)
    if (this.recentEvents.length > MAX_RECENT_DEBUG_EVENTS) {
      this.recentEvents.splice(
        0,
        this.recentEvents.length - MAX_RECENT_DEBUG_EVENTS,
      )
    }
  }

  private touch(urlKey: AvatarUrlKey, entry: AvatarEntry) {
    this.entries.delete(urlKey)
    this.entries.set(urlKey, entry)
  }

  private resolveEntry(urlKey: AvatarUrlKey, touch: boolean): AvatarEntry | undefined {
    const entry = this.entries.get(urlKey)
    if (!entry) {
      return undefined
    }
    if (
      entry.state === 'failed' &&
      entry.expiresAt !== null &&
      entry.expiresAt <= Date.now()
    ) {
      this.entries.delete(urlKey)
      this.recordEvent({
        at: Date.now(),
        type: 'failed_expired',
        urlKey,
        previousState: entry.state,
        nextState: null,
        previousBucket: null,
        nextBucket: null,
        reason: entry.reason,
        clearedEntries: null,
        clearedReadyEntries: null,
      })
      traceAvatarFlow('renderer.avatarBitmapCache.failedExpired', () => ({
        urlKey: summarizeAvatarUrlKey(urlKey),
        reason: entry.reason,
      }))
      return undefined
    }
    if (touch) {
      this.touch(urlKey, entry)
    }
    return entry
  }

  private pruneExpiredFailedEntries(now: number) {
    for (const [urlKey, entry] of this.entries) {
      if (
        entry.state === 'failed' &&
        entry.expiresAt !== null &&
        entry.expiresAt <= now
      ) {
        this.entries.delete(urlKey)
        this.recordEvent({
          at: now,
          type: 'failed_expired',
          urlKey,
          previousState: entry.state,
          nextState: null,
          previousBucket: null,
          nextBucket: null,
          reason: entry.reason,
          clearedEntries: null,
          clearedReadyEntries: null,
        })
        traceAvatarFlow('renderer.avatarBitmapCache.failedExpired', () => ({
          urlKey: summarizeAvatarUrlKey(urlKey),
          reason: entry.reason,
        }))
      }
    }
  }

  private evictIfNeeded() {
    if (this.entries.size <= this.cap) {
      return
    }
    const overflow = this.entries.size - this.cap
    const toEvict: AvatarUrlKey[] = []
    const iterator = this.entries.keys()
    for (let i = 0; i < overflow; i += 1) {
      const next = iterator.next()
      if (next.done) {
        break
      }
      toEvict.push(next.value)
    }
    for (const key of toEvict) {
      this.delete(key, 'lru_capacity')
    }
  }

  private evictMonogramsIfNeeded() {
    if (this.monograms.size <= this.monogramCap) {
      return
    }
    const overflow = this.monograms.size - this.monogramCap
    const iterator = this.monograms.keys()
    for (let i = 0; i < overflow; i += 1) {
      const next = iterator.next()
      if (next.done) {
        break
      }
      this.monograms.delete(next.value)
    }
  }
}
