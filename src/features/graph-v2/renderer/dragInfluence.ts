import type Graph from 'graphology-types'

import type {
  PhysicsEdgeAttributes,
  PhysicsNodeAttributes,
  PhysicsGraphStore,
} from '@/features/graph-v2/renderer/graphologyProjectionStore'

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export interface DragNeighborhoodInfluenceNodeState {
  initialX: number
  initialY: number
  velocityX: number
  velocityY: number
  hopDistance: number
  anchorStiffness: number
}

export interface DragNeighborhoodInfluenceEdgeState {
  sourcePubkey: string
  targetPubkey: string
  restLength: number
}

export interface DragNeighborhoodInfluenceState {
  readonly nodes: Map<string, DragNeighborhoodInfluenceNodeState>
  readonly repelledNodes: Map<string, DragNeighborhoodInfluenceNodeState>
  readonly edges: DragNeighborhoodInfluenceEdgeState[]
}

export interface DragNeighborhoodInfluenceStepResult {
  active: boolean
  translated: boolean
}

export interface DragNeighborhoodInfluenceConfig {
  frameMs: number
  maxDeltaMs: number
  edgeStiffness: number
  anchorStiffnessPerHop: number
  baseDamping: number
  maxVelocityPerFrame: number
  maxTranslationPerFrame: number
  dragRepulsionStrength: number
  dragRepulsionRadius: number
  dragRepulsionDecayDistance: number
  dragRepulsionPadding: number
  dragRepulsionAnchorStiffness: number
  maxRepulsionTranslationPerFrame: number
  stopSpeedThreshold: number
  stopDistanceThreshold: number
}

export interface DragNeighborhoodInfluenceTuning {
  edgeStiffness: number
  anchorStiffnessPerHop: number
  baseDamping: number
}

export const DEFAULT_DRAG_NEIGHBORHOOD_INFLUENCE_CONFIG: DragNeighborhoodInfluenceConfig = {
  frameMs: 16,
  maxDeltaMs: 32,
  // Spring stiffness for live graph edges. Propagates the drag through the
  // connected component in an elastic, Obsidian-like way.
  edgeStiffness: 0.09,
  // Per-hop anchor to the original position. Node at hop `h` is held by a
  // spring of strength `anchorStiffnessPerHop * h` toward its initial spot.
  // Close neighbors follow the drag freely; far nodes are progressively
  // anchored so influence decays continuously without a hop cutoff.
  anchorStiffnessPerHop: 0.0055,
  baseDamping: 0.90,
  maxVelocityPerFrame: 6,
  maxTranslationPerFrame: 7,
  // Local repulsion remains active while FA2 is suspended for pointer drag.
  // This lets the dragged node push nearby nodes away instead of tunneling
  // through them until the global layout resumes on release.
  dragRepulsionStrength: 3.2,
  dragRepulsionRadius: 54,
  dragRepulsionDecayDistance: 14,
  dragRepulsionPadding: 8,
  dragRepulsionAnchorStiffness: 0.006,
  maxRepulsionTranslationPerFrame: 7,
  stopSpeedThreshold: 0.035,
  stopDistanceThreshold: 0.12,
}

export const DEFAULT_DRAG_NEIGHBORHOOD_INFLUENCE_TUNING: DragNeighborhoodInfluenceTuning = {
  edgeStiffness: DEFAULT_DRAG_NEIGHBORHOOD_INFLUENCE_CONFIG.edgeStiffness,
  anchorStiffnessPerHop:
    DEFAULT_DRAG_NEIGHBORHOOD_INFLUENCE_CONFIG.anchorStiffnessPerHop,
  baseDamping: DEFAULT_DRAG_NEIGHBORHOOD_INFLUENCE_CONFIG.baseDamping,
}

export const createDragNeighborhoodInfluenceConfig = (
  tuning: Partial<DragNeighborhoodInfluenceTuning> = {},
): DragNeighborhoodInfluenceConfig => ({
  ...DEFAULT_DRAG_NEIGHBORHOOD_INFLUENCE_CONFIG,
  edgeStiffness: clamp(
    tuning.edgeStiffness ??
      DEFAULT_DRAG_NEIGHBORHOOD_INFLUENCE_TUNING.edgeStiffness,
    0.001,
    0.25,
  ),
  anchorStiffnessPerHop: clamp(
    tuning.anchorStiffnessPerHop ??
      DEFAULT_DRAG_NEIGHBORHOOD_INFLUENCE_TUNING.anchorStiffnessPerHop,
    0.0001,
    0.05,
  ),
  baseDamping: clamp(
    tuning.baseDamping ??
      DEFAULT_DRAG_NEIGHBORHOOD_INFLUENCE_TUNING.baseDamping,
    0.4,
    0.999,
  ),
})

