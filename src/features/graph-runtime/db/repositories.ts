import Dexie from 'dexie'

import { NostrGraphDexie } from '@/features/graph-runtime/db/database'
import type {
  AddressableHeadKey,
  AddressableHeadRecord,
  ContactListRecord,
  ImageVariantRecord,
  InboundFollowerSnapshotRecord,
  InboundRefRecord,
  NoteExtractRecord,
  ProfileRecord,
  RawEventInput,
  RawEventRecord,
  RelayDiscoveryStatsRecord,
  RelayListRecord,
  ReplaceableHeadKey,
  ReplaceableHeadRecord,
  ZapRecord,
} from '@/features/graph-runtime/db/entities'
import {
  buildTieBreakKey,
  compareRawEvents,
  mergeCaptureScope,
  shouldReplaceCanonicalHead,
  shouldReplaceProjection,
  toSortedUniqueStrings,
} from '@/features/graph-runtime/db/utils'
import {
  logTerminalWarning,
  summarizeHumanTerminalError,
} from '@/features/graph-runtime/debug/humanTerminalLog'

export class RawEventsRepository {
  private readonly db: NostrGraphDexie

  public constructor(db: NostrGraphDexie) {
    this.db = db
  }

  public async upsert(input: RawEventInput): Promise<RawEventRecord> {
    const existing = await this.db.rawEvents.get(input.id)
    const normalizedRecord: RawEventRecord = {
      ...input,
      relayUrls: toSortedUniqueStrings(input.relayUrls),
      cacheUrls: toSortedUniqueStrings(input.cacheUrls ?? []),
      dTag: input.dTag ?? null,
      firstSeenAt: input.firstSeenAt ?? input.fetchedAt,
      lastSeenAt: input.lastSeenAt ?? input.fetchedAt,
    }

    if (!existing) {
      await this.db.rawEvents.put(normalizedRecord)
      return normalizedRecord
    }

    const mergedRecord: RawEventRecord = {
      ...existing,
      ...normalizedRecord,
      fetchedAt: Math.max(existing.fetchedAt, normalizedRecord.fetchedAt),
      firstSeenAt: Math.min(existing.firstSeenAt, normalizedRecord.firstSeenAt),
      lastSeenAt: Math.max(existing.lastSeenAt, normalizedRecord.lastSeenAt),
      relayUrls: toSortedUniqueStrings([...existing.relayUrls, ...normalizedRecord.relayUrls]),
      cacheUrls: toSortedUniqueStrings([
        ...(existing.cacheUrls ?? []),
        ...(normalizedRecord.cacheUrls ?? []),
      ]),
      captureScope: mergeCaptureScope(existing.captureScope, normalizedRecord.captureScope),
    }

    await this.db.rawEvents.put(mergedRecord)
    return mergedRecord
  }

  public async getById(id: string): Promise<RawEventRecord | undefined> {
    return this.db.rawEvents.get(id)
  }

  public async findByPubkeyAndKind(pubkey: string, kind: number): Promise<RawEventRecord[]> {
    const records = await this.db.rawEvents.where('[pubkey+kind]').equals([pubkey, kind]).toArray()
    return records.sort(compareRawEvents)
  }
}

export class ReplaceableHeadsRepository {
  private readonly db: NostrGraphDexie

  public constructor(db: NostrGraphDexie) {
    this.db = db
  }

  public async upsert(record: Omit<ReplaceableHeadRecord, 'tieBreakKey'>): Promise<ReplaceableHeadRecord> {
    const key: ReplaceableHeadKey = [record.pubkey, record.kind]
    const existing = await this.db.replaceableHeads.get(key)
    const normalizedRecord: ReplaceableHeadRecord = {
      ...record,
      tieBreakKey: buildTieBreakKey(record.createdAt, record.eventId),
    }

    if (!existing || shouldReplaceCanonicalHead(existing, normalizedRecord)) {
      await this.db.replaceableHeads.put(normalizedRecord)
      return normalizedRecord
    }

    return existing
  }

  public async get(pubkey: string, kind: number): Promise<ReplaceableHeadRecord | undefined> {
    return this.db.replaceableHeads.get([pubkey, kind])
  }
}

