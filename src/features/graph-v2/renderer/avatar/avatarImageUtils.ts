export { getAvatarMonogram } from '@/lib/avatarMonogram'

export const isSafeAvatarUrl = (
  value: string | null | undefined,
): value is string => {
  if (!value) {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export const IMAGE_LOD_BUCKETS = [32, 64, 128, 256, 512, 1024] as const
export type ImageLodBucket = (typeof IMAGE_LOD_BUCKETS)[number]

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const buildAvatarUrlKey = (pubkey: string, url: string): string =>
  `${pubkey}::${url}`

const clampBucket = (
  bucket: ImageLodBucket,
  maxBucket: ImageLodBucket,
): ImageLodBucket =>
  (IMAGE_LOD_BUCKETS.find(
    (candidate) => candidate >= Math.min(bucket, maxBucket),
  ) ?? maxBucket) as ImageLodBucket

export interface ResolveAvatarBucketForVisibleDiameterInput {
  visibleDiameterPx: number
  maxBucket?: ImageLodBucket
}

export const resolveAvatarBucketForVisibleDiameter = ({
  visibleDiameterPx,
  maxBucket = 512,
}: ResolveAvatarBucketForVisibleDiameterInput): ImageLodBucket => {
  const diameter = Number.isFinite(visibleDiameterPx)
    ? Math.max(0, visibleDiameterPx)
    : 0
  const bucket =
    diameter <= 16
      ? 32
      : diameter <= 32
        ? 64
        : diameter <= 80
          ? 128
          : diameter <= 160
            ? 256
            : 512

  return clampBucket(bucket, maxBucket)
}

const readDevicePixelRatio = () => {
  if (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.devicePixelRatio === 'number' &&
    Number.isFinite(globalThis.devicePixelRatio)
  ) {
    return globalThis.devicePixelRatio
  }

  return 1
}

export interface ResolveAvatarTargetPixelsInput {
  cssPixels: number
  devicePixelRatio?: number
  devicePixelRatioCap?: number
}

export const resolveImageTargetBucket = ({
  cssPixels,
  devicePixelRatio = readDevicePixelRatio(),
  devicePixelRatioCap = 2,
}: ResolveAvatarTargetPixelsInput): ImageLodBucket => {
  const safeCssPixels = Number.isFinite(cssPixels)
    ? clamp(Math.round(cssPixels), 16, IMAGE_LOD_BUCKETS.at(-1) ?? 1024)
    : 16
  const safeDevicePixelRatio = Number.isFinite(devicePixelRatio)
    ? clamp(devicePixelRatio, 1, Math.max(1, devicePixelRatioCap))
    : 1
  const rawTargetPixels = Math.round(safeCssPixels * safeDevicePixelRatio)

  return (
    IMAGE_LOD_BUCKETS.find((bucket) => bucket >= rawTargetPixels) ??
    IMAGE_LOD_BUCKETS.at(-1) ??
    1024
  )
}

export const clampImageBucketForMotion = ({
  bucket,
  velocityScore,
  priorityLane = false,
}: {
  bucket: ImageLodBucket
  velocityScore: number
  priorityLane?: boolean
}): ImageLodBucket => {
  if (velocityScore < 600) {
    return bucket
  }

  const cap = priorityLane ? 256 : 128
  return IMAGE_LOD_BUCKETS.find((candidate) => candidate >= Math.min(bucket, cap)) ?? cap
}

export const applyImageBucketHysteresis = ({
  previousBucket,
  requestedPixels,
  maxBucket,
}: {
  previousBucket: ImageLodBucket | null
  requestedPixels: number
  maxBucket?: ImageLodBucket
}): ImageLodBucket => {
  const nextBucket = resolveAvatarBucketForVisibleDiameter({
    visibleDiameterPx: requestedPixels,
    maxBucket,
  })
  if (previousBucket === null) {
    return nextBucket
  }

  const downgradeThreshold = previousBucket * 0.75
  const upgradeThreshold = previousBucket * 1.25

  if (requestedPixels >= upgradeThreshold || requestedPixels <= downgradeThreshold) {
    return nextBucket
  }

  return previousBucket
}

