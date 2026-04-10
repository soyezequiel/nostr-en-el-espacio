import type { Event, Filter } from 'nostr-tools'

import type {
  AppStore,
  GraphNode,
  RelayHealth,
  RelayHealthStatus as StoreRelayHealthStatus,
} from '@/features/graph/app/store'
import type { ProfileRecord } from '@/features/graph/db/entities'
import { deriveDirectedEvidence } from '@/features/graph/evidence/directedEvidence'
import {
  normalizeRelayUrl,
  type RelayEventEnvelope,
  type RelayHealthSnapshot,
  type RelayQueryFilter,
  type RelaySubscriptionSummary,
} from '@/features/graph/nostr'
import type { NodeDetailProfile } from '@/features/graph/kernel/runtime'
import {
  MAX_SESSION_RELAYS,
  MAX_ZAP_RECEIPTS,
} from '@/features/graph/kernel/modules/constants'
import type { RelayAdapterInstance } from '@/features/graph/kernel/modules/context'
import type { ZapReceiptInput } from '@/features/graph/workers/events/contracts'

export interface MergedRelayEventEnvelope {
  event: Event
  relayUrls: string[]
  relayUrl: string
  receivedAtMs: number
}

export interface RelayCollectionResult {
  events: RelayEventEnvelope[]
  summary: RelaySubscriptionSummary | null
  error: Error | null
}

export type RelayOverrideValidationResult =
  | {
    status: 'valid'
    relayUrls: string[]
    diagnostics: string[]
  }
  | {
    status: 'invalid'
    relayUrls: []
    message: string
    diagnostics: string[]
  }

export type KernelCommandErrorCode =
  | 'NODE_NOT_FOUND'
  | 'CAP_REACHED'
  | 'COMMAND_FAILED'

export class KernelCommandError extends Error {
  public readonly code: KernelCommandErrorCode
  public readonly details: Record<string, unknown>

  constructor(
    code: KernelCommandErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'KernelCommandError'
    this.code = code
    this.details = details
  }
}

export function buildMutualAdjacency(
  state: Pick<AppStore, 'links' | 'inboundLinks' | 'nodes'>,
): Record<string, string[]> {
  const evidence = deriveDirectedEvidence({
    links: state.links,
    inboundLinks: state.inboundLinks,
  })

  return Object.fromEntries(
    Object.keys(state.nodes)
      .sort()
      .map((pubkey) => [pubkey, evidence.mutualAdjacency[pubkey] ?? []]),
  )
}

export function mapRelayHealthStatus(
  status: RelayHealthSnapshot['status'],
): StoreRelayHealthStatus {
  switch (status) {
    case 'healthy':
      return 'connected'
    case 'degraded':
      return 'degraded'
    case 'offline':
      return 'offline'
    default:
      return 'unknown'
  }
}

export function validateRelayOverrideInput(
  rawRelayUrls: readonly string[],
): RelayOverrideValidationResult {
  const dedupedRelayUrls = Array.from(
    new Set(rawRelayUrls.map((relayUrl) => relayUrl.trim()).filter(Boolean)),
  )

  if (dedupedRelayUrls.length === 0) {
    return {
      status: 'invalid',
      relayUrls: [],
      message: 'Debes ingresar al menos un relay valido.',
      diagnostics: [],
    }
  }

  if (dedupedRelayUrls.length > MAX_SESSION_RELAYS) {
    return {
      status: 'invalid',
      relayUrls: [],
      message: `El limite de relays por sesion es ${MAX_SESSION_RELAYS}.`,
      diagnostics: [],
    }
  }

  const normalizedRelayUrls: string[] = []
  const diagnostics: string[] = []

  for (const relayUrl of dedupedRelayUrls) {
    try {
      normalizedRelayUrls.push(normalizeRelayUrl(relayUrl))
    } catch (error) {
      diagnostics.push(
        `${relayUrl}: ${error instanceof Error ? error.message : 'URL invalida.'}`,
      )
    }
  }

  if (diagnostics.length > 0) {
    return {
      status: 'invalid',
      relayUrls: [],
      message: 'Hay URLs de relay invalidas. Revisa los diagnosticos.',
      diagnostics,
    }
  }

  return {
    status: 'valid',
    relayUrls: normalizedRelayUrls,
    diagnostics,
  }
}