export class AddressableHeadsRepository {
  private readonly db: NostrGraphDexie

  public constructor(db: NostrGraphDexie) {
    this.db = db
  }

  public async upsert(record: Omit<AddressableHeadRecord, 'tieBreakKey'>): Promise<AddressableHeadRecord> {
    const key: AddressableHeadKey = [record.pubkey, record.kind, record.dTag]
    const existing = await this.db.addressableHeads.get(key)
    const normalizedRecord: AddressableHeadRecord = {
      ...record,
      tieBreakKey: buildTieBreakKey(record.createdAt, record.eventId),
    }

    if (!existing || shouldReplaceCanonicalHead(existing, normalizedRecord)) {
      await this.db.addressableHeads.put(normalizedRecord)
      return normalizedRecord
    }

    return existing
  }

  public async get(
    pubkey: string,
    kind: number,
    dTag: string,
  ): Promise<AddressableHeadRecord | undefined> {
    return this.db.addressableHeads.get([pubkey, kind, dTag])
  }
}

export class ProfilesRepository {
  private readonly db: NostrGraphDexie

  public constructor(db: NostrGraphDexie) {
    this.db = db
  }

  public async upsert(record: ProfileRecord): Promise<ProfileRecord> {
    const existing = await this.db.profiles.get(record.pubkey)

    const shouldPromoteRelaySource =
      existing?.profileSource === 'primal-cache' &&
      record.profileSource === 'relay' &&
      existing.eventId === record.eventId &&
      existing.createdAt === record.createdAt

    if (!existing || shouldReplaceProjection(existing, record) || shouldPromoteRelaySource) {
      await this.db.profiles.put(record)
      return record
    }

    return existing
  }

  public async get(pubkey: string): Promise<ProfileRecord | undefined> {
    return this.db.profiles.get(pubkey)
  }

  public async getMany(
    pubkeys: readonly string[],
  ): Promise<(ProfileRecord | undefined)[]> {
    return this.db.profiles.bulkGet([...pubkeys])
  }
}

export class ContactListsRepository {
  private readonly db: NostrGraphDexie

  public constructor(db: NostrGraphDexie) {
    this.db = db
  }

  public async upsert(record: ContactListRecord): Promise<ContactListRecord> {
    const existing = await this.db.contactLists.get(record.pubkey)
    const normalizedRecord: ContactListRecord = {
      ...record,
      follows: toSortedUniqueStrings(record.follows),
      relayHints: toSortedUniqueStrings(record.relayHints),
    }

    if (!existing || shouldReplaceProjection(existing, normalizedRecord)) {
      await this.db.contactLists.put(normalizedRecord)
      return normalizedRecord
    }

    return existing
  }

  public async get(pubkey: string): Promise<ContactListRecord | undefined> {
    return this.db.contactLists.get(pubkey)
  }
}

export class InboundFollowerSnapshotsRepository {
  private readonly db: NostrGraphDexie

  public constructor(db: NostrGraphDexie) {
    this.db = db
  }

  public async upsert(
    record: InboundFollowerSnapshotRecord,
  ): Promise<InboundFollowerSnapshotRecord> {
    const normalizedRecord: InboundFollowerSnapshotRecord = {
      ...record,
      followerPubkeys: toSortedUniqueStrings(record.followerPubkeys),
      relayUrls: toSortedUniqueStrings(record.relayUrls),
      eventIds: toSortedUniqueStrings(record.eventIds),
    }

    await this.db.inboundFollowerSnapshots.put(normalizedRecord)
    return normalizedRecord
  }

  public async get(
    rootPubkey: string,
  ): Promise<InboundFollowerSnapshotRecord | undefined> {
    return this.db.inboundFollowerSnapshots.get(rootPubkey)
  }
}

export class RelayListsRepository {
  private readonly db: NostrGraphDexie

  public constructor(db: NostrGraphDexie) {
    this.db = db
  }

  public async upsert(record: RelayListRecord): Promise<RelayListRecord> {
    const existing = await this.db.relayLists.get(record.pubkey)
    const normalizedRecord: RelayListRecord = {
      ...record,
      readRelays: toSortedUniqueStrings(record.readRelays),
      writeRelays: toSortedUniqueStrings(record.writeRelays),
      relays: toSortedUniqueStrings(record.relays),
    }

    if (!existing || shouldReplaceProjection(existing, normalizedRecord)) {
      await this.db.relayLists.put(normalizedRecord)
      return normalizedRecord
    }

    return existing
  }

