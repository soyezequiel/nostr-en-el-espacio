import type {
  GraphLinkRelation,
  UiLayer,
} from '@/features/graph/app/store/types'

export type PhysicsRuntimeStatus =
  | 'disabled'
  | 'idle'
  | 'running'
  | 'frozen'

export interface PhysicsTopologyNodeSnapshot {
  pubkey: string
  position: [number, number]
  radius: number
  isRoot: boolean
}

export interface PhysicsTopologyEdgeSnapshot {
  id: string
  source: string
  target: string
  relation: GraphLinkRelation
}

export interface PhysicsTopologySnapshot {
  topologySignature: string
  activeLayer: UiLayer
  rootPubkey: string | null
  nodes: PhysicsTopologyNodeSnapshot[]
  edges: PhysicsTopologyEdgeSnapshot[]
}

export interface PhysicsFrameSnapshot {
  version: number
  status: PhysicsRuntimeStatus
  orderedPubkeys: string[]
  positions: Float32Array
}

export type PhysicsWorkerCommand =
  | {
      type: 'SYNC_TOPOLOGY'
      payload: PhysicsTopologySnapshot
    }
  | {
      type: 'SET_ENABLED'
      payload: {
        enabled: boolean
        autoFreeze?: boolean
      }
    }
  | {
      type: 'SET_PINNED'
      payload: {
        pubkeys: string[]
      }
    }
  | {
      type: 'DRAG_START'
      payload: {
        pubkey: string
        position: [number, number]
      }
    }
  | {
      type: 'DRAG_MOVE'
      payload: {
        pubkey: string
        position: [number, number]
      }
    }
  | {
      type: 'DRAG_END'
      payload: {
        pubkey: string
      }
    }
  | {
      type: 'REHEAT'
      payload: {
        reason: string
      }
    }
  | {
      type: 'SET_VISIBILITY'
      payload: {
        hidden: boolean
      }
    }
  | {
      type: 'SET_DEBUG_TRACE'
      payload: {
        enabled: boolean
      }
    }
  | {
      type: 'DISPOSE'
    }

export type PhysicsWorkerEvent =
  | {
      type: 'FRAME'
      payload: PhysicsFrameSnapshot
    }
  | {
      type: 'STATUS'
      payload: {
        status: PhysicsRuntimeStatus
      }
    }
  | {
      type: 'ERROR'
      payload: {
        message: string
      }
    }