export function createIdleRelayHealthSnapshotMap(
  relayUrls: readonly string[],
  now: number,
): Record<string, RelayHealthSnapshot> {
  return Object.fromEntries(
    relayUrls.map((relayUrl) => [
      relayUrl,
      {
        url: relayUrl,
        status: 'idle',
        attempt: 0,
        activeSubscriptions: 0,
        consecutiveFailures: 0,
        lastChangeMs: now,
      } satisfies RelayHealthSnapshot,
    ]),
  )
}

export function createRelayHealthSnapshotFromStore(
  relayUrl: string,
  relayHealth: RelayHealth | undefined,
  now: number,
): RelayHealthSnapshot {
  if (!relayHealth) {
    return {
      url: relayUrl,
      status: 'idle',
      attempt: 0,
      activeSubscriptions: 0,
      consecutiveFailures: 0,
      lastChangeMs: now,
    }
  }

  return {
    url: relayUrl,
    status: mapStoreRelayHealthStatus(relayHealth.status),
    attempt: 0,
    activeSubscriptions: 0,
    consecutiveFailures: 0,
    lastChangeMs: relayHealth.lastCheckedAt ?? now,
    lastNotice: relayHealth.lastNotice ?? undefined,
  }
}

export function mapStoreRelayHealthStatus(
  status: StoreRelayHealthStatus,
): RelayHealthSnapshot['status'] {
  switch (status) {
    case 'connected':
      return 'healthy'
    case 'degraded':
    case 'partial':
      return 'degraded'
    case 'offline':
      return 'offline'
    default:
      return 'idle'
  }
}

export async function collectRelayEvents(
  adapter: RelayAdapterInstance,
  filters: RelayQueryFilter[],
): Promise<RelayCollectionResult> {
  return new Promise<RelayCollectionResult>((resolve) => {
    const events: RelayEventEnvelope[] = []
    let settled = false
    let cancel = () => {}

    const finalize = (result: RelayCollectionResult) => {
      if (settled) {
        return
      }

      settled = true
      cancel()
      resolve(result)
    }

    cancel = adapter.subscribe(filters).subscribe({
      next: (value) => {
        events.push(value)
      },
      error: (error) => {
        finalize({
          events,
          summary: null,
          error,
        })
      },
      complete: (summary) => {
        finalize({
          events,
          summary,
          error: null,
        })
      },
    })
  })
}

export async function runWithConcurrencyLimit<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return
  }

  const concurrency = Math.max(1, Math.min(limit, items.length))
  let nextIndex = 0

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex]
      nextIndex += 1
      await worker(item)
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      await runWorker()
    }),
  )
}

export function selectLatestReplaceableEvent(
  events: RelayEventEnvelope[],
): RelayEventEnvelope | null {
  if (events.length === 0) {
    return null
  }

  return events
    .slice()
    .sort((left, right) => {
      if (left.event.created_at !== right.event.created_at) {
        return right.event.created_at - left.event.created_at
      }

      return left.event.id.localeCompare(right.event.id)
    })[0]
}

export function selectLatestReplaceableEventsByPubkey(
  events: RelayEventEnvelope[],
): RelayEventEnvelope[] {
  const latestByPubkey = new Map<string, RelayEventEnvelope>()

  for (const envelope of events) {
    const current = latestByPubkey.get(envelope.event.pubkey)
    if (!current) {
      latestByPubkey.set(envelope.event.pubkey, envelope)
      continue
    }

    if (envelope.event.created_at > current.event.created_at) {
      latestByPubkey.set(envelope.event.pubkey, envelope)
      continue
    }

    if (
      envelope.event.created_at === current.event.created_at &&
      envelope.event.id.localeCompare(current.event.id) < 0
    ) {
      latestByPubkey.set(envelope.event.pubkey, envelope)
    }
  }

  return Array.from(latestByPubkey.values()).sort((left, right) =>
    left.event.pubkey.localeCompare(right.event.pubkey),
  )
}