const toFrameScale = (
  deltaMs: number,
  config: DragNeighborhoodInfluenceConfig,
) =>
  clamp(
    deltaMs / config.frameMs,
    0,
    config.maxDeltaMs / config.frameMs,
  )

export const createDragNeighborhoodInfluenceState = (
  projectionStore: PhysicsGraphStore,
  draggedNodePubkey: string,
  hopDistances: ReadonlyMap<string, number>,
  config: DragNeighborhoodInfluenceConfig = DEFAULT_DRAG_NEIGHBORHOOD_INFLUENCE_CONFIG,
  previousState: DragNeighborhoodInfluenceState | null = null,
): DragNeighborhoodInfluenceState => {
  const nodes = new Map<string, DragNeighborhoodInfluenceNodeState>()
  const repelledNodes = new Map<string, DragNeighborhoodInfluenceNodeState>()
  const edges: DragNeighborhoodInfluenceEdgeState[] = []
  const graph = projectionStore.getGraph()

  if (!graph.hasNode(draggedNodePubkey)) {
    return { nodes, repelledNodes, edges }
  }

  for (const [pubkey, hopDistance] of hopDistances) {
    if (pubkey === draggedNodePubkey) {
      continue
    }

    const position = projectionStore.getNodePosition(pubkey)

    if (!position) {
      continue
    }

    const previousNodeState = previousState?.nodes.get(pubkey)
    nodes.set(pubkey, {
      initialX: previousNodeState?.initialX ?? position.x,
      initialY: previousNodeState?.initialY ?? position.y,
      velocityX: previousNodeState?.velocityX ?? 0,
      velocityY: previousNodeState?.velocityY ?? 0,
      hopDistance,
      anchorStiffness: config.anchorStiffnessPerHop * hopDistance,
    })
  }

  for (const pubkey of graph.nodes()) {
    if (pubkey === draggedNodePubkey || nodes.has(pubkey)) {
      continue
    }

    const position = projectionStore.getNodePosition(pubkey)

    if (!position) {
      continue
    }

    const previousNodeState = previousState?.repelledNodes.get(pubkey)
    repelledNodes.set(pubkey, {
      initialX: previousNodeState?.initialX ?? position.x,
      initialY: previousNodeState?.initialY ?? position.y,
      velocityX: previousNodeState?.velocityX ?? 0,
      velocityY: previousNodeState?.velocityY ?? 0,
      hopDistance: Number.POSITIVE_INFINITY,
      anchorStiffness: config.dragRepulsionAnchorStiffness,
    })
  }

  // Collect spring edges between the dragged node and its influence set.
  // Undirected: graphology exposes `forEachNeighbor` which covers both
  // incoming and outgoing neighbours, but edges are directed by id. We use
  // edge iteration to keep exactly one spring per pair.
  const includedPubkeys = new Set([draggedNodePubkey, ...nodes.keys()])
  const seenEdgeKeys = new Set<string>()

  const typedGraph = graph as Graph<PhysicsNodeAttributes, PhysicsEdgeAttributes>
  for (const pubkey of includedPubkeys) {
    typedGraph.forEachNeighbor(pubkey, (neighborPubkey) => {
      if (!includedPubkeys.has(neighborPubkey)) {
        return
      }

      const pairKey =
        pubkey < neighborPubkey
          ? `${pubkey}::${neighborPubkey}`
          : `${neighborPubkey}::${pubkey}`

      if (seenEdgeKeys.has(pairKey)) {
        return
      }

      seenEdgeKeys.add(pairKey)

      const sourcePosition = projectionStore.getNodePosition(pubkey)
      const targetPosition = projectionStore.getNodePosition(neighborPubkey)

      if (!sourcePosition || !targetPosition) {
        return
      }

      const restLength = Math.hypot(
        targetPosition.x - sourcePosition.x,
        targetPosition.y - sourcePosition.y,
      )

      edges.push({
        sourcePubkey: pubkey,
        targetPubkey: neighborPubkey,
        restLength,
      })
    })
  }

  return { nodes, repelledNodes, edges }
}

