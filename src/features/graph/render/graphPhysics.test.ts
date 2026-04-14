import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_DENSE_GRAPH_PHYSICS_CONFIG,
  createGraphPhysicsSimulation,
  type GraphPhysicsLink,
  type GraphPhysicsNode,
} from './graphPhysics'
import {
  createFixtureEdgeIds,
  createFiveExpandersSharedHubsFixture,
  createPhysicsJobFromFixture,
  createPositionMapFromPhysicsNodes,
  createSyntheticExpandedIntersectionFixture,
  createThreeExpandersPartialOverlapFixture,
  createTwoExpandersStrongOverlapFixture,
  formatFixtureLayoutMetrics,
  measureFixtureLayoutMetrics,
  roundFixtureLayoutMetrics,
} from './graphRenderBaselineTestUtils'

const createNode = ({
  id,
  x,
  y,
  radius = 12,
  isRoot = false,
}: {
  id: string
  x: number
  y: number
  radius?: number
  isRoot?: boolean
}): GraphPhysicsNode => ({
  id,
  pubkey: id,
  radius,
  isRoot,
  x,
  y,
  ...(isRoot ? { fx: 0, fy: 0 } : {}),
})

const DEFAULT_RENDER_CONFIG = {
  edgeThickness: 1,
  edgeOpacity: 1,
  arrowType: 'none' as const,
  nodeSpacingFactor: 1,
  nodeSizeFactor: 1,
  autoSizeNodes: true,
  imageQualityMode: 'adaptive' as const,
  showSharedEmphasis: false,
}

const runSimulation = async ({
  nodes,
  links = [],
  ticks,
}: {
  nodes: GraphPhysicsNode[]
  links?: GraphPhysicsLink[]
  ticks?: number
}) =>
  createGraphPhysicsSimulation().run({
    nodes,
    links,
    rootNodePubkey: nodes.find((node) => node.isRoot)?.pubkey ?? null,
    sharedByExpandedCount: new Map<string, number>(),
    renderConfig: DEFAULT_RENDER_CONFIG,
    activeLayer: 'graph',
    ticks,
  })

const runFixtureSimulation = async (
  fixture:
    | ReturnType<typeof createTwoExpandersStrongOverlapFixture>
    | ReturnType<typeof createThreeExpandersPartialOverlapFixture>
    | ReturnType<typeof createFiveExpandersSharedHubsFixture>
    | ReturnType<typeof createSyntheticExpandedIntersectionFixture>,
  ticks = DEFAULT_DENSE_GRAPH_PHYSICS_CONFIG.ticks,
) => {
  const job = createPhysicsJobFromFixture(fixture, { ticks })
  await createGraphPhysicsSimulation().run(job)
  return job
}

test('exposes dense-graph defaults tuned for fast settling and Barnes-Hut', () => {
  assert.equal(DEFAULT_DENSE_GRAPH_PHYSICS_CONFIG.nBodyTheta, 0.9)
  assert.ok(DEFAULT_DENSE_GRAPH_PHYSICS_CONFIG.alphaDecay >= 0.2)
  assert.ok(DEFAULT_DENSE_GRAPH_PHYSICS_CONFIG.nBodyStrength <= -500)
  assert.ok(DEFAULT_DENSE_GRAPH_PHYSICS_CONFIG.centerGravityStrength > 0)
  assert.ok(DEFAULT_DENSE_GRAPH_PHYSICS_CONFIG.collisionPadding >= 20)
  assert.ok(DEFAULT_DENSE_GRAPH_PHYSICS_CONFIG.siblingLinkDistance >= 100)
})

test('run returns the same mutated node array and keeps the root anchored', async () => {
  const nodes = [
    createNode({ id: 'root', x: 0, y: 0, radius: 24, isRoot: true }),
    createNode({ id: 'a', x: 120, y: 40 }),
    createNode({ id: 'b', x: -100, y: -50 }),
  ]

  const links: GraphPhysicsLink[] = [
    { id: 'root-a', source: 'root', target: 'a', relation: 'follow' },
    { id: 'root-b', source: 'root', target: 'b', relation: 'follow' },
  ]

  const result = await runSimulation({ nodes, links, ticks: 30 })

  assert.strictEqual(result, nodes)
  assert.equal(nodes[0].x, 0)
  assert.equal(nodes[0].y, 0)
})

