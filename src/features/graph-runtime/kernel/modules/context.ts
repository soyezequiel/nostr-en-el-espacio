import type { AppStoreApi } from '@/features/graph-runtime/app/store'
import type { NostrGraphRepositories } from '@/features/graph-runtime/db'
import { createRelayPoolAdapter, type RelayAdapterOptions } from '@/features/graph-runtime/nostr'
import type { createKernelEventEmitter } from '@/features/graph-runtime/kernel/events'
import type { EventsWorkerActionMap } from '@/features/graph-runtime/workers/events/contracts'
import type { GraphWorkerActionMap } from '@/features/graph-runtime/workers/graph/contracts'
import type { WorkerClient } from '@/features/graph-runtime/workers/shared/runtime'

export type RelayAdapterInstance = Pick<
  ReturnType<typeof createRelayPoolAdapter>,
  'subscribe' | 'count' | 'getRelayHealth' | 'subscribeToRelayHealth' | 'close'
>

export interface AppKernelDependencies {
  store: AppStoreApi
  repositories: NostrGraphRepositories
  eventsWorker: WorkerClient<EventsWorkerActionMap>
  graphWorker: WorkerClient<GraphWorkerActionMap>
  createRelayAdapter: (options: RelayAdapterOptions) => RelayAdapterInstance
  defaultRelayUrls?: string[]
  now?: () => number
}

export interface KernelContext {
  store: AppStoreApi
  repositories: NostrGraphRepositories
  eventsWorker: WorkerClient<EventsWorkerActionMap>
  graphWorker: WorkerClient<GraphWorkerActionMap>
  createRelayAdapter: (options: RelayAdapterOptions) => RelayAdapterInstance
  defaultRelayUrls: string[]
  now: () => number
  emitter: ReturnType<typeof createKernelEventEmitter>
}
