import { PhysicsSimulationRuntime } from '@/features/graph/workers/physics/runtime'
import type {
  PhysicsRuntimeStatus,
  PhysicsTopologySnapshot,
  PhysicsWorkerCommand,
  PhysicsWorkerEvent,
} from '@/features/graph/workers/physics/types'

const INLINE_WORKERS_FLAG = '1'
const PHYSICS_WORKER_SCRIPT_URL = '/workers/physics.worker.js'
const PHYSICS_DEBUG_STORAGE_KEY = 'graph:physics-debug'

type PhysicsGatewayListener = (event: PhysicsWorkerEvent) => void

interface PhysicsWorkerLike {
  postMessage(
    message: PhysicsWorkerCommand,
    transfer?: Transferable[],
  ): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<PhysicsWorkerEvent>) => void,
  ): void
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<PhysicsWorkerEvent>) => void,
  ): void
  terminate?(): void
}

export interface PhysicsGateway {
  syncTopology(snapshot: PhysicsTopologySnapshot): void
  setEnabled(enabled: boolean): void
  setPinned(pubkeys: readonly string[]): void
  dragStart(pubkey: string, worldPosition: [number, number]): void
  dragMove(pubkey: string, worldPosition: [number, number]): void
  dragEnd(pubkey: string): void
  reheat(reason: string): void
  setVisibility(hidden: boolean): void
  subscribe(listener: PhysicsGatewayListener): () => void
  dispose(): void
}

const shouldForceInlineWorkers = () =>
  process.env.NEXT_PUBLIC_GRAPH_INLINE_WORKERS === INLINE_WORKERS_FLAG

const shouldEnablePhysicsTrace = () => {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return (
      window.localStorage.getItem(PHYSICS_DEBUG_STORAGE_KEY) === '1' ||
      window.sessionStorage.getItem(PHYSICS_DEBUG_STORAGE_KEY) === '1'
    )
  } catch {
    return false
  }
}

const createInlinePhysicsWorkerLike = (): PhysicsWorkerLike => {
  const listeners = new Set<(event: MessageEvent<PhysicsWorkerEvent>) => void>()
  const runtime = new PhysicsSimulationRuntime((event) => {
    queueMicrotask(() => {
      const messageEvent = new MessageEvent<PhysicsWorkerEvent>('message', {
        data: event,
      })
      listeners.forEach((listener) => listener(messageEvent))
    })
  })

  return {
    postMessage(message) {
      queueMicrotask(() => {
        runtime.handleMessage(message)
      })
    },
    addEventListener(_type, listener) {
      listeners.add(listener)
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener)
    },
    terminate() {
      runtime.handleMessage({ type: 'DISPOSE' })
      listeners.clear()
    },
  }
}

class BrowserPhysicsGateway implements PhysicsGateway {
  private readonly listeners = new Set<PhysicsGatewayListener>()
  private readonly worker: PhysicsWorkerLike
  private disposed = false

  private readonly handleMessage = (event: MessageEvent<PhysicsWorkerEvent>) => {
    for (const listener of this.listeners) {
      listener(event.data)
    }
  }

  public constructor() {
    this.worker = this.createWorker()
    this.worker.addEventListener('message', this.handleMessage)
    this.post({
      type: 'SET_DEBUG_TRACE',
      payload: { enabled: shouldEnablePhysicsTrace() },
    })
  }

  public syncTopology(snapshot: PhysicsTopologySnapshot) {
    this.post({
      type: 'SYNC_TOPOLOGY',
      payload: snapshot,
    })
  }

  public setEnabled(enabled: boolean) {
    this.post({
      type: 'SET_ENABLED',
      payload: { enabled },
    })
  }

  public setPinned(pubkeys: readonly string[]) {
    this.post({
      type: 'SET_PINNED',
      payload: { pubkeys: [...pubkeys] },
    })
  }

  public dragStart(pubkey: string, worldPosition: [number, number]) {
    this.post({
      type: 'DRAG_START',
      payload: { pubkey, position: worldPosition },
    })
  }

  public dragMove(pubkey: string, worldPosition: [number, number]) {
    this.post({
      type: 'DRAG_MOVE',
      payload: { pubkey, position: worldPosition },
    })
  }

  public dragEnd(pubkey: string) {
    this.post({
      type: 'DRAG_END',
      payload: { pubkey },
    })
  }

  public reheat(reason: string) {
    this.post({
      type: 'REHEAT',
      payload: { reason },
    })
  }

  public setVisibility(hidden: boolean) {
    this.post({
      type: 'SET_VISIBILITY',
      payload: { hidden },
    })
  }

  public subscribe(listener: PhysicsGatewayListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  public dispose() {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.post({ type: 'DISPOSE' })
    this.worker.removeEventListener('message', this.handleMessage)
    this.worker.terminate?.()
    this.listeners.clear()
  }

  private createWorker(): PhysicsWorkerLike {
    if (shouldForceInlineWorkers() || typeof Worker === 'undefined') {
      return createInlinePhysicsWorkerLike()
    }

    try {
      return new Worker(PHYSICS_WORKER_SCRIPT_URL, {
        type: 'module',
        name: 'physics.worker',
      }) as PhysicsWorkerLike
    } catch (error) {
      console.warn(
        '[graph] Falling back to inline physics.worker after native worker construction failed.',
        error,
      )
      return createInlinePhysicsWorkerLike()
    }
  }

  private post(command: PhysicsWorkerCommand) {
    if (this.disposed) {
      return
    }

    this.worker.postMessage(command)
  }
}

export const isPhysicsEnabledForProfile = (
  profile: string,
  status: PhysicsRuntimeStatus,
) => profile === 'desktop' && status !== 'disabled'

export function createPhysicsGateway(): PhysicsGateway {
  return new BrowserPhysicsGateway()
}