  public async get(pubkey: string): Promise<RelayListRecord | undefined> {
    return this.db.relayLists.get(pubkey)
  }
}

export interface RelayDiscoveryCountInput {
  relayUrl: string
  count: number | null
  supported: boolean
  elapsedMs: number
  errorMessage: string | null
}

export interface RelayDiscoveryFetchInput {
  relayUrl: string
  eventId: string
}

export class RelayDiscoveryStatsRepository {
  private readonly db: NostrGraphDexie

  public constructor(db: NostrGraphDexie) {
    this.db = db
  }

  public async getMany(
    relayUrls: readonly string[],
  ): Promise<(RelayDiscoveryStatsRecord | undefined)[]> {
    return this.db.relayDiscoveryStats.bulkGet(
      toSortedUniqueStrings(relayUrls),
    )
  }

  public async recordCountResults(
    results: readonly RelayDiscoveryCountInput[],
    updatedAt: number,
  ): Promise<void> {
    const relayUrls = toSortedUniqueStrings(results.map((result) => result.relayUrl))

    if (relayUrls.length === 0) {
      return
    }

    const resultByRelayUrl = new Map(
      results.map((result) => [result.relayUrl, result]),
    )
    const existingRecords = await this.db.relayDiscoveryStats.bulkGet(relayUrls)
    const records = relayUrls.map((relayUrl, index) => {
      const result = resultByRelayUrl.get(relayUrl)
      const existing = existingRecords[index]
      const record = createRelayDiscoveryStatsRecord(relayUrl, existing)

      if (!result) {
        return record
      }

      const countSucceeded =
        result.supported && result.errorMessage === null && result.count !== null

      return {
        ...record,
        updatedAt,
        countAttempts: record.countAttempts + 1,
        countSuccesses: record.countSuccesses + (countSucceeded ? 1 : 0),
        countUnsupporteds: record.countUnsupporteds + (!result.supported ? 1 : 0),
        countFailures:
          record.countFailures +
          (result.supported && result.errorMessage !== null ? 1 : 0),
        lastCount: result.count,
        lastCountLatencyMs: result.elapsedMs,
      } satisfies RelayDiscoveryStatsRecord
    })

    await this.db.relayDiscoveryStats.bulkPut(records)
  }

  public async recordInboundFetch(
    rootPubkey: string,
    relayUrls: readonly string[],
    sourceEnvelopes: readonly RelayDiscoveryFetchInput[],
    updatedAt: number,
  ): Promise<void> {
    const eventIdsByRelayUrl = new Map<string, Set<string>>()
    for (const envelope of sourceEnvelopes) {
      const eventIds =
        eventIdsByRelayUrl.get(envelope.relayUrl) ?? new Set<string>()
      eventIds.add(envelope.eventId)
      eventIdsByRelayUrl.set(envelope.relayUrl, eventIds)
    }

    const normalizedRelayUrls = toSortedUniqueStrings([
      ...relayUrls,
      ...Array.from(eventIdsByRelayUrl.keys()),
    ])

    if (normalizedRelayUrls.length === 0) {
      return
    }

    const existingRecords =
      await this.db.relayDiscoveryStats.bulkGet(normalizedRelayUrls)
    const records = normalizedRelayUrls.map((relayUrl, index) => {
      const existing = existingRecords[index]
      const record = createRelayDiscoveryStatsRecord(relayUrl, existing)
      const inboundEventCount = eventIdsByRelayUrl.get(relayUrl)?.size ?? 0

      return {
        ...record,
        updatedAt,
        fetchAttempts: record.fetchAttempts + 1,
        fetchSuccesses: record.fetchSuccesses + (inboundEventCount > 0 ? 1 : 0),
        lastInboundEventCount: inboundEventCount,
        totalInboundEventCount:
          record.totalInboundEventCount + inboundEventCount,
        usefulRootCount:
          record.usefulRootCount +
          (inboundEventCount > 0 && record.lastUsefulForRootPubkey !== rootPubkey
            ? 1
            : 0),
        lastUsefulForRootPubkey:
          inboundEventCount > 0
            ? rootPubkey
            : record.lastUsefulForRootPubkey,
      } satisfies RelayDiscoveryStatsRecord
    })

    await this.db.relayDiscoveryStats.bulkPut(records)
  }
}