interface ForceAccumulator {
  fx: number
  fy: number
}

const addForce = (
  forces: Map<string, ForceAccumulator>,
  pubkey: string,
  fx: number,
  fy: number,
) => {
  const existing = forces.get(pubkey)
  if (existing) {
    existing.fx += fx
    existing.fy += fy
    return
  }
  forces.set(pubkey, { fx, fy })
}

const resolveFallbackDirection = (pubkey: string) => {
  let hash = 0

  for (let index = 0; index < pubkey.length; index += 1) {
    hash = (hash * 31 + pubkey.charCodeAt(index)) >>> 0
  }

  const angle = (hash / 0xffffffff) * Math.PI * 2

  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  }
}

const applyDraggedNodeRepulsion = (
  projectionStore: PhysicsGraphStore,
  draggedNodePubkey: string,
  forces: Map<string, ForceAccumulator>,
  config: DragNeighborhoodInfluenceConfig,
) => {
  const draggedPosition = projectionStore.getNodePosition(draggedNodePubkey)
  const graph = projectionStore.getGraph()

  if (!draggedPosition || !graph.hasNode(draggedNodePubkey)) {
    return false
  }

  const draggedAttributes = graph.getNodeAttributes(draggedNodePubkey)
  let appliedForce = false

  for (const pubkey of graph.nodes()) {
    if (
      pubkey === draggedNodePubkey ||
      projectionStore.isNodeFixed(pubkey)
    ) {
      continue
    }

    const position = projectionStore.getNodePosition(pubkey)

    if (!position) {
      continue
    }

    const attributes = graph.getNodeAttributes(pubkey)
    const collisionDistance =
      (draggedAttributes.size + attributes.size) * 0.5 +
      config.dragRepulsionPadding
    const repulsionRadius = Math.max(
      config.dragRepulsionRadius,
      collisionDistance,
    )
    const dx = position.x - draggedPosition.x
    const dy = position.y - draggedPosition.y
    const distance = Math.hypot(dx, dy)

    if (distance >= repulsionRadius) {
      continue
    }

    const direction =
      distance === 0
        ? resolveFallbackDirection(pubkey)
        : {
            x: dx / distance,
            y: dy / distance,
          }
    const exponentialPressure = Math.exp(
      -distance / config.dragRepulsionDecayDistance,
    )
    const collisionPressure =
      distance < collisionDistance
        ? (collisionDistance - distance) / collisionDistance
        : 0
    const magnitude = clamp(
      config.dragRepulsionStrength * exponentialPressure +
        config.dragRepulsionStrength * collisionPressure,
      0,
      config.maxRepulsionTranslationPerFrame,
    )

    if (magnitude === 0) {
      continue
    }

    addForce(forces, pubkey, direction.x * magnitude, direction.y * magnitude)
    appliedForce = true
  }

  return appliedForce
}

const stepInfluencedNode = (
  projectionStore: PhysicsGraphStore,
  pubkey: string,
  nodeState: DragNeighborhoodInfluenceNodeState,
  forces: Map<string, ForceAccumulator>,
  frameScale: number,
  config: DragNeighborhoodInfluenceConfig,
) => {
  if (projectionStore.isNodeFixed(pubkey)) {
    return { active: false, translated: false }
  }

  const position = projectionStore.getNodePosition(pubkey)

  if (!position) {
    return { active: false, translated: false }
  }

  const edgeForce = forces.get(pubkey) ?? { fx: 0, fy: 0 }
  const anchorForceX =
    nodeState.anchorStiffness * (nodeState.initialX - position.x)
  const anchorForceY =
    nodeState.anchorStiffness * (nodeState.initialY - position.y)
  const totalForceX = edgeForce.fx + anchorForceX
  const totalForceY = edgeForce.fy + anchorForceY

  const nextVelocityX = clamp(
    (nodeState.velocityX + totalForceX * frameScale) *
      Math.pow(config.baseDamping, frameScale),
    -config.maxVelocityPerFrame,
    config.maxVelocityPerFrame,
  )
  const nextVelocityY = clamp(
    (nodeState.velocityY + totalForceY * frameScale) *
      Math.pow(config.baseDamping, frameScale),
    -config.maxVelocityPerFrame,
    config.maxVelocityPerFrame,
  )
  const translatedX = clamp(
    nextVelocityX * frameScale,
    -config.maxTranslationPerFrame,
    config.maxTranslationPerFrame,
  )
  const translatedY = clamp(
    nextVelocityY * frameScale,
    -config.maxTranslationPerFrame,
    config.maxTranslationPerFrame,
  )

  nodeState.velocityX = nextVelocityX
  nodeState.velocityY = nextVelocityY

  if (translatedX !== 0 || translatedY !== 0) {
    projectionStore.translateNodePosition(pubkey, translatedX, translatedY)
  }

  const speed = Math.hypot(nextVelocityX, nextVelocityY)
  const residualFromAnchor = Math.hypot(
    position.x + translatedX - nodeState.initialX,
    position.y + translatedY - nodeState.initialY,
  )

  return {
    active:
      speed > config.stopSpeedThreshold ||
      residualFromAnchor > config.stopDistanceThreshold,
    translated: translatedX !== 0 || translatedY !== 0,
  }
}