export function serializeContactListEvent(event: Event) {
  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    createdAt: event.created_at,
    tags: event.tags,
  }
}

export function safeParseProfile(content: string): {
  name: string | null
  about: string | null
  picture: string | null
  nip05: string | null
  lud16: string | null
} | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    return {
      name: firstString(parsed.display_name, parsed.name),
      about: firstString(parsed.about),
      picture: firstString(parsed.picture),
      nip05: firstString(parsed.nip05),
      lud16: firstString(parsed.lud16),
    }
  } catch {
    return null
  }
}

export function mapProfileRecordToNodeProfile(
  profile: ProfileRecord,
): NodeDetailProfile {
  return {
    eventId: profile.eventId,
    fetchedAt: profile.fetchedAt,
    name: profile.name,
    about: profile.about,
    picture: profile.picture,
    nip05: profile.nip05,
    lud16: profile.lud16,
  }
}

export function buildNodeProfileFromNode(node: GraphNode): NodeDetailProfile {
  return {
    eventId: node.profileEventId ?? '',
    fetchedAt: node.profileFetchedAt ?? 0,
    name: node.label ?? null,
    about: node.about ?? null,
    picture: node.picture ?? null,
    nip05: node.nip05 ?? null,
    lud16: node.lud16 ?? null,
  }
}

export function tokenizeKeyword(keyword: string): string[] {
  return [
    ...new Set(
      keyword
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length > 1),
    ),
  ].sort()
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

export function chunkIntoBatches<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) {
    return [items.slice()]
  }

  const batches: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }

  return batches
}

export function findDTag(event: Event): string | null {
  return event.tags.find((tag) => tag[0] === 'd')?.[1] ?? null
}

export function findEventTagValue(
  tags: string[][],
  tagName: string,
): string | null {
  return tags.find((tag) => tag[0] === tagName)?.[1] ?? null
}

export function buildZapReceiptsFilter(
  visiblePubkeys: readonly string[],
): Filter & { '#p': string[] } {
  return {
    kinds: [9735],
    '#p': [...visiblePubkeys],
    limit: Math.min(
      MAX_ZAP_RECEIPTS,
      Math.max(50, visiblePubkeys.length * 20),
    ),
  }
}

export function mergeRelayEventsById(
  events: readonly RelayEventEnvelope[],
): MergedRelayEventEnvelope[] {
  const mergedById = new Map<string, MergedRelayEventEnvelope>()

  for (const envelope of events) {
    const existing = mergedById.get(envelope.event.id)

    if (!existing) {
      mergedById.set(envelope.event.id, {
        event: envelope.event,
        relayUrls: [envelope.relayUrl],
        relayUrl: envelope.relayUrl,
        receivedAtMs: envelope.receivedAtMs,
      })
      continue
    }

    existing.relayUrls = Array.from(
      new Set([...existing.relayUrls, envelope.relayUrl]),
    ).sort()
    existing.receivedAtMs = Math.max(
      existing.receivedAtMs,
      envelope.receivedAtMs,
    )
  }

  return Array.from(mergedById.values()).sort((left, right) => {
    if (left.event.created_at !== right.event.created_at) {
      return left.event.created_at - right.event.created_at
    }

    return left.event.id.localeCompare(right.event.id)
  })
}

export function serializeZapReceiptEvent(event: Event): ZapReceiptInput {
  return {
    id: event.id,
    kind: event.kind,
    createdAt: event.created_at,
    tags: event.tags,
  }
}
