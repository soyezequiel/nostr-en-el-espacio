import type {
  EffectiveGraphCaps,
  GraphLink,
  GraphNode,
  RenderConfig,
} from '@/features/graph/app/store/types'

import type {
  BuildGraphRenderModelInput,
  GraphRenderEdge,
  GraphRenderNode,
} from './types'
import type {
  GraphPhysicsLayoutJob,
  GraphPhysicsLink,
  GraphPhysicsNode,
} from './graphPhysics'

type Point = {
  x: number
  y: number
}

const ROOT_PUBKEY = 'root'
const TWO_PI = Math.PI * 2
const ROOT_RADIUS = 24
const DEFAULT_NODE_RADIUS = 12

export const DEFAULT_TEST_EFFECTIVE_GRAPH_CAPS: EffectiveGraphCaps = {
  maxNodes: 3000,
  coldStartLayoutTicks: 1,
  warmStartLayoutTicks: 1,
}

export const DEFAULT_TEST_RENDER_CONFIG: RenderConfig = {
  edgeThickness: 1,
  edgeOpacity: 1,
  arrowType: 'triangle',
  nodeSpacingFactor: 1.25,
  nodeSizeFactor: 0.88,
  autoSizeNodes: false,
  imageQualityMode: 'adaptive',
  showSharedEmphasis: true,
}

export const DEFAULT_TEST_GRAPH_ANALYSIS: NonNullable<
  BuildGraphRenderModelInput['graphAnalysis']
> = {
  status: 'idle',
  isStale: false,
  analysisKey: null,
  message: null,
  result: null,
}

type SharedTargetMap = Record<string, string[]>
type UniqueTargetMap = Record<string, string[]>
type InboundNoiseMap = Record<string, string[]>

export type ExpandedIntersectionFixture = {
  name: string
  rootPubkey: string
  orderedPubkeys: string[]
  expanderPubkeys: string[]
  expandedNodePubkeys: ReadonlySet<string>
  selectedNodePubkey: string | null
  nodes: Record<string, GraphNode>
  links: GraphLink[]
  inboundLinks: GraphLink[]
  sharedTargets: string[]
  sharedTargetExpanders: SharedTargetMap
  uniqueTargetsByExpander: UniqueTargetMap
  inboundNoiseByTarget: InboundNoiseMap
}

export type FixtureLayoutMetrics = {
  fixtureName: string
  avgSharedTargetDistanceToExpanders: number
  avgUniqueTargetDistanceToExpander: number
  sharedEdgeSurvivalRatio: number
  survivedSharedEdgeCount: number
  expectedSharedEdgeCount: number
  radialLegibilityScore: number
}

const createNode = (
  pubkey: string,
  discoveredAt: number,
  source: GraphNode['source'],
): GraphNode => ({
  pubkey,
  keywordHits: 0,
  discoveredAt,
  source,
})

const createLinkId = (
  source: string,
  target: string,
  relation: GraphLink['relation'],
) => `${source}->${target}:${relation}`

const hashString = (value: string) => {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

const polar = (angle: number, radius: number): Point => ({
  x: Math.cos(angle) * radius,
  y: Math.sin(angle) * radius,
})

const pointAdd = (left: Point, right: Point): Point => ({
  x: left.x + right.x,
  y: left.y + right.y,
})

const pointScale = (point: Point, factor: number): Point => ({
  x: point.x * factor,
  y: point.y * factor,
})

const pointDistance = (left: Point, right: Point) =>
  Math.hypot(left.x - right.x, left.y - right.y)

const averagePoint = (points: readonly Point[]): Point => {
  if (points.length === 0) {
    return { x: 0, y: 0 }
  }

  const total = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  )

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  }
}

const normalize = (point: Point): Point => {
  const magnitude = Math.hypot(point.x, point.y)

  if (magnitude === 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: point.x / magnitude,
    y: point.y / magnitude,
  }
}

const dotProduct = (left: Point, right: Point) =>
  left.x * right.x + left.y * right.y

const getExpanderSlug = (expanderPubkey: string) =>
  expanderPubkey.replace(/^expander-/, '')

