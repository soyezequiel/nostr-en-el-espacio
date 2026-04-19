import type { SocialGraphCaptureFormat } from '@/features/graph-v2/renderer/socialGraphCapture'

export interface SocialCaptureDebugProgressSnapshot {
  loaded: number
  total: number
  failed?: number
  missing?: number
  drawn?: number
  fallbackWithPhoto?: number
  attempted?: number
  retried?: number
  timedOut?: boolean
  topFailureReason?: string
  topFailureHost?: string
  topFailureHostReason?: string
  failureReasons?: Record<string, number>
  failureHosts?: Record<string, number>
  failureHostReasons?: Record<string, number>
  failureSamples?: Record<string, string[]>
  drawFallbackReasons?: Record<string, number>
  drawFallbackHosts?: Record<string, number>
  drawFallbackSamples?: Record<string, string[]>
}

export interface SocialCaptureDebugBrowserSnapshot {
  userAgent: string
  language?: string
  devicePixelRatio: number
  viewport: {
    width: number
    height: number
  }
}

export interface SocialCaptureDebugLocationSnapshot {
  pathname: string
  search: string
}

export interface SocialCaptureDebugPayloadInput {
  generatedAt: string
  format: SocialGraphCaptureFormat
  formatLabel: string
  pngFileName: string
  progress: SocialCaptureDebugProgressSnapshot | null
  browser?: SocialCaptureDebugBrowserSnapshot
  location?: SocialCaptureDebugLocationSnapshot
}

export const isSocialCaptureDebugDownloadEnabled = (
  nodeEnv = readNodeEnv(),
) => nodeEnv === 'development'

export const buildSocialCaptureDebugFilename = (
  format: SocialGraphCaptureFormat,
  stamp: string,
) => `sigma-graph-${format}-${stamp}.debug.json`

export const buildSocialCaptureDebugPayload = ({
  generatedAt,
  format,
  formatLabel,
  pngFileName,
  progress,
  browser,
  location,
}: SocialCaptureDebugPayloadInput) => {
  const nodesWithPictureUrl = progress?.total ?? null
  const nodesWithoutPicture = progress?.missing ?? null
  const visibleNodes =
    nodesWithPictureUrl === null
      ? null
      : nodesWithPictureUrl + (nodesWithoutPicture ?? 0)

  return {
    schemaVersion: 1,
    type: 'sigma-social-capture-debug',
    generatedAt,
    environment: {
      nodeEnv: readNodeEnv() ?? null,
      devOnly: true,
    },
    capture: {
      surface: '/labs/sigma',
      format,
      formatLabel,
      pngFileName,
      location: location ?? null,
    },
    browser: browser ?? null,
    counts: {
      visibleNodes,
      nodesWithPictureUrl,
      nodesWithoutPicture,
      loadedBitmaps: progress?.loaded ?? null,
      drawnPhotos: progress?.drawn ?? null,
      drawFallbacksWithPicture: progress?.fallbackWithPhoto ?? null,
      failedLoads: progress?.failed ?? null,
      loadAttempts: progress?.attempted ?? null,
      retries: progress?.retried ?? null,
      timedOut: progress?.timedOut ?? false,
    },
    failures: {
      topReason: progress?.topFailureReason ?? null,
      topHost: progress?.topFailureHost ?? null,
      topHostReason: progress?.topFailureHostReason ?? null,
      byReason: sortCountMap(progress?.failureReasons),
      byHost: sortCountMap(progress?.failureHosts),
      byHostReason: sortCountMap(progress?.failureHostReasons),
      samples: sortSampleMap(progress?.failureSamples),
    },
    drawFallbacks: {
      byReason: sortCountMap(progress?.drawFallbackReasons),
      byHost: sortCountMap(progress?.drawFallbackHosts),
      samples: sortSampleMap(progress?.drawFallbackSamples),
    },
    rawProgress: progress ?? null,
  }
}

export const readSocialCaptureDebugBrowserSnapshot =
  (): SocialCaptureDebugBrowserSnapshot | undefined => {
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

export const readSocialCaptureDebugLocationSnapshot =
  (): SocialCaptureDebugLocationSnapshot | undefined => {
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

const sortSampleMap = (values: Record<string, string[]> | undefined) =>
  Object.fromEntries(
    Object.entries(values ?? {})
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([key, samples]) => [key, [...samples]]),
  )
