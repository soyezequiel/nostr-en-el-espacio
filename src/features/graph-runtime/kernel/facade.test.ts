import assert from 'node:assert/strict'
import test from 'node:test'

import { createStore } from 'zustand/vanilla'

import type { NostrGraphRepositories } from '@/features/graph-runtime/db'
import type { RelayAdapterInstance } from '@/features/graph-runtime/kernel/modules/context'
import type {
  RelayEventEnvelope,
  RelayObserver,
} from '@/features/graph-runtime/nostr'
import type { EventsWorkerActionMap } from '@/features/graph-runtime/workers/events/contracts'
import type { GraphWorkerActionMap } from '@/features/graph-runtime/workers/graph/contracts'
import type { WorkerActionName } from '@/features/graph-runtime/workers/shared/protocol'
import type { WorkerClient } from '@/features/graph-runtime/workers/shared/runtime'

// `tsx --test` runs this repo in a CJS-compatible mode, so require keeps the
// local TS module export shape predictable.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createGraphSlice } = require('../app/store/slices/graphSlice.ts')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRelaySlice } = require('../app/store/slices/relaySlice.ts')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createUiSlice } = require('../app/store/slices/uiSlice.ts')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createZapSlice } = require('../app/store/slices/zapSlice.ts')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createKernelFacade } = require('./facade.ts')

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

const waitForTimers = async (times = 3) => {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const createFacadeStore = () => {
  const store = createStore<Record<string, unknown>>()((...args) => ({
    ...createGraphSlice(...args),
    ...createRelaySlice(...args),
    ...createUiSlice(...args),
    ...createZapSlice(...args),
  }))

  store.getState().setRelayUrls(['wss://relay.example'])
  store.getState().setRootNodePubkey('root')
  store.getState().upsertNodes([
    {
      pubkey: 'root',
      keywordHits: 0,
      discoveredAt: 0,
      profileState: 'ready',
      source: 'root',
    },
    {
      pubkey: 'alice',
      keywordHits: 0,
      discoveredAt: 1,
      profileState: 'ready',
      source: 'follow',
    },
  ])

  return store
}

const createRepositoriesStub = () =>
  ({
    rawEvents: { upsert: async () => undefined },
    replaceableHeads: { upsert: async () => undefined },
    addressableHeads: { upsert: async () => undefined, get: async () => undefined },
    profiles: { upsert: async () => undefined, get: async () => undefined, getMany: async () => [] },
    contactLists: { get: async () => undefined, upsert: async () => undefined },
    inboundFollowerSnapshots: { get: async () => undefined, upsert: async () => undefined },
    relayLists: { get: async () => undefined, upsert: async () => undefined },
    relayDiscoveryStats: {
      listByRelayUrls: async () => [],
      upsert: async () => undefined,
      createDefault: () => undefined,
    },
    noteExtracts: { listByPubkeys: async () => [], putMany: async () => undefined },
    inboundRefs: {
      getByTarget: async () => [],
      putMany: async () => undefined,
      deleteByTarget: async () => undefined,
    },
    zaps: { upsert: async () => undefined, listByTargetPubkeys: async () => [] },
    imageVariants: {
      getPreferred: async () => undefined,
      putMany: async () => undefined,
      deleteByPubkey: async () => undefined,
    },
  }) as unknown as NostrGraphRepositories

class NoopGraphWorker implements WorkerClient<GraphWorkerActionMap> {
  public async invoke<TAction extends WorkerActionName<GraphWorkerActionMap>>(
    action: TAction,
    payload: GraphWorkerActionMap[TAction]['request'],
  ): Promise<GraphWorkerActionMap[TAction]['response']> {
    void action
    void payload
    throw new Error('Graph worker should not run in this test.')
  }

  public dispose() {}
}

test('cancela la derivacion de connections en vuelo al volver a mutuals', async () => {
  const store = createFacadeStore()
  const repositories = createRepositoriesStub()
  const subscribeStarted = createDeferred<void>()
  let cancelCalled = false
  let parseInvocations = 0

  const createRelayAdapter = (): RelayAdapterInstance => ({
    subscribe(filters): { subscribe: (observer: RelayObserver) => () => void } {
      void filters
      return {
        subscribe(observer) {
          subscribeStarted.resolve()
          const timeoutId = setTimeout(() => {
            const envelope: RelayEventEnvelope = {
              event: {
                id: 'contact-alice',
                pubkey: 'alice',
                created_at: 10,
                kind: 3,
                tags: [['p', 'bob']],
                content: '',
                sig: 'sig',
              },
              relayUrl: 'wss://relay.example',
              receivedAtMs: 10,
              attempt: 1,
            }

            observer.nextBatch?.([envelope])
            observer.complete?.({
              filters: [],
              startedAtMs: 0,
              finishedAtMs: 10,
              relayHealth: {},
              stats: {
                acceptedEvents: 1,
                duplicateRelayEvents: 0,
                rejectedEvents: 0,
              },
            })
          }, 25)

          return () => {
            cancelCalled = true
            clearTimeout(timeoutId)
          }
        },
      }
    },
    count: async () => [],
    getRelayHealth: () => ({}),
    subscribeToRelayHealth: () => () => {},
    close: () => {},
  })

  const eventsWorker: WorkerClient<EventsWorkerActionMap> = {
    invoke: async () => {
      parseInvocations += 1
      throw new Error('Events worker should not parse after cancellation.')
    },
    dispose: () => {},
  }

  const facade = createKernelFacade({
    store,
    repositories,
    eventsWorker,
    graphWorker: new NoopGraphWorker(),
    createRelayAdapter,
    defaultRelayUrls: ['wss://relay.example'],
    now: () => 100,
  })

  facade.toggleLayer('connections')
  await subscribeStarted.promise

  facade.toggleLayer('mutuals')
  await waitForTimers(5)
  await new Promise((resolve) => setTimeout(resolve, 40))

  assert.equal(cancelCalled, true)
  assert.equal(parseInvocations, 0)
  assert.equal(store.getState().activeLayer, 'mutuals')
  assert.equal(store.getState().connectionsLinksRevision, 0)

  facade.dispose()
})
