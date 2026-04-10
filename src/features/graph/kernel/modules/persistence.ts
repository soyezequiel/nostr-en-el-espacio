import type { ParseContactListResult } from '@/features/graph/workers/events/contracts'
import type { RelayEventEnvelope } from '@/features/graph/nostr'
import type { KernelContext } from '@/features/graph/kernel/modules/context'
import {
  findDTag,
  findEventTagValue,
  mapProfileRecordToNodeProfile,
  safeParseProfile,
  type MergedRelayEventEnvelope,
} from '@/features/graph/kernel/modules/helpers'
import type { ProfileHydrationModule } from '@/features/graph/kernel/modules/profile-hydration'

export function createPersistenceModule(
  ctx: KernelContext,
  collaborators: { profileHydration: ProfileHydrationModule },
) {
  async function persistContactListEvent(
    envelope: RelayEventEnvelope,
    parsedContactList: ParseContactListResult,
  ): Promise<void> {
    const fetchedAt = envelope.receivedAtMs
    const event = envelope.event

    await ctx.repositories.rawEvents.upsert({
      id: event.id,
      pubkey: event.pubkey,
      kind: event.kind,
      createdAt: event.created_at,
      fetchedAt,
      relayUrls: [envelope.relayUrl],
      tags: event.tags,
      content: event.content,
      sig: event.sig,
      rawJson: JSON.stringify(event),
      dTag: findDTag(event),
      captureScope: 'snapshot',
    })
    await ctx.repositories.replaceableHeads.upsert({
      pubkey: event.pubkey,
      kind: event.kind,
      eventId: event.id,
      createdAt: event.created_at,
      updatedAt: fetchedAt,
    })
    await ctx.repositories.contactLists.upsert({
      pubkey: event.pubkey,
      eventId: event.id,
      createdAt: event.created_at,
      fetchedAt,
      follows: parsedContactList.followPubkeys,
      relayHints: parsedContactList.relayHints,
    })
  }

  async function persistProfileEvent(envelope: RelayEventEnvelope): Promise<void> {
    const fetchedAt = envelope.receivedAtMs
    const event = envelope.event
    const parsedProfile = safeParseProfile(event.content)

    await ctx.repositories.rawEvents.upsert({
      id: event.id,
      pubkey: event.pubkey,
      kind: event.kind,
      createdAt: event.created_at,
      fetchedAt,
      relayUrls: [envelope.relayUrl],
      tags: event.tags,
      content: event.content,
      sig: event.sig,
      rawJson: JSON.stringify(event),
      dTag: findDTag(event),
      captureScope: 'snapshot',
    })
    await ctx.repositories.replaceableHeads.upsert({
      pubkey: event.pubkey,
      kind: event.kind,
      eventId: event.id,
      createdAt: event.created_at,
      updatedAt: fetchedAt,
    })

    if (!parsedProfile) {
      collaborators.profileHydration.markNodeProfileMissing(event.pubkey)
      return
    }

    const profileRecord = await ctx.repositories.profiles.upsert({
      pubkey: event.pubkey,
      eventId: event.id,
      createdAt: event.created_at,
      fetchedAt,
      name: parsedProfile.name,
      about: parsedProfile.about,
      picture: parsedProfile.picture,
      nip05: parsedProfile.nip05,
      lud16: parsedProfile.lud16,
    })

    collaborators.profileHydration.syncNodeProfile(
      event.pubkey,
      mapProfileRecordToNodeProfile(profileRecord),
    )
  }

  async function persistDecodedZapEdges(
    mergedReceipts: readonly MergedRelayEventEnvelope[],
    decodedEdges: readonly {
      eventId: string
      fromPubkey: string
      toPubkey: string
      sats: number
      createdAt: number
    }[],
  ): Promise<void> {
    const receiptsById = new Map(
      mergedReceipts.map((receipt) => [receipt.event.id, receipt]),
    )

    await Promise.all(
      decodedEdges.map(async (edge) => {
        const envelope = receiptsById.get(edge.eventId)
        if (!envelope) {
          return
        }

        await ctx.repositories.zaps.upsert({
          id: edge.eventId,
          fromPubkey: edge.fromPubkey,
          toPubkey: edge.toPubkey,
          sats: edge.sats,
          createdAt: edge.createdAt,
          fetchedAt: envelope.receivedAtMs,
          bolt11: findEventTagValue(envelope.event.tags, 'bolt11') ?? null,
          eventRef: findEventTagValue(envelope.event.tags, 'e') ?? null,
        })
      }),
    )
  }

  async function persistRawEventEnvelope(
    envelope: MergedRelayEventEnvelope,
  ): Promise<void> {
    const event = envelope.event

    await ctx.repositories.rawEvents.upsert({
      id: event.id,
      pubkey: event.pubkey,
      kind: event.kind,
      createdAt: event.created_at,
      fetchedAt: envelope.receivedAtMs,
      relayUrls: envelope.relayUrls,
      tags: event.tags,
      content: event.content,
      sig: event.sig,
      rawJson: JSON.stringify(event),
      dTag: findDTag(event),
      captureScope: 'snapshot',
    })
  }

  return {
    persistContactListEvent,
    persistProfileEvent,
    persistDecodedZapEdges,
    persistRawEventEnvelope,
  }
}

export type PersistenceModule = ReturnType<typeof createPersistenceModule>