export class NoteExtractsRepository {
  private readonly db: NostrGraphDexie

  public constructor(db: NostrGraphDexie) {
    this.db = db
  }

  public async upsert(record: NoteExtractRecord): Promise<NoteExtractRecord> {
    const existing = await this.db.noteExtracts.get(record.noteId)

    if (
      !existing ||
      record.createdAt > existing.createdAt ||
      (record.createdAt === existing.createdAt &&
        record.fetchedAt >= existing.fetchedAt)
    ) {
      await this.db.noteExtracts.put(record)
      return record
    }

    return existing
  }

  public async replaceForPubkey(
    pubkey: string,
    records: NoteExtractRecord[],
  ): Promise<NoteExtractRecord[]> {
    await this.db.transaction(
      'rw',
      this.db.noteExtracts,
      async () => {
        const existingIds = await this.db.noteExtracts
          .where('pubkey')
          .equals(pubkey)
          .primaryKeys()

        if (existingIds.length > 0) {
          await this.db.noteExtracts.bulkDelete(existingIds)
        }

        if (records.length > 0) {
          await this.db.noteExtracts.bulkPut(records)
        }
      },
    )

    return records
  }

  public async findByPubkeys(pubkeys: readonly string[]): Promise<NoteExtractRecord[]> {
    const normalizedPubkeys = Array.from(new Set(pubkeys.filter(Boolean))).sort()

    if (normalizedPubkeys.length === 0) {
      return []
    }

    const records = await this.db.noteExtracts
      .where('pubkey')
      .anyOf(normalizedPubkeys)
      .toArray()

    return records.sort((left, right) => {
      if (left.pubkey !== right.pubkey) {
        return left.pubkey.localeCompare(right.pubkey)
      }

      if (left.createdAt !== right.createdAt) {
        return right.createdAt - left.createdAt
      }

      return left.noteId.localeCompare(right.noteId)
    })
  }
}

export class InboundRefsRepository {
  private readonly db: NostrGraphDexie

  public constructor(db: NostrGraphDexie) {
    this.db = db
  }

  public async upsert(record: InboundRefRecord): Promise<InboundRefRecord> {
    const existing = await this.db.inboundRefs.get(record.eventId)
    const normalizedRecord: InboundRefRecord = {
      ...record,
      relayUrls: toSortedUniqueStrings(record.relayUrls),
    }

    if (!existing) {
      await this.db.inboundRefs.put(normalizedRecord)
      return normalizedRecord
    }

    const mergedRecord: InboundRefRecord = {
      ...existing,
      ...normalizedRecord,
      fetchedAt: Math.max(existing.fetchedAt, normalizedRecord.fetchedAt),
      relayUrls: toSortedUniqueStrings([...existing.relayUrls, ...normalizedRecord.relayUrls]),
    }

    await this.db.inboundRefs.put(mergedRecord)
    return mergedRecord
  }

  public async findByTargetPubkey(targetPubkey: string): Promise<InboundRefRecord[]> {
    return this.db.inboundRefs.where('targetPubkey').equals(targetPubkey).sortBy('createdAt')
  }
}

export class ZapsRepository {
  private readonly db: NostrGraphDexie

  public constructor(db: NostrGraphDexie) {
    this.db = db
  }

  public async upsert(record: ZapRecord): Promise<ZapRecord> {
    const existing = await this.db.zaps.get(record.id)

    if (!existing) {
      await this.db.zaps.put(record)
      return record
    }

    const mergedRecord: ZapRecord = {
      ...existing,
      ...record,
      fetchedAt: Math.max(existing.fetchedAt, record.fetchedAt),
    }

    await this.db.zaps.put(mergedRecord)
    return mergedRecord
  }

  public async findByPubkey(pubkey: string): Promise<ZapRecord[]> {
    return this.db
      .zaps
      .filter((record) => record.fromPubkey === pubkey || record.toPubkey === pubkey)
      .sortBy('createdAt')
  }

