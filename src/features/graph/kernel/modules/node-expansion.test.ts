import assert from 'node:assert/strict'
import test from 'node:test'
import type { Event, Filter } from 'nostr-tools'

import { createNodeExpansionModule } from './node-expansion'
import { createKernelEventEmitter } from '@/features/graph/kernel/events'
import { createInlineEventsWorkerGateway } from '@/features/graph/workers/gateway'

const relayUrl = 'wss://relay.test'
const ROOT = '1'.repeat(64)
const BASIC_INBOUND = '2'.repeat(64)
const FOLLOW_A = 'a'.repeat(64)
const FOLLOW_B = 'b'.repeat(64)

const flushAsync = async (times = 3) => {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const makeEvent = (pubkey: string, follows: readonly string[], createdAt = 1): Event => ({
  id: pubkey.slice(0, 63) + 'f',
  pubkey,
  created_at: createdAt,
  kind: 3,
  tags: follows.map((followPubkey) => ['p', followPubkey]),
  content: '',
  sig: '0'.repeat(128),
})

const createDeferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

const createTestStore = (options?: { maxNodes?: number; devicePerformanceProfile?: 'desktop' | 'mobile' | 'low-end-mobile' }) => {
  const maxNodes = options?.maxNodes ?? 200
  const state: any = {
    nodes: {
      [ROOT]: {
        pubkey: ROOT,
        keywordHits: 0,
        discoveredAt: 0,
        source: 'root',
      },
    },
    links: [],
    adjacency: {},
    inboundLinks: [],
    inboundAdjacency: {},
    graphCaps: { maxNodes, capReached: false },
    effectiveGraphCaps: { maxNodes, coldStartLayoutTicks: 0, warmStartLayoutTicks: 0 },
    devicePerformanceProfile: options?.devicePerformanceProfile ?? 'desktop',
    relayUrls: [relayUrl],
    expandedNodePubkeys: new Set<string>(),
    nodeExpansionStates: {},
    nodeStructurePreviewStates: {},
    upsertNodes: (nodes: any[]) => {
      const acceptedPubkeys: string[] = []
      const rejectedPubkeys: string[] = []
      for (const node of nodes) {
        if (state.nodes[node.pubkey]) {
          state.nodes[node.pubkey] = { ...state.nodes[node.pubkey], ...node }
          acceptedPubkeys.push(node.pubkey)
          continue
        }
        if (Object.keys(state.nodes).length >= state.graphCaps.maxNodes) {
          state.graphCaps.capReached = true
          rejectedPubkeys.push(node.pubkey)
          continue
        }
        state.nodes[node.pubkey] = node
        acceptedPubkeys.push(node.pubkey)
      }
      return { acceptedPubkeys, rejectedPubkeys }
    },
    upsertLinks: (links: any[]) => {
      for (const link of links) {
        if (!state.links.some((candidate: any) => candidate.source === link.source && candidate.target === link.target && candidate.relation === link.relation)) {
          state.links.push(link)
        }
        const neighbors = state.adjacency[link.source] ?? []
        if (!neighbors.includes(link.target)) {
          state.adjacency[link.source] = [...neighbors, link.target]
        }
      }
    },
    upsertInboundLinks: (links: any[]) => {
      for (const link of links) {
        if (!state.inboundLinks.some((candidate: any) => candidate.source === link.source && candidate.target === link.target && candidate.relation === link.relation)) {
          state.inboundLinks.push(link)
        }
        const followers = state.inboundAdjacency[link.target] ?? []
        if (!followers.includes(link.source)) {
          state.inboundAdjacency[link.target] = [...followers, link.source]
        }
      }
    },
    markNodeExpanded: (pubkey: string) => state.expandedNodePubkeys.add(pubkey),
    setNodeExpansionState: (pubkey: string, nextState: any) => { state.nodeExpansionStates[pubkey] = nextState },
    setNodeStructurePreviewState: (pubkey: string, nextState: any) => { state.nodeStructurePreviewStates[pubkey] = nextState },
  }
  return { getState: () => state }
}

const createAdapter = (input: {
  contactListEvent: Event
  inboundEvents?: Event[]
  reciprocal?: (authors: string[]) => Promise<{ events?: Event[]; error?: string }> | { events?: Event[]; error?: string }
}) => ({
  subscribe(filters: Filter[]) {
    return {
      subscribe(observer: any) {
        queueMicrotask(async () => {
          try {
            const filter = filters[0] as Filter & { '#p'?: string[] }
            if (filter.authors?.[0] === ROOT && !filter['#p']) {
              observer.next?.({ event: input.contactListEvent, relayUrl, receivedAtMs: 1, attempt: 1 })
              observer.complete?.({ filters, relayHealth: {}, stats: { acceptedEvents: 1, duplicateRelayEvents: 0, rejectedEvents: 0 } })
              return
            }
            if (!filter.authors && filter['#p']?.includes(ROOT)) {
              for (const event of input.inboundEvents ?? []) {
                observer.next?.({ event, relayUrl, receivedAtMs: 1, attempt: 1 })
              }
              observer.complete?.({ filters, relayHealth: {}, stats: { acceptedEvents: 1, duplicateRelayEvents: 0, rejectedEvents: 0 } })
              return
            }
            const reciprocalResult = input.reciprocal ? await input.reciprocal(filter.authors ?? []) : { events: [] }
            if (reciprocalResult.error) {
              observer.error?.(new Error(reciprocalResult.error))
              return
            }
            for (const event of reciprocalResult.events ?? []) {
              observer.next?.({ event, relayUrl, receivedAtMs: 1, attempt: 1 })
            }
            observer.complete?.({ filters, relayHealth: {}, stats: { acceptedEvents: 1, duplicateRelayEvents: 0, rejectedEvents: 0 } })
          } catch (error) {
            observer.error?.(error)
          }
        })
        return () => {}
      },
    }
  },
  count: async () => [],
  getRelayHealth: () => ({}),
  subscribeToRelayHealth: () => () => {},
  close: () => {},
})

const createModule = (input: Parameters<typeof createAdapter>[0] & { maxNodes?: number; devicePerformanceProfile?: 'desktop' | 'mobile' | 'low-end-mobile' }) => {
  const store = createTestStore({ maxNodes: input.maxNodes, devicePerformanceProfile: input.devicePerformanceProfile })
  const contactLists = new Map<string, { follows: string[]; relayHints: string[] }>()
  const module = createNodeExpansionModule(
    {
      store: store as any,
      repositories: {
        contactLists: { get: async (pubkey: string) => contactLists.get(pubkey) ?? null },
      } as any,
      eventsWorker: createInlineEventsWorkerGateway(),
      graphWorker: {} as any,
      createRelayAdapter: () => createAdapter(input) as any,
      defaultRelayUrls: [relayUrl],
      now: (() => { let now = 10; return () => ++now })(),
      emitter: createKernelEventEmitter(),
    },
    {
      analysis: { schedule: () => {} } as any,
      persistence: {
        persistContactListEvent: async (latestContactListEvent: any, parsedContactList: any) => {
          contactLists.set(latestContactListEvent.event.pubkey, { follows: parsedContactList.followPubkeys, relayHints: parsedContactList.relayHints })
        },
        persistProfileEvent: async () => {},
      } as any,
      profileHydration: { hydrateNodeProfiles: async () => {} } as any,
      rootLoader: { getLoadSequence: () => 1, isStaleLoad: () => false } as any,
      keywordLayer: { getKeywordCorpusTargetPubkeys: () => [], prefetchKeywordCorpus: async () => {} } as any,
      zapLayer: { getZapTargetPubkeys: () => [], prefetchZapLayer: async () => {} } as any,
      nodeDetail: { getActivePreviewRequest: () => null } as any,
    },
  )
  return { module, store }
}

test('expandNode resolves after visible merge and then completes reciprocity in background', async () => {
  const reciprocalGate = createDeferred()
  const { module, store } = createModule({
    contactListEvent: makeEvent(ROOT, [FOLLOW_A, FOLLOW_B]),
    inboundEvents: [makeEvent(BASIC_INBOUND, [ROOT])],
    reciprocal: async (authors) => {
      assert.deepEqual(authors, [FOLLOW_A, FOLLOW_B])
      await reciprocalGate.promise
      return { events: [makeEvent(FOLLOW_A, [ROOT])] }
    },
  })

  const result = await module.expandNode(ROOT)
  assert.equal(result.status, 'partial')
  assert.deepEqual(store.getState().adjacency[ROOT], [FOLLOW_A, FOLLOW_B])
  assert.deepEqual(store.getState().inboundAdjacency[ROOT], [BASIC_INBOUND])
  assert.equal(store.getState().expandedNodePubkeys.has(ROOT), true)
  assert.equal(store.getState().nodeExpansionStates[ROOT].phase, 'idle')
  assert.equal(store.getState().nodeExpansionStates[ROOT].visibleStatus, 'ready')
  assert.equal(store.getState().nodeExpansionStates[ROOT].backgroundStatus, 'loading')
  assert.equal(typeof store.getState().nodeExpansionStates[ROOT].visibleAppliedAt, 'number')

  reciprocalGate.resolve()
  await flushAsync()

  assert.deepEqual(store.getState().inboundAdjacency[ROOT].sort(), [BASIC_INBOUND, FOLLOW_A].sort())
  assert.equal(store.getState().nodeExpansionStates[ROOT].status, 'ready')
  assert.equal(store.getState().nodeExpansionStates[ROOT].visibleStatus, 'ready')
  assert.equal(store.getState().nodeExpansionStates[ROOT].backgroundStatus, 'ready')
  assert.equal(store.getState().nodeExpansionStates[ROOT].enrichmentStatus, 'ready')
})

test('background reciprocity failures keep the node partial without reverting visible graph', async () => {
  const { module, store } = createModule({
    contactListEvent: makeEvent(ROOT, [FOLLOW_A]),
    reciprocal: async () => ({ error: 'relay reciprocity failed' }),
  })

  const result = await module.expandNode(ROOT)
  assert.equal(result.status, 'partial')
  await flushAsync()

  assert.deepEqual(store.getState().adjacency[ROOT], [FOLLOW_A])
  assert.equal(store.getState().nodeExpansionStates[ROOT].status, 'partial')
  assert.equal(store.getState().nodeExpansionStates[ROOT].visibleStatus, 'ready')
  assert.equal(store.getState().nodeExpansionStates[ROOT].backgroundStatus, 'error')
  assert.equal(store.getState().nodeExpansionStates[ROOT].enrichmentStatus, 'error')
  assert.match(store.getState().nodeExpansionStates[ROOT].message, /Reciprocidad parcial/i)
})

test('stale enrichment runs do not merge late inbound reciprocity evidence', async () => {
  const reciprocalGate = createDeferred()
  const { module, store } = createModule({
    contactListEvent: makeEvent(ROOT, [FOLLOW_A]),
    reciprocal: async () => {
      await reciprocalGate.promise
      return { events: [makeEvent(FOLLOW_A, [ROOT])] }
    },
  })

  await module.expandNode(ROOT)
  store.getState().setNodeExpansionState(ROOT, {
    ...store.getState().nodeExpansionStates[ROOT],
    runId: 'newer-run',
  })

  reciprocalGate.resolve()
  await flushAsync()

  assert.equal(store.getState().inboundAdjacency[ROOT], undefined)
  assert.equal(store.getState().nodeExpansionStates[ROOT].runId, 'newer-run')
})

test('adaptive capped reciprocity finishes as partial with an explicit capped status', async () => {
  const followPubkeys = Array.from({ length: 60 }, (_, index) => (index + 10).toString(16).padStart(2, '0').repeat(32))
  const { module, store } = createModule({
    contactListEvent: makeEvent(ROOT, followPubkeys),
    reciprocal: async () => ({ events: [] }),
    maxNodes: 80,
    devicePerformanceProfile: 'low-end-mobile',
  })

  const result = await module.expandNode(ROOT)
  assert.equal(result.status, 'partial')
  await flushAsync()

  assert.equal(store.getState().nodeExpansionStates[ROOT].status, 'partial')
  assert.equal(store.getState().nodeExpansionStates[ROOT].visibleStatus, 'ready')
  assert.equal(store.getState().nodeExpansionStates[ROOT].backgroundStatus, 'capped')
  assert.equal(store.getState().nodeExpansionStates[ROOT].enrichmentStatus, 'capped')
  assert.ok((store.getState().nodeExpansionStates[ROOT].enrichmentTotalCandidates ?? 0) < followPubkeys.length)
})