const toPositionMap = (
  nodes: readonly Pick<GraphRenderNode, 'pubkey' | 'position'>[],
) =>
  new Map(nodes.map((node) => [node.pubkey, { x: node.position[0], y: node.position[1] }]))

export const createPositionMapFromRenderNodes = toPositionMap

export const createPositionMapFromPhysicsNodes = (
  nodes: readonly Pick<GraphPhysicsNode, 'pubkey' | 'x' | 'y'>[],
) => new Map(nodes.map((node) => [node.pubkey, { x: node.x, y: node.y }]))

const createFixtureBuilder = (name: string, expanderSlugs: readonly string[]) => {
  let discoveredAt = 0
  const orderedPubkeys: string[] = []
  const nodes: Record<string, GraphNode> = {}
  const links: GraphLink[] = []
  const inboundLinks: GraphLink[] = []
  const expanderPubkeys = expanderSlugs.map((slug) => `expander-${slug}`)
  const sharedTargets: string[] = []
  const sharedTargetExpanders: SharedTargetMap = {}
  const uniqueTargetsByExpander: UniqueTargetMap = Object.fromEntries(
    expanderPubkeys.map((pubkey) => [pubkey, []]),
  )
  const inboundNoiseByTarget: InboundNoiseMap = {}

  const registerNode = (pubkey: string, source: GraphNode['source']) => {
    discoveredAt += 1
    nodes[pubkey] = createNode(pubkey, discoveredAt, source)
    orderedPubkeys.push(pubkey)
    return pubkey
  }

  nodes[ROOT_PUBKEY] = createNode(ROOT_PUBKEY, discoveredAt, 'root')
  orderedPubkeys.push(ROOT_PUBKEY)

  for (const expanderPubkey of expanderPubkeys) {
    registerNode(expanderPubkey, 'follow')
    links.push({
      source: ROOT_PUBKEY,
      target: expanderPubkey,
      relation: 'follow',
    })
  }

  return {
    expanderPubkeys,
    addSharedTarget(slug: string, expanders: readonly string[]) {
      const pubkey = registerNode(`shared-${slug}`, 'follow')
      sharedTargets.push(pubkey)
      sharedTargetExpanders[pubkey] = [...expanders]

      for (const expanderPubkey of expanders) {
        links.push({
          source: expanderPubkey,
          target: pubkey,
          relation: 'follow',
        })
      }

      return pubkey
    },
    addUniqueTarget(expanderPubkey: string, slug: string) {
      const pubkey = registerNode(`unique-${slug}`, 'follow')
      uniqueTargetsByExpander[expanderPubkey].push(pubkey)
      links.push({
        source: expanderPubkey,
        target: pubkey,
        relation: 'follow',
      })
      return pubkey
    },
    addInboundNoise(slug: string, targetPubkey: string) {
      const pubkey = registerNode(`inbound-${slug}`, 'inbound')
      inboundNoiseByTarget[targetPubkey] = [
        ...(inboundNoiseByTarget[targetPubkey] ?? []),
        pubkey,
      ]
      inboundLinks.push({
        source: pubkey,
        target: targetPubkey,
        relation: 'inbound',
      })
      return pubkey
    },
    build(selectedNodePubkey: string | null): ExpandedIntersectionFixture {
      return {
        name,
        rootPubkey: ROOT_PUBKEY,
        orderedPubkeys,
        expanderPubkeys,
        expandedNodePubkeys: new Set(expanderPubkeys),
        selectedNodePubkey,
        nodes,
        links,
        inboundLinks,
        sharedTargets,
        sharedTargetExpanders,
        uniqueTargetsByExpander,
        inboundNoiseByTarget,
      }
    },
  }
}

