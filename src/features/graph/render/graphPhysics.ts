import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from 'd3-force'

import type { BuildGraphRenderModelInput } from '@/features/graph/render/types'

export type GraphPhysicsNode = {
  id: string
  pubkey: string
  radius: number
  isRoot: boolean
  x: number
  y: number
  vx?: number
  vy?: number
  fx?: number
  fy?: number
}

export type GraphPhysicsLink = {
  id: string
  source: string | GraphPhysicsNode
  target: string | GraphPhysicsNode
  relation: 'follow' | 'inbound' | 'zap'
}

export type GraphPhysicsConfig = {
  alpha: number
  alphaDecay: number
  alphaMin: number
  velocityDecay: number
  nBodyStrength: number
  nBodyTheta: number
  nBodyDistanceMax: number
  collisionPadding: number
  connectionsCollisionPadding: number
  collisionStrength: number
  collisionIterations: number
  centerGravityStrength: number
  ticks: number
  linkStrength: number
  sharedLinkStrengthLogFactor: number
  sharedLinkStrengthCap: number
  rootLinkDistance: number
  siblingLinkDistance: number
  connectionsLinkDistance: number
  sharedLinkDistanceReductionPerLog2: number
  sharedLinkDistanceReductionCap: number
}

export type GraphPhysicsLayoutJob = {
  nodes: GraphPhysicsNode[]
  links: GraphPhysicsLink[]
  rootNodePubkey: string | null
  sharedByExpandedCount: ReadonlyMap<string, number>
  renderConfig: BuildGraphRenderModelInput['renderConfig']
  activeLayer: BuildGraphRenderModelInput['activeLayer']
  ticks?: number
}

export const DEFAULT_DENSE_GRAPH_PHYSICS_CONFIG: GraphPhysicsConfig = {
  alpha: 1,
  alphaDecay: 0.2,
  alphaMin: 0.002,
  velocityDecay: 0.32,
  nBodyStrength: -560,
  nBodyTheta: 0.9,
  nBodyDistanceMax: 1200,
  collisionPadding: 20,
  connectionsCollisionPadding: 30,
  collisionStrength: 1,
  collisionIterations: 4,
  centerGravityStrength: 0.018,
  ticks: 90,
  linkStrength: 0.18,
  sharedLinkStrengthLogFactor: 0.035,
  sharedLinkStrengthCap: 0.26,
  rootLinkDistance: 184,
  siblingLinkDistance: 112,
  connectionsLinkDistance: 156,
  sharedLinkDistanceReductionPerLog2: 2,
  sharedLinkDistanceReductionCap: 4,
}

