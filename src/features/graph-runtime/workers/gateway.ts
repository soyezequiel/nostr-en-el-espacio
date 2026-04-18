import type { EventsWorkerActionMap } from '@/features/graph-runtime/workers/events/contracts'
import { createEventsWorkerRegistry } from '@/features/graph-runtime/workers/events/handlers'
import type { GraphWorkerActionMap } from '@/features/graph-runtime/workers/graph/contracts'
import { createGraphWorkerRegistry } from '@/features/graph-runtime/workers/graph/handlers'
import {
  TypedWorkerClient,
  createInlineWorkerLike,
  dispatchWorkerRequest,
} from '@/features/graph-runtime/workers/shared/runtime'

export function createInlineEventsWorkerGateway(): TypedWorkerClient<EventsWorkerActionMap> {
  return new TypedWorkerClient(
    createInlineWorkerLike((request) => dispatchWorkerRequest(createEventsWorkerRegistry(), request)),
    'events.worker',
  )
}

export function createInlineGraphWorkerGateway(): TypedWorkerClient<GraphWorkerActionMap> {
  return new TypedWorkerClient(
    createInlineWorkerLike((request) => dispatchWorkerRequest(createGraphWorkerRegistry(), request)),
    'graph.worker',
  )
}