export const createTwoExpandersStrongOverlapFixture = () => {
  const builder = createFixtureBuilder('two-expanders-strong-overlap', [
    'alpha',
    'beta',
  ])
  const [alpha, beta] = builder.expanderPubkeys

  builder.addSharedTarget('center-bridge', [alpha, beta])
  builder.addSharedTarget('center-crossing', [alpha, beta])
  builder.addUniqueTarget(alpha, 'alpha-private-north')
  builder.addUniqueTarget(alpha, 'alpha-private-south')
  builder.addUniqueTarget(beta, 'beta-private-north')
  builder.addUniqueTarget(beta, 'beta-private-south')
  builder.addInboundNoise('alpha-shadow', alpha)
  builder.addInboundNoise('beta-shadow', beta)
  builder.addInboundNoise('shared-center-bridge-shadow', 'shared-center-bridge')

  return builder.build(alpha)
}

export const createThreeExpandersPartialOverlapFixture = () => {
  const builder = createFixtureBuilder('three-expanders-partial-overlap', [
    'alpha',
    'beta',
    'gamma',
  ])
  const [alpha, beta, gamma] = builder.expanderPubkeys

  builder.addSharedTarget('alpha-beta-bridge', [alpha, beta])
  builder.addSharedTarget('beta-gamma-bridge', [beta, gamma])
  builder.addSharedTarget('alpha-beta-gamma-pocket', [alpha, beta, gamma])
  builder.addUniqueTarget(alpha, 'alpha-east')
  builder.addUniqueTarget(beta, 'beta-north')
  builder.addUniqueTarget(gamma, 'gamma-west')
  builder.addInboundNoise('beta-shadow', beta)
  builder.addInboundNoise('triangle-shadow', 'shared-alpha-beta-gamma-pocket')

  return builder.build(beta)
}

export const createFiveExpandersSharedHubsFixture = () => {
  const builder = createFixtureBuilder('five-expanders-shared-hubs', [
    'uno',
    'dos',
    'tres',
    'cuatro',
    'cinco',
  ])
  const [uno, dos, tres, cuatro, cinco] = builder.expanderPubkeys

  builder.addSharedTarget('central-hub', [uno, dos, tres, cuatro, cinco])
  builder.addSharedTarget('south-hub', [uno, tres, cinco])
  builder.addSharedTarget('north-hub', [dos, cuatro, cinco])

  for (const expanderPubkey of builder.expanderPubkeys) {
    const slug = getExpanderSlug(expanderPubkey)
    builder.addUniqueTarget(expanderPubkey, `${slug}-solo-a`)
    builder.addUniqueTarget(expanderPubkey, `${slug}-solo-b`)
    builder.addInboundNoise(`${slug}-shadow`, expanderPubkey)
  }

  return builder.build(tres)
}

export const createSyntheticExpandedIntersectionFixture = ({
  expandedCount,
  sharedHubCount = 4,
  pairwiseSharedTargetsPerAdjacentPair = 2,
  uniqueTargetsPerExpander = 3,
  inboundNoisePerExpander = 2,
  selectedExpanderIndex = 0,
}: {
  expandedCount: number
  sharedHubCount?: number
  pairwiseSharedTargetsPerAdjacentPair?: number
  uniqueTargetsPerExpander?: number
  inboundNoisePerExpander?: number
  selectedExpanderIndex?: number
}) => {
  const expanderSlugs = Array.from({ length: expandedCount }, (_, index) =>
    `${index + 1}`.padStart(2, '0'),
  )
  const builder = createFixtureBuilder(
    `synthetic-${expandedCount}-expanders-mixed-overlap`,
    expanderSlugs,
  )

  for (let hubIndex = 0; hubIndex < sharedHubCount; hubIndex += 1) {
    builder.addSharedTarget(
      `global-hub-${String(hubIndex + 1).padStart(2, '0')}`,
      builder.expanderPubkeys,
    )
  }

  for (
    let expanderIndex = 0;
    expanderIndex < builder.expanderPubkeys.length;
    expanderIndex += 1
  ) {
    const currentExpander = builder.expanderPubkeys[expanderIndex]
    const nextExpander =
      builder.expanderPubkeys[
        (expanderIndex + 1) % builder.expanderPubkeys.length
      ]
    const slug = getExpanderSlug(currentExpander)

    for (
      let sharedIndex = 0;
      sharedIndex < pairwiseSharedTargetsPerAdjacentPair;
      sharedIndex += 1
    ) {
      builder.addSharedTarget(
        `arc-${slug}-${getExpanderSlug(nextExpander)}-${String(
          sharedIndex + 1,
        ).padStart(2, '0')}`,
        [currentExpander, nextExpander],
      )
    }

    for (
      let uniqueIndex = 0;
      uniqueIndex < uniqueTargetsPerExpander;
      uniqueIndex += 1
    ) {
      builder.addUniqueTarget(
        currentExpander,
        `${slug}-solo-${String(uniqueIndex + 1).padStart(2, '0')}`,
      )
    }

    for (
      let noiseIndex = 0;
      noiseIndex < inboundNoisePerExpander;
      noiseIndex += 1
    ) {
      const targetPubkey =
        noiseIndex % 2 === 0
          ? currentExpander
          : `shared-global-hub-${String((noiseIndex % sharedHubCount) + 1).padStart(2, '0')}`
      builder.addInboundNoise(
        `${slug}-noise-${String(noiseIndex + 1).padStart(2, '0')}`,
        targetPubkey,
      )
    }
  }

  return builder.build(
    builder.expanderPubkeys[selectedExpanderIndex] ?? builder.expanderPubkeys[0],
  )
}

