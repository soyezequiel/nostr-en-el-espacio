import type { ImageLodBucket } from '@/features/graph/render/avatar'

export type AvatarUrlKey = string

export type AvatarBitmap = ImageBitmap | HTMLCanvasElement

export interface AvatarLoadingEntry {
  state: 'loading'
  bucket: ImageLodBucket
  monogram: HTMLCanvasElement
  startedAt: number
}

export interface AvatarReadyEntry {
  state: 'ready'
  bucket: ImageLodBucket
  bitmap: AvatarBitmap
  monogram: HTMLCanvasElement
  bytes: number
  readyAt: number
}

export interface AvatarFailedEntry {
  state: 'failed'
  monogram: HTMLCanvasElement
  expiresAt: number
}

export type AvatarEntry = AvatarLoadingEntry | AvatarReadyEntry | AvatarFailedEntry

export interface AvatarBudget {
  readonly sizeThreshold: number
  readonly zoomThreshold: number
  readonly concurrency: number
  readonly maxBucket: ImageLodBucket
  readonly lruCap: number
  readonly drawAvatars: boolean
}

export type DeviceTier = 'low' | 'mid' | 'high'

export const DEFAULT_BUDGETS: Record<DeviceTier, AvatarBudget> = {
  low: {
    sizeThreshold: 16,
    zoomThreshold: 1.2,
    concurrency: 2,
    maxBucket: 64,
    lruCap: 192,
    drawAvatars: true,
  },
  mid: {
    sizeThreshold: 12,
    zoomThreshold: 1.5,
    concurrency: 4,
    maxBucket: 128,
    lruCap: 384,
    drawAvatars: true,
  },
  high: {
    sizeThreshold: 12,
    zoomThreshold: 2,
    concurrency: 6,
    maxBucket: 256,
    lruCap: 512,
    drawAvatars: true,
  },
}