  public async findByTargetPubkeys(targetPubkeys: readonly string[]): Promise<ZapRecord[]> {
    const targetSet = new Set(targetPubkeys)

    return this.db
      .zaps
      .filter((record) => targetSet.has(record.toPubkey))
      .sortBy('createdAt')
  }
}

export class ImageVariantRepository {
  private readonly db: NostrGraphDexie

  public constructor(db: NostrGraphDexie) {
    this.db = db
  }

  public async put(record: ImageVariantRecord): Promise<ImageVariantRecord> {
    await this.db.imageVariants.put(record)
    return record
  }

  public async get(
    sourceUrl: string,
    bucket: number,
  ): Promise<ImageVariantRecord | undefined> {
    return this.db.imageVariants.get([sourceUrl, bucket])
  }

  public async getFresh(
    sourceUrl: string,
    bucket: number,
    now: number,
  ): Promise<ImageVariantRecord | undefined> {
    const record = await this.db.imageVariants.get([sourceUrl, bucket])

    if (!record) {
      return undefined
    }

    if (record.expiresAt <= now) {
      await this.db.imageVariants.delete([sourceUrl, bucket])
      return undefined
    }

    return record
  }

  public async getManyFresh(
    requests: Array<{ sourceUrl: string; bucket: number }>,
    now: number,
  ): Promise<(ImageVariantRecord | undefined)[]> {
    const records = await this.db.imageVariants.bulkGet(
      requests.map(({ sourceUrl, bucket }) => [sourceUrl, bucket]),
    )
    const expiredKeys: Array<[string, number]> = []

    const validRecords = records.map((record, index) => {
      if (!record) return undefined
      if (record.expiresAt <= now) {
        expiredKeys.push([requests[index].sourceUrl, requests[index].bucket])
        return undefined
      }

      return record
    })

    if (expiredKeys.length > 0) {
      void this.db.imageVariants.bulkDelete(expiredKeys).catch((error) => {
        logTerminalWarning('Imagenes', 'No se pudo limpiar cache vencido', {
          cantidad: expiredKeys.length,
          motivo: summarizeHumanTerminalError(error),
        })
      })
    }

    return validRecords
  }

  public async touch(
    sourceUrl: string,
    bucket: number,
    lastAccessedAt: number,
  ): Promise<void> {
    await this.db.imageVariants.update([sourceUrl, bucket], {
      lastAccessedAt,
    })
  }

  public async bulkTouch(
    requests: Array<{ sourceUrl: string; bucket: number }>,
    lastAccessedAt: number,
  ): Promise<void> {
    if (requests.length === 0) {
      return
    }

    await this.db.transaction('rw', this.db.imageVariants, async () => {
      await Promise.all(
        requests.map(({ sourceUrl, bucket }) =>
          this.db.imageVariants.update([sourceUrl, bucket], {
            lastAccessedAt,
          }),
        ),
      )
    })
  }

  public async deleteExpired(now: number): Promise<number> {
    const expiredKeys = await this.db.imageVariants
      .where('expiresAt')
      .belowOrEqual(now)
      .primaryKeys()

    if (expiredKeys.length === 0) {
      return 0
    }

    await this.db.imageVariants.bulkDelete(expiredKeys)
    return expiredKeys.length
  }

  public async summarizeFresh(now: number): Promise<ImageVariantStorageSummary> {
    const expiredKeys: Array<[string, number]> = []
    const bucketSummary = new Map<number, { variants: number; bytes: number }>()
    let totalVariants = 0
    let totalBytes = 0

    await this.db.imageVariants.each((record) => {
      if (record.expiresAt <= now) {
        expiredKeys.push([record.sourceUrl, record.bucket])
        return
      }

      totalVariants += 1
      totalBytes += record.byteSize

      const currentBucket = bucketSummary.get(record.bucket) ?? {
        variants: 0,
        bytes: 0,
      }
      currentBucket.variants += 1
      currentBucket.bytes += record.byteSize
      bucketSummary.set(record.bucket, currentBucket)
    })

    if (expiredKeys.length > 0) {
      await this.db.imageVariants.bulkDelete(expiredKeys)
    }

    return {
      totalVariants,
      totalBytes,
      lodBuckets: Array.from(bucketSummary.entries())
        .sort(([leftBucket], [rightBucket]) => leftBucket - rightBucket)
        .map(([bucket, summary]) => ({
          bucket,
          variants: summary.variants,
          bytes: summary.bytes,
        })),
    }
  }

