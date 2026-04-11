import type { AppStoreApi } from '@/features/graph/app/store'
import type { NostrGraphRepositories } from '@/features/graph/db'
import { createRelayPoolAdapter, type RelayAdapterOptions } from '@/features/graph/nostr'
import type { createKernelEventEmitter } from '@/features/graph/kernel/events'
import type { EventsWorkerActionMap } from '@/features/graph/workers/events/contracts'
import type { GraphWorkerActionMap } from '@/features/graph/workers/graph/contracts'
import type { WorkerClient } from '@/features/graph/workers/shared/runtime'

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
