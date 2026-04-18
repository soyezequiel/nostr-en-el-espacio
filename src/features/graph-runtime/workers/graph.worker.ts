/// <reference lib="webworker" />

import { createGraphWorkerRegistry } from '@/features/graph-runtime/workers/graph/handlers'
import { bindWorkerScope } from '@/features/graph-runtime/workers/shared/runtime'

declare const self: DedicatedWorkerGlobalScope

bindWorkerScope(self, createGraphWorkerRegistry())

export {}