export const createRenderModelInputFromFixture = (
  fixture: ExpandedIntersectionFixture,
  overrides: Partial<BuildGraphRenderModelInput> = {},
): BuildGraphRenderModelInput => ({
  nodes: fixture.nodes,
  links: fixture.links,
  inboundLinks: fixture.inboundLinks,
  connectionsLinks: [],
  zapEdges: [],
  activeLayer: 'graph',
  connectionsSourceLayer: 'graph',
  rootNodePubkey: fixture.rootPubkey,
  selectedNodePubkey: fixture.selectedNodePubkey,
  expandedNodePubkeys: fixture.expandedNodePubkeys,
  comparedNodePubkeys: new Set(),
  pathfinding: {
    status: 'idle',
    path: null,
  },
  graphAnalysis: DEFAULT_TEST_GRAPH_ANALYSIS,
  effectiveGraphCaps: DEFAULT_TEST_EFFECTIVE_GRAPH_CAPS,
  renderConfig: DEFAULT_TEST_RENDER_CONFIG,
  ...overrides,
})

export const createSharedByExpandedCount = (
  fixture: ExpandedIntersectionFixture,
) =>
  new Map(
    Object.entries(fixture.sharedTargetExpanders).map(([targetPubkey, expanders]) => [
      targetPubkey,
      expanders.length,
    ]),
  )

const createExpanderSeedPositions = (
  fixture: ExpandedIntersectionFixture,
): Map<string, Point> => {
  const positions = new Map<string, Point>()
  const radius = Math.max(150, 120 + fixture.expanderPubkeys.length * 10)
  const startAngle = -Math.PI / 2

  positions.set(fixture.rootPubkey, { x: 0, y: 0 })

  fixture.expanderPubkeys.forEach((expanderPubkey, index) => {
    const angle =
      startAngle + (index / Math.max(1, fixture.expanderPubkeys.length)) * TWO_PI
    positions.set(expanderPubkey, polar(angle, radius))
  })

  return positions
}

