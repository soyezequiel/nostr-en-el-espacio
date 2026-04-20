import {
  summarizeAvatarUrl,
  summarizeAvatarUrlKey,
  traceAvatarFlow,
  truncateAvatarPubkey,
} from '@/features/graph-runtime/debug/avatarTrace'

export interface AvatarTerminalFailureEntry {
  urlKey: string
  pubkey: string
  url: string
  host: string | null
  reason: string
  firstFailedAt: number
  lastFailedAt: number
  failureCount: number
}

interface AvatarTerminalFailureHostAggregate {
  totalFailures: number
  uniqueUrlKeys: Set<string>
  byReason: Map<string, number>
}

const terminalFailures = new Map<string, AvatarTerminalFailureEntry>()
const terminalFailuresByHost = new Map<string, AvatarTerminalFailureHostAggregate>()

const TERMINAL_REASON_SET = new Set([
  'unsafe_url',
  'decode_failed',
  'unsupported_content_type',
  'avatar_too_large',
  'unresolved_host',
])

const readHost = (url: string | null | undefined) => {
  if (!url) {
    return null
  }

  try {
    return new URL(url).host || null
  } catch {
    return null
  }
}

const buildAvatarTerminalFailureKey = (pubkey: string, url: string) =>
  `${pubkey}::${url}`

const parseHttpStatus = (reason: string | null | undefined) => {
  if (!reason) {
    return null
  }

  const match = /^http_(\d{3})(?:_|$)/.exec(reason)
  if (!match) {
    return null
  }

  return Number.parseInt(match[1] ?? '', 10)
}

const shouldTraceHostSummary = (totalFailures: number) =>
  totalFailures <= 3 || totalFailures % 5 === 0

export const isTerminalAvatarFailureReason = (
  reason: string | null | undefined,
) => {
  if (!reason) {
    return false
  }

  if (TERMINAL_REASON_SET.has(reason)) {
    return true
  }

  const status = parseHttpStatus(reason)
  return status !== null && [400, 401, 403, 404, 410, 422].includes(status)
}

export const rememberTerminalAvatarFailure = (input: {
  urlKey: string
  pubkey: string
  url: string
  reason: string
  at?: number
}) => {
  const at = input.at ?? Date.now()
  const host = readHost(input.url)
  const previous = terminalFailures.get(input.urlKey)
  const nextEntry: AvatarTerminalFailureEntry = previous
    ? {
        ...previous,
        reason: input.reason,
        lastFailedAt: at,
        failureCount: previous.failureCount + 1,
      }
    : {
        urlKey: input.urlKey,
        pubkey: input.pubkey,
        url: input.url,
        host,
        reason: input.reason,
        firstFailedAt: at,
        lastFailedAt: at,
        failureCount: 1,
      }

  terminalFailures.set(input.urlKey, nextEntry)

  const hostKey = host ?? '(unknown)'
  const hostAggregate =
    terminalFailuresByHost.get(hostKey) ?? {
      totalFailures: 0,
      uniqueUrlKeys: new Set<string>(),
      byReason: new Map<string, number>(),
    }

  hostAggregate.totalFailures += 1
  hostAggregate.uniqueUrlKeys.add(input.urlKey)
  hostAggregate.byReason.set(
    input.reason,
    (hostAggregate.byReason.get(input.reason) ?? 0) + 1,
  )
  terminalFailuresByHost.set(hostKey, hostAggregate)

  traceAvatarFlow('avatarTerminalFailure.recorded', () => ({
    pubkey: input.pubkey,
    pubkeyShort: truncateAvatarPubkey(input.pubkey),
    urlKey: summarizeAvatarUrlKey(input.urlKey),
    url: summarizeAvatarUrl(input.url),
    host,
    reason: input.reason,
    failureCount: nextEntry.failureCount,
    firstFailedAt: nextEntry.firstFailedAt,
    lastFailedAt: nextEntry.lastFailedAt,
  }))

  if (shouldTraceHostSummary(hostAggregate.totalFailures)) {
    traceAvatarFlow('avatarTerminalFailure.hostSummary', () => ({
      host,
      totalFailures: hostAggregate.totalFailures,
      uniqueUrlCount: hostAggregate.uniqueUrlKeys.size,
      byReason: Object.fromEntries(
        [...hostAggregate.byReason.entries()].sort((left, right) =>
          left[0].localeCompare(right[0]),
        ),
      ),
    }))
  }

  return nextEntry
}

export const getTerminalAvatarFailure = (urlKey: string) =>
  terminalFailures.get(urlKey) ?? null

export const getTerminalAvatarFailureForPicture = (
  pubkey: string,
  url: string | null | undefined,
) => {
  const normalizedUrl = url?.trim() ?? ''
  if (!normalizedUrl) {
    return null
  }

  return (
    terminalFailures.get(buildAvatarTerminalFailureKey(pubkey, normalizedUrl)) ??
    null
  )
}

export const clearTerminalAvatarFailure = (urlKey: string) => {
  terminalFailures.delete(urlKey)
}