  public async getAll(): Promise<ImageVariantRecord[]> {
    return this.db.imageVariants.toArray()
  }

  public async delete(key: [string, number]): Promise<void> {
    await this.db.imageVariants.delete(key)
  }

  public async bulkDelete(keys: Array<[string, number]>): Promise<void> {
    if (keys.length === 0) {
      return
    }

    await this.db.imageVariants.bulkDelete(keys)
  }

  public async enforceByteBudget(maxBytes: number): Promise<void> {
    type VariantMeta = { cacheKey: [string, number]; byteSize: number }
    const metaRecords: VariantMeta[] = []

    await this.db.imageVariants
      .orderBy('lastAccessedAt')
      .each((record) => {
        metaRecords.push({
          cacheKey: [record.sourceUrl, record.bucket],
          byteSize: record.byteSize,
        })
      })

    let totalBytes = metaRecords.reduce((sum, record) => sum + record.byteSize, 0)
    if (totalBytes <= maxBytes) {
      return
    }

    const keysToDelete: Array<[string, number]> = []
    for (const meta of metaRecords) {
      if (totalBytes <= maxBytes) {
        break
      }

      totalBytes -= meta.byteSize
      keysToDelete.push(meta.cacheKey)
    }

    if (keysToDelete.length > 0) {
      await this.db.imageVariants.bulkDelete(keysToDelete)
    }
  }
}

export interface ImageVariantLodSummary {
  bucket: number
  variants: number
  bytes: number
}

export interface ImageVariantStorageSummary {
  totalVariants: number
  totalBytes: number
  lodBuckets: ImageVariantLodSummary[]
}

function createRelayDiscoveryStatsRecord(
  relayUrl: string,
  existing: RelayDiscoveryStatsRecord | undefined,
): RelayDiscoveryStatsRecord {
  return existing ?? {
    relayUrl,
    updatedAt: 0,
    countAttempts: 0,
    countSuccesses: 0,
    countUnsupporteds: 0,
    countFailures: 0,
    lastCount: null,
    lastCountLatencyMs: null,
    fetchAttempts: 0,
    fetchSuccesses: 0,
    lastInboundEventCount: 0,
    totalInboundEventCount: 0,
    usefulRootCount: 0,
    lastUsefulForRootPubkey: null,
  }
}

export interface NostrGraphRepositories {
  rawEvents: RawEventsRepository
  replaceableHeads: ReplaceableHeadsRepository
  addressableHeads: AddressableHeadsRepository
  profiles: ProfilesRepository
  contactLists: ContactListsRepository
  inboundFollowerSnapshots: InboundFollowerSnapshotsRepository
  relayLists: RelayListsRepository
  relayDiscoveryStats: RelayDiscoveryStatsRepository
  noteExtracts: NoteExtractsRepository
  inboundRefs: InboundRefsRepository
  zaps: ZapsRepository
  imageVariants: ImageVariantRepository
}

export function createRepositories(db: NostrGraphDexie): NostrGraphRepositories {
  return {
    rawEvents: new RawEventsRepository(db),
    replaceableHeads: new ReplaceableHeadsRepository(db),
    addressableHeads: new AddressableHeadsRepository(db),
    profiles: new ProfilesRepository(db),
    contactLists: new ContactListsRepository(db),
    inboundFollowerSnapshots: new InboundFollowerSnapshotsRepository(db),
    relayLists: new RelayListsRepository(db),
    relayDiscoveryStats: new RelayDiscoveryStatsRepository(db),
    noteExtracts: new NoteExtractsRepository(db),
    inboundRefs: new InboundRefsRepository(db),
    zaps: new ZapsRepository(db),
    imageVariants: new ImageVariantRepository(db),
  }
}

export async function deleteDatabase(db: NostrGraphDexie): Promise<void> {
  const databaseName = db.name

  db.close()
  await Dexie.delete(databaseName)
}