export const createPhysicsNodesFromFixture = (
  fixture: ExpandedIntersectionFixture,
): GraphPhysicsNode[] => {
  const seedPositions = createExpanderSeedPositions(fixture)
  const orderedNodes = fixture.orderedPubkeys.map((pubkey) => fixture.nodes[pubkey])

  for (const targetPubkey of fixture.sharedTargets) {
    const expanders = fixture.sharedTargetExpanders[targetPubkey]
    const expanderPoints = expanders.map((expanderPubkey) => seedPositions.get(expanderPubkey)!)
    const centroid = averagePoint(expanderPoints)
    const angle = ((hashString(targetPubkey) % 360) / 360) * TWO_PI
    const offsetRadius = 22 + Math.min(40, expanders.length * 6)
    seedPositions.set(targetPubkey, pointAdd(centroid, polar(angle, offsetRadius)))
  }

  for (const [expanderPubkey, uniqueTargets] of Object.entries(
    fixture.uniqueTargetsByExpander,
  )) {
    const expanderPosition = seedPositions.get(expanderPubkey)!
    const outward = normalize(expanderPosition)
    const tangent = { x: -outward.y, y: outward.x }

    uniqueTargets.forEach((targetPubkey, index) => {
      const tangentDirection = index % 2 === 0 ? 1 : -1
      const position = pointAdd(
        pointAdd(
          expanderPosition,
          pointScale(outward, 88 + index * 18),
        ),
        pointScale(tangent, tangentDirection * (18 + index * 4)),
      )
      seedPositions.set(targetPubkey, position)
    })
  }

  for (const [targetPubkey, inboundNoisePubkeys] of Object.entries(
    fixture.inboundNoiseByTarget,
  )) {
    const anchorPosition = seedPositions.get(targetPubkey) ?? { x: 0, y: 0 }

    inboundNoisePubkeys.forEach((noisePubkey, index) => {
      const angle =
        ((hashString(noisePubkey) % 360) / 360) * TWO_PI + index * 0.4
      seedPositions.set(
        noisePubkey,
        pointAdd(anchorPosition, polar(angle, 52 + index * 12)),
      )
    })
  }

  return orderedNodes.map((node) => {
    const position = seedPositions.get(node.pubkey) ?? { x: 0, y: 0 }
    const isRoot = node.pubkey === fixture.rootPubkey

    return {
      id: node.pubkey,
      pubkey: node.pubkey,
      radius: isRoot ? ROOT_RADIUS : DEFAULT_NODE_RADIUS,
      isRoot,
      x: position.x,
      y: position.y,
      ...(isRoot ? { fx: 0, fy: 0 } : {}),
    }
  })
}

export const createPhysicsLinksFromFixture = (
  fixture: ExpandedIntersectionFixture,
): GraphPhysicsLink[] =>
  [...fixture.links, ...fixture.inboundLinks].map((link) => ({
    id: createLinkId(link.source, link.target, link.relation),
    source: link.source,
    target: link.target,
    relation: link.relation,
  }))

export const createPhysicsJobFromFixture = (
  fixture: ExpandedIntersectionFixture,
  overrides: Partial<GraphPhysicsLayoutJob> = {},
): GraphPhysicsLayoutJob => ({
  nodes: createPhysicsNodesFromFixture(fixture),
  links: createPhysicsLinksFromFixture(fixture),
  rootNodePubkey: fixture.rootPubkey,
  sharedByExpandedCount: createSharedByExpandedCount(fixture),
  renderConfig: DEFAULT_TEST_RENDER_CONFIG,
  activeLayer: 'graph',
  ...overrides,
})

export const createFixtureEdgeIds = (
  edges: readonly Pick<GraphRenderEdge | GraphPhysicsLink, 'id'>[],
) => new Set(edges.map((edge) => edge.id))

export const createExpectedSharedEdgeIds = (
  fixture: ExpandedIntersectionFixture,
) =>
  Object.entries(fixture.sharedTargetExpanders).flatMap(
    ([targetPubkey, expanders]) =>
      expanders.map((expanderPubkey) =>
        createLinkId(expanderPubkey, targetPubkey, 'follow'),
      ),
  )

const createFollowPairs = (fixture: ExpandedIntersectionFixture) => [
  ...Object.entries(fixture.sharedTargetExpanders).flatMap(
    ([targetPubkey, expanders]) =>
      expanders.map((expanderPubkey) => ({
        expanderPubkey,
        targetPubkey,
      })),
  ),
  ...Object.entries(fixture.uniqueTargetsByExpander).flatMap(
    ([expanderPubkey, targets]) =>
      targets.map((targetPubkey) => ({
        expanderPubkey,
        targetPubkey,
      })),
  ),
]

