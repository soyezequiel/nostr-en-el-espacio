/// <reference lib="webworker" />

import { createEventsWorkerRegistry } from '@/features/graph-runtime/workers/events/handlers'
import { bindWorkerScope } from '@/features/graph-runtime/workers/shared/runtime'

declare const self: DedicatedWorkerGlobalScope

bindWorkerScope(self, createEventsWorkerRegistry())

export {}