export const stepDragNeighborhoodInfluence = (
  projectionStore: PhysicsGraphStore,
  draggedNodePubkey: string,
  influenceState: DragNeighborhoodInfluenceState,
  deltaMs: number,
  config: DragNeighborhoodInfluenceConfig = DEFAULT_DRAG_NEIGHBORHOOD_INFLUENCE_CONFIG,
): DragNeighborhoodInfluenceStepResult => {
  if (!projectionStore.getNodePosition(draggedNodePubkey)) {
    return { active: false, translated: false }
  }

  const frameScale = toFrameScale(deltaMs, config)

  if (frameScale === 0) {
    return { active: false, translated: false }
  }

  const forces = new Map<string, ForceAccumulator>()

  // Spring forces from live graph edges.
  for (const edge of influenceState.edges) {
    const sourcePosition = projectionStore.getNodePosition(edge.sourcePubkey)
    const targetPosition = projectionStore.getNodePosition(edge.targetPubkey)

    if (!sourcePosition || !targetPosition) {
      continue
    }

    const dx = targetPosition.x - sourcePosition.x
    const dy = targetPosition.y - sourcePosition.y
    const distance = Math.hypot(dx, dy)

    if (distance === 0) {
      continue
    }

    const displacement = distance - edge.restLength
    const magnitude = config.edgeStiffness * displacement
    const ux = dx / distance
    const uy = dy / distance

    // Force pulls source toward target when stretched, pushes apart when
    // compressed. Equal-and-opposite pairs.
    addForce(forces, edge.sourcePubkey, magnitude * ux, magnitude * uy)
    addForce(forces, edge.targetPubkey, -magnitude * ux, -magnitude * uy)
  }

  let active = false
  let translated = false

  const hasRepulsionForce = applyDraggedNodeRepulsion(
    projectionStore,
    draggedNodePubkey,
    forces,
    config,
  )
  active = hasRepulsionForce

  for (const [pubkey, nodeState] of influenceState.nodes) {
    const result = stepInfluencedNode(
      projectionStore,
      pubkey,
      nodeState,
      forces,
      frameScale,
      config,
    )
    active ||= result.active
    translated ||= result.translated
  }

  for (const [pubkey, nodeState] of influenceState.repelledNodes) {
    const result = stepInfluencedNode(
      projectionStore,
      pubkey,
      nodeState,
      forces,
      frameScale,
      config,
    )
    active ||= result.active
    translated ||= result.translated
  }

  return { active, translated }
}

export const releaseDraggedNode = (
  projectionStore: PhysicsGraphStore,
  draggedNodePubkey: string,
  pinnedPubkeys: readonly string[],
) => {
  projectionStore.setNodeFixed(
    draggedNodePubkey,
    pinnedPubkeys.includes(draggedNodePubkey),
  )
}

// Multiplies all node velocities in an influence state by `factor` (0–1).
// Call this just before resuming FA2 on drag release so residual spring
// momentum doesn't kick clusters out when the layout restarts.
export const dampInfluenceVelocities = (
  state: DragNeighborhoodInfluenceState,
  factor: number,
) => {
  for (const nodeState of state.nodes.values()) {
    nodeState.velocityX *= factor
    nodeState.velocityY *= factor
  }
  for (const nodeState of state.repelledNodes.values()) {
    nodeState.velocityX *= factor
    nodeState.velocityY *= factor
  }
}