test('soft central gravity reins in disconnected nodes instead of letting them drift away', async () => {
  const nodes = [
    createNode({ id: 'root', x: 0, y: 0, radius: 24, isRoot: true }),
    createNode({ id: 'far-east', x: 1800, y: 1200 }),
    createNode({ id: 'far-west', x: -1600, y: -1100 }),
    createNode({ id: 'far-north', x: 900, y: -1700 }),
  ]

  const beforeMaxDistance = Math.max(
    ...nodes.map((node) => Math.hypot(node.x, node.y)),
  )

  await runSimulation({ nodes, ticks: 60 })

  const afterMaxDistance = Math.max(
    ...nodes.map((node) => Math.hypot(node.x, node.y)),
  )

  assert.ok(afterMaxDistance < beforeMaxDistance)
})

test('collision radius uses node size to break up overlapping dense clusters', async () => {
  const nodes = [
    createNode({ id: 'root', x: 0, y: 0, radius: 20, isRoot: true }),
    createNode({ id: 'a', x: 0, y: 0, radius: 20 }),
    createNode({ id: 'b', x: 0, y: 0, radius: 20 }),
  ]

  await runSimulation({ nodes, ticks: 50 })

  const distanceAB = Math.hypot(nodes[1].x - nodes[2].x, nodes[1].y - nodes[2].y)
  assert.ok(
    distanceAB >= nodes[1].radius + nodes[2].radius,
    `expected separated nodes, got distance ${distanceAB}`,
  )
})

test('physics baseline keeps shared targets tighter than unique targets across deterministic overlap fixtures', async (suite) => {
  const fixtures = [
    createTwoExpandersStrongOverlapFixture(),
    createThreeExpandersPartialOverlapFixture(),
    createFiveExpandersSharedHubsFixture(),
  ]
  const expectedMetricsByFixture = new Map([
    [
      'two-expanders-strong-overlap',
      {
        fixtureName: 'two-expanders-strong-overlap',
        avgSharedTargetDistanceToExpanders: 224.1,
        avgUniqueTargetDistanceToExpander: 190.92,
        sharedEdgeSurvivalRatio: 1,
        survivedSharedEdgeCount: 4,
        expectedSharedEdgeCount: 4,
        radialLegibilityScore: 0.01,
      },
    ],
    [
      'three-expanders-partial-overlap',
      {
        fixtureName: 'three-expanders-partial-overlap',
        avgSharedTargetDistanceToExpanders: 212.04,
        avgUniqueTargetDistanceToExpander: 173.99,
        sharedEdgeSurvivalRatio: 1,
        survivedSharedEdgeCount: 7,
        expectedSharedEdgeCount: 7,
        radialLegibilityScore: -0.24,
      },
    ],
    [
      'five-expanders-shared-hubs',
      {
        fixtureName: 'five-expanders-shared-hubs',
        avgSharedTargetDistanceToExpanders: 222.69,
        avgUniqueTargetDistanceToExpander: 227.73,
        sharedEdgeSurvivalRatio: 1,
        survivedSharedEdgeCount: 11,
        expectedSharedEdgeCount: 11,
        radialLegibilityScore: -0.08,
      },
    ],
  ])

  for (const fixture of fixtures) {
    await suite.test(fixture.name, async () => {
      const job = await runFixtureSimulation(fixture, 120)
      const metrics = measureFixtureLayoutMetrics({
        fixture,
        positionsByPubkey: createPositionMapFromPhysicsNodes(job.nodes),
        visibleEdgeIds: createFixtureEdgeIds(job.links),
      })
      const metricsMessage = formatFixtureLayoutMetrics(metrics)

      assert.deepEqual(
        roundFixtureLayoutMetrics(metrics),
        expectedMetricsByFixture.get(fixture.name),
        metricsMessage,
      )
    })
  }
})

test('physics baseline stays outward-radial under synthetic n-expander overlap with noisy inbound edges', async () => {
  const fixture = createSyntheticExpandedIntersectionFixture({
    expandedCount: 8,
    sharedHubCount: 5,
    pairwiseSharedTargetsPerAdjacentPair: 2,
    uniqueTargetsPerExpander: 4,
    inboundNoisePerExpander: 3,
  })
  const job = await runFixtureSimulation(fixture, 140)
  const metrics = measureFixtureLayoutMetrics({
    fixture,
    positionsByPubkey: createPositionMapFromPhysicsNodes(job.nodes),
    visibleEdgeIds: createFixtureEdgeIds(job.links),
  })
  const metricsMessage = formatFixtureLayoutMetrics(metrics)

  assert.deepEqual(
    roundFixtureLayoutMetrics(metrics),
    {
      fixtureName: 'synthetic-8-expanders-mixed-overlap',
      avgSharedTargetDistanceToExpanders: 261.37,
      avgUniqueTargetDistanceToExpander: 430.48,
      sharedEdgeSurvivalRatio: 1,
      survivedSharedEdgeCount: 72,
      expectedSharedEdgeCount: 72,
      radialLegibilityScore: 0.14,
    },
    metricsMessage,
  )
})
