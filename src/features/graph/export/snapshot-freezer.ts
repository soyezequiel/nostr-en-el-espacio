import type { AppStoreApi } from '@/features/graph/app/store/types'
import type { NostrGraphRepositories } from '@/features/graph/db/repositories'
import { canonicalJson, encodeUtf8, sha256Hex } from '@/features/graph/export/canonical'
import type { FrozenSnapshot, FrozenUserData } from '@/features/graph/export/types'

export interface SnapshotFreezerDependencies {
  store: AppStoreApi
  repositories: NostrGraphRepositories
  now?: () => number
}

export async function freezeSnapshot(
  deps: SnapshotFreezerDependencies,
): Promise<FrozenSnapshot> {
  const state = deps.store.getState()
  const nowMs = (deps.now ?? Date.now)()
  const captureUpperBoundSec = Math.floor(nowMs / 1000 / 3600) * 3600

  const nodes = Object.values(state.nodes)
  const links = [...state.links]
  const adjacency: Record<string, string[]> = {}
  const inboundLinks = [...state.inboundLinks]
  const inboundAdjacency: Record<string, string[]> = {}

  for (const [pubkey, neighbors] of Object.entries(state.adjacency)) {
    adjacency[pubkey] = [...neighbors].sort()
  }

  for (const [pubkey, followers] of Object.entries(state.inboundAdjacency)) {
    inboundAdjacency[pubkey] = [...followers].sort()
  }

  const relays = [...state.relayUrls].sort()
  const graphCaps = { ...state.graphCaps }
  const pubkeys = Object.keys(state.nodes).sort()
  const activeKeyword = state.currentKeyword.trim()
  const sortedNodes = nodes.sort((a, b) => a.pubkey.localeCompare(b.pubkey))
  const sortedLinks = links.sort((a, b) => {
    const srcCmp = a.source.localeCompare(b.source)
    if (srcCmp !== 0) return srcCmp
    return a.target.localeCompare(b.target)
  })
  const sortedInboundLinks = inboundLinks.sort((a, b) => {
    const srcCmp = a.source.localeCompare(b.source)
    if (srcCmp !== 0) return srcCmp
    return a.target.localeCompare(b.target)
  })
  const keywordSearch = {
    keyword: activeKeyword || null,
    totalHits: sortedNodes.reduce((total, node) => total + node.keywordHits, 0),
    matchedNodeCount: sortedNodes.filter((node) => node.keywordHits > 0).length,
  }

  const users = new Map<string, FrozenUserData>()
  const userEntries: Array<{ pubkey: string; userData: FrozenUserData }> = []

  for (const pubkey of pubkeys) {
    const userData = await freezeUserData(pubkey, deps.repositories)
    users.set(pubkey, userData)
    userEntries.push({ pubkey, userData })
  }

  const captureId = await buildCaptureId({
    relays,
    graphCaps,
    nodes: sortedNodes,
    links: sortedLinks,
    adjacency,
    inboundLinks: sortedInboundLinks,
    inboundAdjacency,
    keywordSearch,
    users: userEntries,
  })

  return {
    captureId,
    capturedAtIso: new Date(nowMs).toISOString(),
    captureUpperBoundSec,
    executionMode: 'snapshot',
    relays,
    graphCaps,
    nodes: sortedNodes,
    links: sortedLinks,
    adjacency,
    inboundLinks: sortedInboundLinks,
    inboundAdjacency,
    keywordSearch,
    users,
  }
}

async function freezeUserData(
  pubkey: string,
  repos: NostrGraphRepositories,
): Promise<FrozenUserData> {
  const [profile, contactList, replaceableHeads, addressableHeads, zaps, inboundRefs] =
    await Promise.all([
      repos.profiles.get(pubkey),
      repos.contactLists.get(pubkey),
      queryReplaceableHeadsByPubkey(pubkey, repos),
      queryAddressableHeadsByPubkey(pubkey, repos),
      repos.zaps.findByPubkey(pubkey),
      repos.inboundRefs.findByTargetPubkey(pubkey),
    ])

  const allZaps = zaps
  const zapsSent = allZaps.filter((z) => z.fromPubkey === pubkey)
  const zapsReceived = allZaps.filter((z) => z.toPubkey === pubkey)

  const rawEvents = await queryRawEventsByPubkey(pubkey, repos)

  return {
    pubkey,
    profile: profile ?? null,
    contactList: contactList ?? null,
    replaceableHeads: replaceableHeads.sort((a, b) => a.kind - b.kind),
    addressableHeads: addressableHeads.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind - b.kind
      return (a.dTag ?? '').localeCompare(b.dTag ?? '')
    }),
    rawEvents,
    zapsSent: sortZapRecords(zapsSent),
    zapsReceived: sortZapRecords(zapsReceived),
    inboundRefs: sortInboundRefRecords(inboundRefs),
  }
}

async function queryReplaceableHeadsByPubkey(
  pubkey: string,
  repos: NostrGraphRepositories,
): Promise<FrozenUserData['replaceableHeads']> {
  const knownKinds = [0, 3, 10002]
  const results = await Promise.all(
    knownKinds.map((kind) => repos.replaceableHeads.get(pubkey, kind)),
  )
  return results.filter((r): r is NonNullable<typeof r> => r != null)
}

async function queryAddressableHeadsByPubkey(
  pubkey: string,
  repos: NostrGraphRepositories,
): Promise<FrozenUserData['addressableHeads']> {
  void pubkey
  void repos
  return []
}

async function queryRawEventsByPubkey(
  pubkey: string,
  repos: NostrGraphRepositories,
): Promise<FrozenUserData['rawEvents']> {
  const knownKinds = [0, 1, 3, 5, 6, 7, 16, 1111, 9735, 10002]
  const results = await Promise.all(
    knownKinds.map((kind) => repos.rawEvents.findByPubkeyAndKind(pubkey, kind)),
  )
  return results.flat().sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    if (a.kind !== b.kind) return a.kind - b.kind
    return a.id.localeCompare(b.id)
  })
}

function sortZapRecords(records: FrozenUserData['zapsSent']): FrozenUserData['zapsSent'] {
  return [...records].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    if (a.sats !== b.sats) return a.sats - b.sats
    return a.id.localeCompare(b.id)
  })
}

function sortInboundRefRecords(
  records: FrozenUserData['inboundRefs'],
): FrozenUserData['inboundRefs'] {
  return [...records].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    if (a.kind !== b.kind) return a.kind - b.kind
    return a.eventId.localeCompare(b.eventId)
  })
}

async function buildCaptureId(input: {
  relays: FrozenSnapshot['relays']
  graphCaps: FrozenSnapshot['graphCaps']
  nodes: FrozenSnapshot['nodes']
  links: FrozenSnapshot['links']
  adjacency: FrozenSnapshot['adjacency']
  inboundLinks: FrozenSnapshot['inboundLinks']
  inboundAdjacency: FrozenSnapshot['inboundAdjacency']
  keywordSearch: FrozenSnapshot['keywordSearch']
  users: Array<{ pubkey: string; userData: FrozenUserData }>
}): Promise<string> {
  const hash = await sha256Hex(
    encodeUtf8(
      canonicalJson({
        relays: input.relays,
        graphCaps: input.graphCaps,
        nodes: input.nodes,
        links: input.links,
        adjacency: input.adjacency,
        inboundLinks: input.inboundLinks,
        inboundAdjacency: input.inboundAdjacency,
        keywordSearch: input.keywordSearch,
        users: input.users,
      }),
    ),
  )

  return `cap-${hash.slice(0, 16)}`
}
