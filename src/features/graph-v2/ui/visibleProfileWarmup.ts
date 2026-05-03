import type { CanonicalNode } from '@/features/graph-v2/domain/types'

export interface VisibleProfileWarmupSelectionInput {
  viewportPubkeys: readonly string[]
  scenePubkeys: readonly string[]
  nodesByPubkey: Readonly<Record<string, CanonicalNode>>
  attemptedAtByPubkey: ReadonlyMap<string, number>
  inflightPubkeys: ReadonlySet<string>
  now: number
  batchSize: number
  cooldownMs: number
}

export interface VisibleProfileWarmupSelection {
  pubkeys: string[]
  viewportPubkeyCount: number
  scenePubkeyCount: number
  orderedPubkeyCount: number
  eligibleCount: number
  skipped: {
    missingNode: number
    alreadyUsable: number
    inflight: number
    cooldown: number
  }
}

export interface VisibleProfileWarmupDebugSnapshot
  extends VisibleProfileWarmupSelection {
  generatedAtMs: number
  selectedSamples: string[]
  attemptedCount: number
  inflightCount: number
  profileStates: ProfileWarmupStateCounts
  viewportProfileStates: ProfileWarmupStateCounts
  latency: VisibleProfileWarmupLatencySnapshot
}

interface ProfileWarmupStateCounts {
  idle: number
  loading: number
  readyUsable: number
  readyEmpty: number
  missing: number
  unknown: number
}

export type VisibleProfileWarmupLatencySource =
  | 'relay'
  | 'primal-cache'
  | 'profile-cache'
  | 'unknown'

export type VisibleProfileWarmupLatencyStatus =
  | 'ready'
  | 'inflight'
  | 'missing'
  | 'pending'
  | 'cached-before-attempt'

export interface VisibleProfileWarmupLatencyAttempt {
  pubkey: string
  pubkeyShort: string
  attemptedAtMs: number
  ageMs: number
  completedAtMs: number | null
  durationMs: number | null
  source: VisibleProfileWarmupLatencySource
  status: VisibleProfileWarmupLatencyStatus
  hasPicture: boolean
  profileState: CanonicalNode['profileState'] | 'unknown'
}

export interface VisibleProfileWarmupLatencySnapshot {
  inflightOldestAgeMs: number | null
  completedCount: number
  inflightCount: number
  relayCompletedCount: number
  p50RelayMs: number | null
  p95RelayMs: number | null
  attempts: VisibleProfileWarmupLatencyAttempt[]
}

const MAX_VISIBLE_PROFILE_LATENCY_ATTEMPTS = 80
const PROFILE_CACHE_BEFORE_ATTEMPT_GRACE_MS = 250

export const hasUsableCanonicalProfile = (
  node: CanonicalNode | null | undefined,
) =>
  Boolean(
    node?.label?.trim() ||
      node?.picture?.trim() ||
      node?.about?.trim() ||
      node?.nip05?.trim() ||
      node?.lud16?.trim(),
  )

export const shouldWarmVisibleProfile = (
  node: CanonicalNode | null | undefined,
) => Boolean(node && (node.profileState !== 'ready' || !hasUsableCanonicalProfile(node)))

export const orderProfileWarmupPubkeys = ({
  viewportPubkeys,
  scenePubkeys,
}: {
  viewportPubkeys: readonly string[]
  scenePubkeys: readonly string[]
}) => Array.from(new Set([...viewportPubkeys, ...scenePubkeys].filter(Boolean)))

export const selectVisibleProfileWarmupPubkeys = ({
  viewportPubkeys,
  scenePubkeys,
  nodesByPubkey,
  attemptedAtByPubkey,
  inflightPubkeys,
  now,
  batchSize,
  cooldownMs,
}: VisibleProfileWarmupSelectionInput): VisibleProfileWarmupSelection => {
  const orderedPubkeys = orderProfileWarmupPubkeys({
    viewportPubkeys,
    scenePubkeys,
  })
  const pubkeys: string[] = []
  const skipped = {
    missingNode: 0,
    alreadyUsable: 0,
    inflight: 0,
    cooldown: 0,
  }
  let eligibleCount = 0

  for (const pubkey of orderedPubkeys) {
    const node = nodesByPubkey[pubkey]
    if (!node) {
      skipped.missingNode += 1
      continue
    }
    if (!shouldWarmVisibleProfile(node)) {
      skipped.alreadyUsable += 1
      continue
    }

    eligibleCount += 1

    if (inflightPubkeys.has(pubkey)) {
      skipped.inflight += 1
      continue
    }

    const attemptedAt = attemptedAtByPubkey.get(pubkey) ?? 0
    if (now - attemptedAt < cooldownMs) {
      skipped.cooldown += 1
      continue
    }

    if (pubkeys.length < batchSize) {
      pubkeys.push(pubkey)
    }
  }

  return {
    pubkeys,
    viewportPubkeyCount: viewportPubkeys.length,
    scenePubkeyCount: scenePubkeys.length,
    orderedPubkeyCount: orderedPubkeys.length,
    eligibleCount,
    skipped,
  }
}