const roundNumber = (value: number, decimals = 2) => {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export const measureFixtureLayoutMetrics = ({
  fixture,
  positionsByPubkey,
  visibleEdgeIds,
}: {
  fixture: ExpandedIntersectionFixture
  positionsByPubkey: ReadonlyMap<string, Point>
  visibleEdgeIds: ReadonlySet<string>
}): FixtureLayoutMetrics => {
  const sharedDistances: number[] = []
  const uniqueDistances: number[] = []
  const radialities: number[] = []
  const rootPosition = positionsByPubkey.get(fixture.rootPubkey) ?? { x: 0, y: 0 }

  Object.entries(fixture.sharedTargetExpanders).forEach(
    ([targetPubkey, expanderPubkeys]) => {
      const targetPosition = positionsByPubkey.get(targetPubkey)

      if (!targetPosition) {
        return
      }

      for (const expanderPubkey of expanderPubkeys) {
        const expanderPosition = positionsByPubkey.get(expanderPubkey)

        if (!expanderPosition) {
          continue
        }

        sharedDistances.push(pointDistance(targetPosition, expanderPosition))
      }
    },
  )

  Object.entries(fixture.uniqueTargetsByExpander).forEach(
    ([expanderPubkey, targetPubkeys]) => {
      const expanderPosition = positionsByPubkey.get(expanderPubkey)

      if (!expanderPosition) {
        return
      }

      for (const targetPubkey of targetPubkeys) {
        const targetPosition = positionsByPubkey.get(targetPubkey)

        if (!targetPosition) {
          continue
        }

        uniqueDistances.push(pointDistance(targetPosition, expanderPosition))
      }
    },
  )

  for (const { expanderPubkey, targetPubkey } of createFollowPairs(fixture)) {
    const expanderPosition = positionsByPubkey.get(expanderPubkey)
    const targetPosition = positionsByPubkey.get(targetPubkey)

    if (!expanderPosition || !targetPosition) {
      continue
    }

    const outward = normalize({
      x: expanderPosition.x - rootPosition.x,
      y: expanderPosition.y - rootPosition.y,
    })
    const spoke = normalize({
      x: targetPosition.x - expanderPosition.x,
      y: targetPosition.y - expanderPosition.y,
    })
    radialities.push(dotProduct(outward, spoke))
  }

  const expectedSharedEdgeIds = createExpectedSharedEdgeIds(fixture)
  const survivedSharedEdgeCount = expectedSharedEdgeIds.filter((edgeId) =>
    visibleEdgeIds.has(edgeId),
  ).length

  return {
    fixtureName: fixture.name,
    avgSharedTargetDistanceToExpanders:
      sharedDistances.reduce((sum, distance) => sum + distance, 0) /
      Math.max(1, sharedDistances.length),
    avgUniqueTargetDistanceToExpander:
      uniqueDistances.reduce((sum, distance) => sum + distance, 0) /
      Math.max(1, uniqueDistances.length),
    sharedEdgeSurvivalRatio:
      survivedSharedEdgeCount / Math.max(1, expectedSharedEdgeIds.length),
    survivedSharedEdgeCount,
    expectedSharedEdgeCount: expectedSharedEdgeIds.length,
    radialLegibilityScore:
      radialities.reduce((sum, value) => sum + value, 0) /
      Math.max(1, radialities.length),
  }
}

export const roundFixtureLayoutMetrics = (
  metrics: FixtureLayoutMetrics,
  decimals = 2,
) => ({
  fixtureName: metrics.fixtureName,
  avgSharedTargetDistanceToExpanders: roundNumber(
    metrics.avgSharedTargetDistanceToExpanders,
    decimals,
  ),
  avgUniqueTargetDistanceToExpander: roundNumber(
    metrics.avgUniqueTargetDistanceToExpander,
    decimals,
  ),
  sharedEdgeSurvivalRatio: roundNumber(metrics.sharedEdgeSurvivalRatio, decimals),
  survivedSharedEdgeCount: metrics.survivedSharedEdgeCount,
  expectedSharedEdgeCount: metrics.expectedSharedEdgeCount,
  radialLegibilityScore: roundNumber(metrics.radialLegibilityScore, decimals),
})

export const formatFixtureLayoutMetrics = (metrics: FixtureLayoutMetrics) =>
  JSON.stringify(roundFixtureLayoutMetrics(metrics))
