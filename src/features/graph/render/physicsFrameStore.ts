import type {
  PhysicsFrameSnapshot,
  PhysicsRuntimeStatus,
} from '@/features/graph/workers/physics/types'

type PhysicsFrameListener = () => void

const EMPTY_STATUS: PhysicsRuntimeStatus = 'disabled'

export class PhysicsFrameStore {
  private readonly listeners = new Set<PhysicsFrameListener>()
  private status: PhysicsRuntimeStatus = EMPTY_STATUS
  private version = 0
  private positionsByPubkey = new Map<string, [number, number]>()

  public subscribe(listener: PhysicsFrameListener) {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  public publishFrame(frame: PhysicsFrameSnapshot) {
    const nextPositionsByPubkey = new Map<string, [number, number]>()

    for (let index = 0; index < frame.orderedPubkeys.length; index += 1) {
      const offset = index * 2
      nextPositionsByPubkey.set(frame.orderedPubkeys[index], [
        frame.positions[offset] ?? 0,
        frame.positions[offset + 1] ?? 0,
      ])
    }

    this.positionsByPubkey = nextPositionsByPubkey
    this.status = frame.status
    this.version = frame.version
    this.emitChange()
  }

  public setStatus(status: PhysicsRuntimeStatus) {
    if (this.status === status) {
      return
    }

    this.status = status
    if (status === 'disabled' || status === 'idle') {
      this.positionsByPubkey = new Map()
      this.version += 1
    }
    this.emitChange()
  }

  public clear() {
    const hadData = this.positionsByPubkey.size > 0 || this.status !== EMPTY_STATUS
    this.positionsByPubkey = new Map()
    this.status = EMPTY_STATUS
    this.version += 1
    if (hadData) {
      this.emitChange()
    }
  }

  public getStatus() {
    return this.status
  }

  public getVersion() {
    return this.version
  }

  public hasLiveFrame() {
    return this.positionsByPubkey.size > 0
  }

  public getPosition(pubkey: string) {
    return this.positionsByPubkey.get(pubkey) ?? null
  }

  private emitChange() {
    for (const listener of this.listeners) {
      listener()
    }
  }
}
