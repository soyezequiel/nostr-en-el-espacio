import {
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'

import type {
  GraphLinkRelation,
  UiLayer,
} from '@/features/graph/app/store/types'
import type {
  PhysicsFrameSnapshot,
  PhysicsRuntimeStatus,
  PhysicsTopologyEdgeSnapshot,
  PhysicsTopologyNodeSnapshot,
  PhysicsTopologySnapshot,
  PhysicsWorkerCommand,
  PhysicsWorkerEvent,
} from '@/features/graph/workers/physics/types'

const TICK_INTERVAL_MS = 1000 / 30
// Obsidian-like physics: floaty, gentle, no collision boundaries.
// Nodes drift with inertia, settle in ~3 seconds, and overlap freely.
const AUTO_FREEZE_ALPHA_THRESHOLD = 0.005
const AUTO_FREEZE_STABLE_TICKS = 6
const BASE_ALPHA = 0.3
const ALPHA_MIN = 0.001
const ALPHA_DECAY = 0.05
const VELOCITY_DECAY = 0.35
const CENTER_GRAVITY_STRENGTH = 0.012
const N_BODY_STRENGTH = -200
const N_BODY_DISTANCE_MAX = 600
const DEFAULT_LINK_DISTANCE = 130
const MIN_LINK_DISTANCE = 60
const MAX_LINK_DISTANCE = 260

interface InternalPhysicsNode extends SimulationNodeDatum {
  id: string
  pubkey: string
  radius: number
  isRoot: boolean
  homeX: number
  homeY: number
}

interface InternalPhysicsLink extends SimulationLinkDatum<InternalPhysicsNode> {
  id: string
  source: string | InternalPhysicsNode
  target: string | InternalPhysicsNode
  relation: GraphLinkRelation
  distance: number
}

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const isFinitePoint = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'number' &&
  Number.isFinite(value[0]) &&
  typeof value[1] === 'number' &&
  Number.isFinite(value[1])

const isUiLayer = (value: unknown): value is UiLayer =>
  value === 'graph' ||
  value === 'connections' ||
  value === 'following' ||
  value === 'following-non-followers' ||
  value === 'mutuals' ||
  value === 'followers' ||
  value === 'nonreciprocal-followers' ||
  value === 'keywords' ||
  value === 'zaps' ||
  value === 'pathfinding'

const isRelation = (value: unknown): value is GraphLinkRelation =>
  value === 'follow' || value === 'inbound' || value === 'zap'

const isTopologyNodeSnapshot = (
  value: unknown,
): value is PhysicsTopologyNodeSnapshot =>
  typeof value === 'object' &&
  value !== null &&
  'pubkey' in value &&
  typeof value.pubkey === 'string' &&
  'position' in value &&
  isFinitePoint(value.position) &&
  'radius' in value &&
  typeof value.radius === 'number' &&
  Number.isFinite(value.radius) &&
  'isRoot' in value &&
  typeof value.isRoot === 'boolean'

const isTopologyEdgeSnapshot = (
  value: unknown,
): value is PhysicsTopologyEdgeSnapshot =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string' &&
  'source' in value &&
  typeof value.source === 'string' &&
  'target' in value &&
  typeof value.target === 'string' &&
  'relation' in value &&
  isRelation(value.relation)

const isTopologySnapshot = (value: unknown): value is PhysicsTopologySnapshot =>
  typeof value === 'object' &&
  value !== null &&
  'topologySignature' in value &&
  typeof value.topologySignature === 'string' &&
  'activeLayer' in value &&
  isUiLayer(value.activeLayer) &&
  'rootPubkey' in value &&
  (value.rootPubkey === null || typeof value.rootPubkey === 'string') &&
  'nodes' in value &&
  Array.isArray(value.nodes) &&
  value.nodes.every(isTopologyNodeSnapshot) &&
  'edges' in value &&
  Array.isArray(value.edges) &&
  value.edges.every(isTopologyEdgeSnapshot)

const resolveLinkDistance = ({
  edge,
  nodeByPubkey,
}: {
  edge: PhysicsTopologyEdgeSnapshot
  nodeByPubkey: ReadonlyMap<string, PhysicsTopologyNodeSnapshot>
}) => {
  const sourceNode = nodeByPubkey.get(edge.source)
  const targetNode = nodeByPubkey.get(edge.target)

  if (!sourceNode || !targetNode) {
    return DEFAULT_LINK_DISTANCE
  }

  const dx = targetNode.position[0] - sourceNode.position[0]
  const dy = targetNode.position[1] - sourceNode.position[1]
  const canonicalDistance = Math.hypot(dx, dy)
  const minimumDistance = sourceNode.radius + targetNode.radius + 20
  const fallbackDistance =
    edge.relation === 'zap'
      ? DEFAULT_LINK_DISTANCE + 24
      : edge.relation === 'inbound'
        ? DEFAULT_LINK_DISTANCE - 10
        : DEFAULT_LINK_DISTANCE

  return clampNumber(
    Math.max(
      minimumDistance,
      Number.isFinite(canonicalDistance) && canonicalDistance > 0
        ? canonicalDistance
        : fallbackDistance,
    ),
    MIN_LINK_DISTANCE,
    MAX_LINK_DISTANCE,
  )
}

const resolveLinkStrength = (relation: GraphLinkRelation) =>
  relation === 'zap' ? 0.08 : relation === 'inbound' ? 0.12 : 0.15

export class PhysicsSimulationRuntime {
  private readonly emit: (event: PhysicsWorkerEvent) => void

  private simulation: Simulation<InternalPhysicsNode, InternalPhysicsLink> | null =
    null
  private topologySignature = 'empty'
  private rootPubkey: string | null = null
  private activeLayer: UiLayer = 'graph'
  private nodes: InternalPhysicsNode[] = []
  private nodeByPubkey = new Map<string, InternalPhysicsNode>()
  private links: InternalPhysicsLink[] = []
  private pinnedPubkeys = new Set<string>()
  private draggingPubkey: string | null = null
  private hidden = false
  private enabled = true
  private disposed = false
  private version = 0
  private lowAlphaTicks = 0
  private status: PhysicsRuntimeStatus = 'idle'
  private tickTimer: ReturnType<typeof setInterval> | null = null

  public constructor(emit: (event: PhysicsWorkerEvent) => void) {
    this.emit = emit
  }

  public handleMessage(message: unknown) {
    if (!this.isCommand(message)) {
      this.emitError('Physics worker recibio un mensaje invalido.')
      return
    }

    try {
      switch (message.type) {
        case 'SYNC_TOPOLOGY':
          this.syncTopology(message.payload)
          return
        case 'SET_ENABLED':
          this.setEnabled(message.payload.enabled)
          return
        case 'SET_PINNED':
          this.setPinned(message.payload.pubkeys)
          return
        case 'DRAG_START':
          this.dragStart(message.payload.pubkey, message.payload.position)
          return
        case 'DRAG_MOVE':
          this.dragMove(message.payload.pubkey, message.payload.position)
          return
        case 'DRAG_END':
          this.dragEnd(message.payload.pubkey)
          return
        case 'REHEAT':
          this.reheat()
          return
        case 'SET_VISIBILITY':
          this.setVisibility(message.payload.hidden)
          return
        case 'DISPOSE':
          this.dispose()
          return
      }
    } catch (error) {
      this.emitError(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'La simulacion fisica fallo.',
      )
    }
  }

  private isCommand(message: unknown): message is PhysicsWorkerCommand {
    if (typeof message !== 'object' || message === null || !('type' in message)) {
      return false
    }

    switch (message.type) {
      case 'SYNC_TOPOLOGY':
        return 'payload' in message && isTopologySnapshot(message.payload)
      case 'SET_ENABLED':
        return (
          'payload' in message &&
          typeof message.payload === 'object' &&
          message.payload !== null &&
          'enabled' in message.payload &&
          typeof message.payload.enabled === 'boolean'
        )
      case 'SET_PINNED':
        return (
          'payload' in message &&
          typeof message.payload === 'object' &&
          message.payload !== null &&
          'pubkeys' in message.payload &&
          Array.isArray(message.payload.pubkeys)
        )
      case 'DRAG_START':
      case 'DRAG_MOVE':
        return (
          'payload' in message &&
          typeof message.payload === 'object' &&
          message.payload !== null &&
          'pubkey' in message.payload &&
          typeof message.payload.pubkey === 'string' &&
          'position' in message.payload &&
          isFinitePoint(message.payload.position)
        )
      case 'DRAG_END':
        return (
          'payload' in message &&
          typeof message.payload === 'object' &&
          message.payload !== null &&
          'pubkey' in message.payload &&
          typeof message.payload.pubkey === 'string'
        )
      case 'REHEAT':
        return (
          'payload' in message &&
          typeof message.payload === 'object' &&
          message.payload !== null &&
          'reason' in message.payload &&
          typeof message.payload.reason === 'string'
        )
      case 'SET_VISIBILITY':
        return (
          'payload' in message &&
          typeof message.payload === 'object' &&
          message.payload !== null &&
          'hidden' in message.payload &&
          typeof message.payload.hidden === 'boolean'
        )
      case 'DISPOSE':
        return true
      default:
        return false
    }
  }

  private syncTopology(snapshot: PhysicsTopologySnapshot) {
    if (this.disposed) {
      return
    }

    this.topologySignature = snapshot.topologySignature
    this.rootPubkey = snapshot.rootPubkey
    this.activeLayer = snapshot.activeLayer

    const previousNodeByPubkey = this.nodeByPubkey
    const previousNodeCount = this.nodes.length
    const canonicalNodeByPubkey = new Map(
      snapshot.nodes.map((node) => [node.pubkey, node]),
    )
    const nextNodes = snapshot.nodes.map((node) => {
      const previousNode = previousNodeByPubkey.get(node.pubkey)
      return {
        id: node.pubkey,
        pubkey: node.pubkey,
        radius: node.radius,
        isRoot: node.isRoot,
        homeX: node.position[0],
        homeY: node.position[1],
        x: previousNode?.x ?? node.position[0],
        y: previousNode?.y ?? node.position[1],
        vx: previousNode?.vx ?? 0,
        vy: previousNode?.vy ?? 0,
      } satisfies InternalPhysicsNode
    })
    const nextNodeByPubkey = new Map(
      nextNodes.map((node) => [node.pubkey, node]),
    )
    const nextLinks = snapshot.edges
      .filter(
        (edge) =>
          nextNodeByPubkey.has(edge.source) && nextNodeByPubkey.has(edge.target),
      )
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relation: edge.relation,
        distance: resolveLinkDistance({
          edge,
          nodeByPubkey: canonicalNodeByPubkey,
        }),
      }))

    this.nodes = nextNodes
    this.nodeByPubkey = nextNodeByPubkey
    this.links = nextLinks

    const hasNewNodes = nextNodes.length !== previousNodeCount

    if (hasNewNodes) {
      // New nodes arrived → full rebuild and reheat
      this.rebuildSimulation()
      this.applyPinnedState()
      if (this.enabled && !this.hidden && this.nodes.length > 0) {
        this.reheat()
      } else {
        this.emitFrame()
      }
    } else {
      // Same node set → just update links on the live simulation (no reheat)
      if (this.simulation) {
        this.simulation.force(
          'link',
          forceLink<InternalPhysicsNode, InternalPhysicsLink>(this.links)
            .id((node) => node.id)
            .distance((link) => link.distance)
            .strength((link) => resolveLinkStrength(link.relation)),
        )
        this.simulation.nodes(this.nodes)
      }
      this.applyPinnedState()
      this.emitFrame()
    }
  }

  private rebuildSimulation() {
    this.simulation?.stop()

    if (this.nodes.length === 0) {
      this.simulation = null
      this.updateStatus(this.enabled ? 'idle' : 'disabled')
      this.stopTickLoop()
      return
    }

    const simulation = forceSimulation<InternalPhysicsNode>(this.nodes)
      .alpha(ALPHA_MIN)
      .alphaDecay(ALPHA_DECAY)
      .alphaMin(ALPHA_MIN)
      .velocityDecay(VELOCITY_DECAY)
      .force('charge', forceManyBody<InternalPhysicsNode>()
        .strength(N_BODY_STRENGTH)
        .distanceMax(N_BODY_DISTANCE_MAX))
      .force('link', forceLink<InternalPhysicsNode, InternalPhysicsLink>(this.links)
        .id((node) => node.id)
        .distance((link) => link.distance)
        .strength((link) => resolveLinkStrength(link.relation)))
      .force('gravityX', forceX<InternalPhysicsNode>(0).strength(CENTER_GRAVITY_STRENGTH))
      .force('gravityY', forceY<InternalPhysicsNode>(0).strength(CENTER_GRAVITY_STRENGTH))
      .stop()

    this.simulation = simulation
  }

  private setEnabled(enabled: boolean) {
    this.enabled = enabled

    if (!enabled) {
      this.stopTickLoop()
      this.updateStatus('disabled')
      return
    }

    if (this.nodes.length === 0) {
      this.updateStatus('idle')
      return
    }

    this.reheat()
  }

  private setPinned(pubkeys: readonly string[]) {
    this.pinnedPubkeys = new Set(pubkeys.filter(Boolean))
    this.applyPinnedState()
    if (this.enabled && !this.hidden && this.nodes.length > 0) {
      this.reheat()
    } else {
      this.emitFrame()
    }
  }

  private dragStart(pubkey: string, position: [number, number]) {
    const node = this.nodeByPubkey.get(pubkey)
    if (!node) {
      return
    }

    this.draggingPubkey = pubkey
    node.fx = position[0]
    node.fy = position[1]
    node.x = position[0]
    node.y = position[1]
    this.reheat()
    this.emitFrame()
  }

  private dragMove(pubkey: string, position: [number, number]) {
    if (this.draggingPubkey !== pubkey) {
      return
    }

    const node = this.nodeByPubkey.get(pubkey)
    if (!node) {
      return
    }

    node.fx = position[0]
    node.fy = position[1]
    node.x = position[0]
    node.y = position[1]
    node.vx = 0
    node.vy = 0
    this.emitFrame()
  }

  private dragEnd(pubkey: string) {
    if (this.draggingPubkey !== pubkey) {
      return
    }

    this.draggingPubkey = null
    this.applyPinnedState()
    this.reheat()
  }

  private reheat() {
    if (!this.enabled || this.hidden || this.simulation === null) {
      return
    }

    this.lowAlphaTicks = 0
    this.simulation.alpha(Math.max(this.simulation.alpha(), BASE_ALPHA))
    // alphaTarget stays at 0 so the simulation cools down naturally and
    // autoFreeze can fire. REHEAT_ALPHA only sets the starting alpha.
    this.simulation.alphaTarget(0)
    this.updateStatus('running')
    this.ensureTickLoop()
  }

  private setVisibility(hidden: boolean) {
    this.hidden = hidden

    if (hidden) {
      this.stopTickLoop()
      return
    }

    if (!this.enabled || this.simulation === null || this.status === 'frozen') {
      return
    }

    this.ensureTickLoop()
  }

  private applyPinnedState() {
    for (const node of this.nodes) {
      if (node.isRoot || node.pubkey === this.rootPubkey) {
        node.fx = 0
        node.fy = 0
        node.x = 0
        node.y = 0
        node.vx = 0
        node.vy = 0
        continue
      }

      if (this.draggingPubkey === node.pubkey) {
        continue
      }

      if (this.pinnedPubkeys.has(node.pubkey)) {
        node.fx = node.x ?? node.homeX
        node.fy = node.y ?? node.homeY
        node.vx = 0
        node.vy = 0
      } else {
        node.fx = undefined
        node.fy = undefined
      }
    }
  }

  private ensureTickLoop() {
    if (this.tickTimer !== null || this.hidden || !this.enabled || this.simulation === null) {
      return
    }

    this.tickTimer = setInterval(() => {
      this.tick()
    }, TICK_INTERVAL_MS)
  }

  private stopTickLoop() {
    if (this.tickTimer === null) {
      return
    }

    clearInterval(this.tickTimer)
    this.tickTimer = null
  }

  private tick() {
    if (!this.enabled || this.hidden || this.simulation === null || this.disposed) {
      this.stopTickLoop()
      return
    }

    this.simulation.tick()

    this.emitFrame()

    if (this.simulation.alpha() < AUTO_FREEZE_ALPHA_THRESHOLD) {
      this.lowAlphaTicks += 1
    } else {
      this.lowAlphaTicks = 0
    }

    if (this.lowAlphaTicks >= AUTO_FREEZE_STABLE_TICKS) {
      this.simulation.alphaTarget(0)
      this.updateStatus('frozen')
      this.stopTickLoop()
      return
    }

    this.updateStatus('running')
  }

  private emitFrame() {
    this.version += 1
    const positions = new Float32Array(this.nodes.length * 2)
    const orderedPubkeys = this.nodes.map((node, index) => {
      positions[index * 2] = node.x ?? node.homeX
      positions[index * 2 + 1] = node.y ?? node.homeY
      return node.pubkey
    })

    const frame: PhysicsFrameSnapshot = {
      version: this.version,
      status: this.status,
      orderedPubkeys,
      positions,
    }

    this.emit({
      type: 'FRAME',
      payload: frame,
    })
  }

  private updateStatus(status: PhysicsRuntimeStatus) {
    if (this.status === status) {
      return
    }

    this.status = status
    this.emit({
      type: 'STATUS',
      payload: { status },
    })
  }

  private emitError(message: string) {
    this.emit({
      type: 'ERROR',
      payload: { message },
    })
  }

  private dispose() {
    this.disposed = true
    this.stopTickLoop()
    this.simulation?.stop()
    this.simulation = null
    this.nodes = []
    this.nodeByPubkey.clear()
    this.links = []
    this.updateStatus('disabled')
  }
}