export const buildVisibleProfileWarmupDebugSnapshot = (
  input: VisibleProfileWarmupSelectionInput,
): VisibleProfileWarmupDebugSnapshot => {
  const selection = selectVisibleProfileWarmupPubkeys(input)
  const orderedPubkeys = orderProfileWarmupPubkeys(input)

  return {
    ...selection,
    generatedAtMs: input.now,
    selectedSamples: selection.pubkeys.map((pubkey) => pubkey.slice(0, 12)),
    attemptedCount: input.attemptedAtByPubkey.size,
    inflightCount: input.inflightPubkeys.size,
    profileStates: countProfileStates(orderedPubkeys, input.nodesByPubkey),
    viewportProfileStates: countProfileStates(
      input.viewportPubkeys,
      input.nodesByPubkey,
    ),
    latency: buildVisibleProfileWarmupLatencySnapshot(input),
  }
}

const buildVisibleProfileWarmupLatencySnapshot = ({
  attemptedAtByPubkey,
  inflightPubkeys,
  nodesByPubkey,
  now,
}: VisibleProfileWarmupSelectionInput): VisibleProfileWarmupLatencySnapshot => {
  const attempts: VisibleProfileWarmupLatencyAttempt[] = Array.from(
    attemptedAtByPubkey.entries(),
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, MAX_VISIBLE_PROFILE_LATENCY_ATTEMPTS)
    .map(([pubkey, attemptedAtMs]) => {
      const node = nodesByPubkey[pubkey]
      const profileState = node?.profileState ?? 'unknown'
      const fetchedAt = node?.profileFetchedAt ?? null
      const hasPicture = Boolean(node?.picture?.trim())
      const ageMs = Math.max(0, now - attemptedAtMs)
      const source = normalizeWarmupLatencySource(node?.profileSource)

      if (
        profileState === 'ready' &&
        typeof fetchedAt === 'number' &&
        fetchedAt < attemptedAtMs - PROFILE_CACHE_BEFORE_ATTEMPT_GRACE_MS
      ) {
        return {
          pubkey,
          pubkeyShort: pubkey.slice(0, 12),
          attemptedAtMs,
          ageMs,
          completedAtMs: fetchedAt,
          durationMs: null,
          source: 'profile-cache',
          status: 'cached-before-attempt',
          hasPicture,
          profileState,
        }
      }

      if (profileState === 'ready' && typeof fetchedAt === 'number') {
        return {
          pubkey,
          pubkeyShort: pubkey.slice(0, 12),
          attemptedAtMs,
          ageMs,
          completedAtMs: fetchedAt,
          durationMs: Math.max(0, fetchedAt - attemptedAtMs),
          source,
          status: 'ready',
          hasPicture,
          profileState,
        }
      }

      if (inflightPubkeys.has(pubkey)) {
        return {
          pubkey,
          pubkeyShort: pubkey.slice(0, 12),
          attemptedAtMs,
          ageMs,
          completedAtMs: null,
          durationMs: null,
          source,
          status: 'inflight',
          hasPicture,
          profileState,
        }
      }

      return {
        pubkey,
        pubkeyShort: pubkey.slice(0, 12),
        attemptedAtMs,
        ageMs,
        completedAtMs: null,
        durationMs: null,
        source,
        status: profileState === 'missing' ? 'missing' : 'pending',
        hasPicture,
        profileState,
      }
    })

  const relayDurations = attempts
    .filter(
      (attempt) =>
        attempt.status === 'ready' &&
        attempt.durationMs !== null &&
        (attempt.source === 'relay' || attempt.source === 'primal-cache'),
    )
    .map((attempt) => attempt.durationMs!)

  const inflightAges = attempts
    .filter((attempt) => attempt.status === 'inflight')
    .map((attempt) => attempt.ageMs)

  return {
    inflightOldestAgeMs:
      inflightAges.length > 0 ? Math.max(...inflightAges) : null,
    completedCount: attempts.filter((attempt) => attempt.status === 'ready').length,
    inflightCount: attempts.filter((attempt) => attempt.status === 'inflight').length,
    relayCompletedCount: relayDurations.length,
    p50RelayMs: percentile(relayDurations, 50),
    p95RelayMs: percentile(relayDurations, 95),
    attempts,
  }
}

const normalizeWarmupLatencySource = (
  source: string | null | undefined,
): VisibleProfileWarmupLatencySource => {
  if (source === 'relay' || source === 'primal-cache' || source === 'profile-cache') {
    return source
  }
  return 'unknown'
}

const percentile = (values: number[], percentileValue: number) => {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))] ?? null
}

const countProfileStates = (
  pubkeys: readonly string[],
  nodesByPubkey: Readonly<Record<string, CanonicalNode>>,
): ProfileWarmupStateCounts => {
  const counts: ProfileWarmupStateCounts = {
    idle: 0,
    loading: 0,
    readyUsable: 0,
    readyEmpty: 0,
    missing: 0,
    unknown: 0,
  }

  for (const pubkey of pubkeys) {
    const node = nodesByPubkey[pubkey]
    if (!node) {
      counts.unknown += 1
      continue
    }

    if (node.profileState === 'ready') {
      if (hasUsableCanonicalProfile(node)) {
        counts.readyUsable += 1
      } else {
        counts.readyEmpty += 1
      }
      continue
    }

    counts[node.profileState] += 1
  }

  return counts
}
