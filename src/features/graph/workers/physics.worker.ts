/// <reference lib="webworker" />

import { PhysicsSimulationRuntime } from '@/features/graph/workers/physics/runtime'
import type { PhysicsWorkerEvent } from '@/features/graph/workers/physics/types'

declare const self: DedicatedWorkerGlobalScope

const runtime = new PhysicsSimulationRuntime((event: PhysicsWorkerEvent) => {
  if (event.type === 'FRAME') {
    self.postMessage(event, [event.payload.positions.buffer])
    return
  }

  self.postMessage(event)
})

self.addEventListener('message', (message) => {
  runtime.handleMessage(message.data)
})

export {}