const createSeededRandom = (seed: number) => {
  let state = seed >>> 0

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const createFastSeed = (
  rootNodePubkey: string | null,
  nodeCount: number,
  linkCount: number,
) => {
  let hash = 2166136261
  const key = rootNodePubkey ?? 'none'

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  hash ^= nodeCount
  hash = Math.imul(hash, 16777619)
  hash ^= linkCount
  hash = Math.imul(hash, 16777619)

  return hash >>> 0
}

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const mergeGraphPhysicsConfig = (
  overrides?: Partial<GraphPhysicsConfig>,
): GraphPhysicsConfig => ({
  ...DEFAULT_DENSE_GRAPH_PHYSICS_CONFIG,
  ...overrides,
})

const resolveSharedLinkStrength = ({
  link,
  sharedByExpandedCount,
  config,
}: {
  link: GraphPhysicsLink
  sharedByExpandedCount: ReadonlyMap<string, number>
  config: GraphPhysicsConfig
}) => {
  if (link.relation !== 'follow') {
    return config.linkStrength
  }

  const targetPubkey = (link.target as GraphPhysicsNode).pubkey
  const sharedCount = sharedByExpandedCount.get(targetPubkey) ?? 1

  if (sharedCount <= 1) {
    return config.linkStrength
  }

  return clampNumber(
    config.linkStrength +
      Math.log2(sharedCount) * config.sharedLinkStrengthLogFactor,
    config.linkStrength,
    config.sharedLinkStrengthCap,
  )
}

const resolveLinkDistance = ({
  link,
  rootNodePubkey,
  sharedByExpandedCount,
  renderConfig,
  activeLayer,
  config,
}: {
  link: GraphPhysicsLink
  rootNodePubkey: string | null
  sharedByExpandedCount: ReadonlyMap<string, number>
  renderConfig: BuildGraphRenderModelInput['renderConfig']
  activeLayer: BuildGraphRenderModelInput['activeLayer']
  config: GraphPhysicsConfig
}) => {
  const sourceNode = link.source as GraphPhysicsNode
  const targetNode = link.target as GraphPhysicsNode
  const minimumDistance =
    sourceNode.radius +
    targetNode.radius +
    (activeLayer === 'connections' ? 32 : 20)
  const baseDistance =
    activeLayer === 'connections'
      ? config.connectionsLinkDistance
      : sourceNode.pubkey === rootNodePubkey || targetNode.pubkey === rootNodePubkey
        ? config.rootLinkDistance
        : config.siblingLinkDistance
  const resolvedBaseDistance = Math.max(
    baseDistance * renderConfig.nodeSpacingFactor,
    minimumDistance,
  )

  if (activeLayer === 'connections' || link.relation !== 'follow') {
    return resolvedBaseDistance
  }

  const sharedCount = sharedByExpandedCount.get(targetNode.pubkey) ?? 1
  if (sharedCount <= 1) {
    return resolvedBaseDistance
  }

  const reduction = Math.min(
    Math.log2(sharedCount) * config.sharedLinkDistanceReductionPerLog2,
    config.sharedLinkDistanceReductionCap,
  )

  return Math.max(resolvedBaseDistance - reduction, minimumDistance)
}

const createGraphPhysicsForces = ({
  links,
  rootNodePubkey,
  sharedByExpandedCount,
  renderConfig,
  activeLayer,
  config,
}: Omit<GraphPhysicsLayoutJob, 'nodes' | 'ticks'> & {
  config: GraphPhysicsConfig
}) => ({
  nBody: forceManyBody<GraphPhysicsNode>()
    .strength(config.nBodyStrength)
    .distanceMax(config.nBodyDistanceMax)
    .theta(config.nBodyTheta),
  collision: forceCollide<GraphPhysicsNode>()
    .radius((node) =>
      node.radius +
      (activeLayer === 'connections'
        ? config.connectionsCollisionPadding
        : config.collisionPadding),
    )
    .strength(config.collisionStrength)
    .iterations(config.collisionIterations),
  link: forceLink<GraphPhysicsNode, GraphPhysicsLink>(links)
    .id((node) => node.id)
    .distance((link: GraphPhysicsLink) =>
      resolveLinkDistance({
        link,
        rootNodePubkey,
        sharedByExpandedCount,
        renderConfig,
        activeLayer,
        config,
      }),
    )
    .strength((link: GraphPhysicsLink) =>
      resolveSharedLinkStrength({
        link,
        sharedByExpandedCount,
        config,
      }),
    ),
  center: forceCenter(0, 0),
  gravityX: forceX<GraphPhysicsNode>(0).strength(config.centerGravityStrength),
  gravityY: forceY<GraphPhysicsNode>(0).strength(config.centerGravityStrength),
})

export type GraphPhysicsSimulationRunner = {
  run(job: GraphPhysicsLayoutJob): Promise<GraphPhysicsNode[]>
}

export function createGraphPhysicsSimulation(
  overrides?: Partial<GraphPhysicsConfig>,
): GraphPhysicsSimulationRunner {
  const config = mergeGraphPhysicsConfig(overrides)

  return {
    async run({
      nodes,
      links,
      rootNodePubkey,
      sharedByExpandedCount,
      renderConfig,
      activeLayer,
      ticks = config.ticks,
    }: GraphPhysicsLayoutJob): Promise<GraphPhysicsNode[]> {
      const forces = createGraphPhysicsForces({
        links,
        rootNodePubkey,
        sharedByExpandedCount,
        renderConfig,
        activeLayer,
        config,
      })

      const simulation = forceSimulation(nodes)
        .randomSource(
          createSeededRandom(
            createFastSeed(rootNodePubkey, nodes.length, links.length),
          ),
        )
        .alpha(config.alpha)
        .alphaDecay(config.alphaDecay)
        .alphaMin(config.alphaMin)
        .velocityDecay(config.velocityDecay)
        .force('nBody', forces.nBody)
        .force('collision', forces.collision)
        .force('link', forces.link)
        .force('center', forces.center)
        .force('gravityX', forces.gravityX)
        .force('gravityY', forces.gravityY)
        .stop()

      for (let tick = 0; tick < ticks; tick += 1) {
        simulation.tick()
        if (simulation.alpha() < config.alphaMin) break
      }

      simulation.stop()
      return nodes
    },
  }
}

const defaultGraphPhysicsSimulation = createGraphPhysicsSimulation()

export const runGraphPhysicsLayout = (job: GraphPhysicsLayoutJob) =>
  defaultGraphPhysicsSimulation.run(job)
