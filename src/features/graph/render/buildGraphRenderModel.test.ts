import assert from 'node:assert/strict'
import test from 'node:test'

// `tsx --test` executes this suite in CJS mode for this repo, so require keeps
// the export shape stable even though the implementation file uses ESM syntax.
/* eslint-disable @typescript-eslint/no-require-imports */
const { buildGraphRenderModel } = require('./buildGraphRenderModel.ts')
const baselineTestUtils = require('./graphRenderBaselineTestUtils.ts')
/* eslint-enable @typescript-eslint/no-require-imports */

const {
  DEFAULT_TEST_EFFECTIVE_GRAPH_CAPS: DEFAULT_EFFECTIVE_GRAPH_CAPS,
  DEFAULT_TEST_GRAPH_ANALYSIS: DEFAULT_GRAPH_ANALYSIS,
  DEFAULT_TEST_RENDER_CONFIG: DEFAULT_RENDER_CONFIG,
  createFiveExpandersSharedHubsFixture,
  createFixtureEdgeIds,
  createPositionMapFromRenderNodes,
  createRenderModelInputFromFixture,
  createSyntheticExpandedIntersectionFixture,
  createThreeExpandersPartialOverlapFixture,
  createTwoExpandersStrongOverlapFixture,
  formatFixtureLayoutMetrics,
  measureFixtureLayoutMetrics,
  roundFixtureLayoutMetrics,
} = baselineTestUtils

test('graph layer includes inbound-only nodes discovered during node expansion', async () => {
  const model = await buildGraphRenderModel({
    nodes: {
      root: { pubkey: 'root', keywordHits: 0, discoveredAt: 0, source: 'root' },
      expanded: {
        pubkey: 'expanded',
        keywordHits: 0,
        discoveredAt: 1,
        source: 'follow',
      },
      inboundFollower: {
        pubkey: 'inboundFollower',
        keywordHits: 0,
        discoveredAt: 2,
        source: 'inbound',
      },
    },
    links: [{ source: 'root', target: 'expanded', relation: 'follow' }],
    inboundLinks: [
      {
        source: 'inboundFollower',
        target: 'expanded',
        relation: 'inbound',
      },
    ],
    connectionsLinks: [],
    zapEdges: [],
    activeLayer: 'graph',
    connectionsSourceLayer: 'graph',
    rootNodePubkey: 'root',
    selectedNodePubkey: 'expanded',
    expandedNodePubkeys: new Set(['expanded']),
    comparedNodePubkeys: new Set(),
    pathfinding: {
      status: 'idle',
      path: null,
    },
    graphAnalysis: DEFAULT_GRAPH_ANALYSIS,
    effectiveGraphCaps: DEFAULT_EFFECTIVE_GRAPH_CAPS,
    renderConfig: DEFAULT_RENDER_CONFIG,
  })

  assert.deepEqual(
    model.nodes.map((node) => node.pubkey).sort(),
    ['expanded', 'inboundFollower', 'root'],
  )
  assert.deepEqual(
    model.edges.map((edge) => edge.id).sort(),
    ['inboundFollower->expanded:inbound', 'root->expanded:follow'],
  )
})

test('graph layer prefers authored follow evidence over inbound evidence for the same direction', async () => {
  const model = await buildGraphRenderModel({
    nodes: {
      root: { pubkey: 'root', keywordHits: 0, discoveredAt: 0, source: 'root' },
      expanded: {
        pubkey: 'expanded',
        keywordHits: 0,
        discoveredAt: 1,
        source: 'follow',
      },
      candidate: {
        pubkey: 'candidate',
        keywordHits: 0,
        discoveredAt: 2,
        source: 'follow',
      },
    },
    links: [
      { source: 'root', target: 'expanded', relation: 'follow' },
      { source: 'candidate', target: 'expanded', relation: 'follow' },
    ],
    inboundLinks: [
      { source: 'candidate', target: 'expanded', relation: 'inbound' },
    ],
    connectionsLinks: [],
    zapEdges: [],
    activeLayer: 'graph',
    connectionsSourceLayer: 'graph',
    rootNodePubkey: 'root',
    selectedNodePubkey: 'expanded',
    expandedNodePubkeys: new Set(['expanded']),
    comparedNodePubkeys: new Set(),
    pathfinding: {
      status: 'idle',
      path: null,
    },
    graphAnalysis: DEFAULT_GRAPH_ANALYSIS,
    effectiveGraphCaps: DEFAULT_EFFECTIVE_GRAPH_CAPS,
    renderConfig: DEFAULT_RENDER_CONFIG,
  })

  const candidateEdgeIds = model.edges
    .map((edge) => edge.id)
    .filter((edgeId) => edgeId.includes('candidate->expanded'))

  assert.deepEqual(candidateEdgeIds, ['candidate->expanded:follow'])
})

test('graph layer treats previous positions as warm-start seeds instead of fixed anchors', async () => {
  const model = await buildGraphRenderModel({
    nodes: {
      root: { pubkey: 'root', keywordHits: 0, discoveredAt: 0, source: 'root' },
      expanded: {
        pubkey: 'expanded',
        keywordHits: 0,
        discoveredAt: 1,
        source: 'follow',
      },
      sibling: {
        pubkey: 'sibling',
        keywordHits: 0,
        discoveredAt: 2,
        source: 'follow',
      },
      inboundFollower: {
        pubkey: 'inboundFollower',
        keywordHits: 0,
        discoveredAt: 3,
        source: 'inbound',
      },
    },
    links: [
      { source: 'root', target: 'expanded', relation: 'follow' },
      { source: 'root', target: 'sibling', relation: 'follow' },
    ],
    inboundLinks: [
      {
        source: 'inboundFollower',
        target: 'expanded',
        relation: 'inbound',
      },
    ],
    connectionsLinks: [],
    zapEdges: [],
    activeLayer: 'graph',
    connectionsSourceLayer: 'graph',
    rootNodePubkey: 'root',
    selectedNodePubkey: 'expanded',
    expandedNodePubkeys: new Set(['expanded']),
    comparedNodePubkeys: new Set(),
    pathfinding: {
      status: 'idle',
      path: null,
    },
    graphAnalysis: DEFAULT_GRAPH_ANALYSIS,
    effectiveGraphCaps: {
      ...DEFAULT_EFFECTIVE_GRAPH_CAPS,
      coldStartLayoutTicks: 40,
      warmStartLayoutTicks: 20,
    },
    renderConfig: DEFAULT_RENDER_CONFIG,
    previousPositions: new Map([
      ['root', [0, 0]],
      ['expanded', [-170, 20]],
      ['sibling', [170, -10]],
    ]),
    previousLayoutKey: 'graph:stale-topology',
  })

  const positionByPubkey = new Map(
    model.nodes.map((node) => [node.pubkey, node.position]),
  )
  const expandedPosition = positionByPubkey.get('expanded')
  const siblingPosition = positionByPubkey.get('sibling')
  const inboundFollowerPosition = positionByPubkey.get('inboundFollower')

  assert.ok(inboundFollowerPosition)
  assert.ok(expandedPosition)
  assert.ok(siblingPosition)
  assert.notDeepEqual(expandedPosition, [-170, 20])
  assert.notDeepEqual(siblingPosition, [170, -10])
})

test('graph layer thinning stays topology-first regardless of selected node', async () => {
  const fixture = createSyntheticExpandedIntersectionFixture({
    expandedCount: 70,
    sharedHubCount: 12,
    pairwiseSharedTargetsPerAdjacentPair: 3,
    uniqueTargetsPerExpander: 10,
    inboundNoisePerExpander: 6,
  })

  const modelWithSelection = await buildGraphRenderModel(
    createRenderModelInputFromFixture(fixture, {
      effectiveGraphCaps: {
        ...DEFAULT_EFFECTIVE_GRAPH_CAPS,
        coldStartLayoutTicks: 0,
        warmStartLayoutTicks: 0,
      },
    }),
  )
  const modelWithoutSelection = await buildGraphRenderModel(
    createRenderModelInputFromFixture(fixture, {
      selectedNodePubkey: null,
      effectiveGraphCaps: {
        ...DEFAULT_EFFECTIVE_GRAPH_CAPS,
        coldStartLayoutTicks: 0,
        warmStartLayoutTicks: 0,
      },
    }),
  )

  assert.deepEqual(
    modelWithSelection.edges.map((edge) => edge.id),
    modelWithoutSelection.edges.map((edge) => edge.id),
  )
  assert.deepEqual(
    modelWithSelection.nodes.map((node) => [node.pubkey, node.position]),
    modelWithoutSelection.nodes.map((node) => [node.pubkey, node.position]),
  )
})

test('graph layer characterization keeps shared follow edges intact for small expanded-overlap fixtures', async (suite) => {
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
        avgSharedTargetDistanceToExpanders: 212.52,
        avgUniqueTargetDistanceToExpander: 221.92,
        sharedEdgeSurvivalRatio: 1,
        survivedSharedEdgeCount: 4,
        expectedSharedEdgeCount: 4,
        radialLegibilityScore: -0.45,
      },
    ],
    [
      'three-expanders-partial-overlap',
      {
        fixtureName: 'three-expanders-partial-overlap',
        avgSharedTargetDistanceToExpanders: 198.92,
        avgUniqueTargetDistanceToExpander: 261.01,
        sharedEdgeSurvivalRatio: 1,
        survivedSharedEdgeCount: 7,
        expectedSharedEdgeCount: 7,
        radialLegibilityScore: -0.54,
      },
    ],
    [
      'five-expanders-shared-hubs',
      {
        fixtureName: 'five-expanders-shared-hubs',
        avgSharedTargetDistanceToExpanders: 202.04,
        avgUniqueTargetDistanceToExpander: 307.59,
        sharedEdgeSurvivalRatio: 1,
        survivedSharedEdgeCount: 11,
        expectedSharedEdgeCount: 11,
        radialLegibilityScore: -0.54,
      },
    ],
  ])

  for (const fixture of fixtures) {
    await suite.test(fixture.name, async () => {
      const model = await buildGraphRenderModel(
        createRenderModelInputFromFixture(fixture, {
          effectiveGraphCaps: {
            ...DEFAULT_EFFECTIVE_GRAPH_CAPS,
            coldStartLayoutTicks: 90,
            warmStartLayoutTicks: 45,
          },
        }),
      )
      const metrics = measureFixtureLayoutMetrics({
        fixture,
        positionsByPubkey: createPositionMapFromRenderNodes(model.nodes),
        visibleEdgeIds: createFixtureEdgeIds(model.edges),
      })
      const metricsMessage = formatFixtureLayoutMetrics(metrics)

      assert.equal(model.lod.edgesThinned, false, metricsMessage)
      assert.deepEqual(
        roundFixtureLayoutMetrics(metrics),
        expectedMetricsByFixture.get(fixture.name),
        metricsMessage,
      )
    })
  }
})

test('graph layer characterization thins a deterministic subset of shared edges once the synthetic mixed-overlap graph exceeds the edge budget', async () => {
  const fixture = createSyntheticExpandedIntersectionFixture({
    expandedCount: 70,
    sharedHubCount: 12,
    pairwiseSharedTargetsPerAdjacentPair: 3,
    uniqueTargetsPerExpander: 10,
    inboundNoisePerExpander: 6,
  })
  const model = await buildGraphRenderModel(
    createRenderModelInputFromFixture(fixture, {
      selectedNodePubkey: null,
      effectiveGraphCaps: {
        ...DEFAULT_EFFECTIVE_GRAPH_CAPS,
        coldStartLayoutTicks: 0,
        warmStartLayoutTicks: 0,
      },
    }),
  )
  const metrics = measureFixtureLayoutMetrics({
    fixture,
    positionsByPubkey: createPositionMapFromRenderNodes(model.nodes),
    visibleEdgeIds: createFixtureEdgeIds(model.edges),
  })
  const metricsMessage = formatFixtureLayoutMetrics(metrics)

  assert.equal(model.lod.edgesThinned, true, metricsMessage)
  assert.ok(model.lod.candidateEdgeCount > model.lod.visibleEdgeCount, metricsMessage)
  assert.ok(model.lod.thinnedEdgeCount > 0, metricsMessage)
  assert.deepEqual(
    roundFixtureLayoutMetrics(metrics),
    {
      fixtureName: 'synthetic-70-expanders-mixed-overlap',
      avgSharedTargetDistanceToExpanders: 434.72,
      avgUniqueTargetDistanceToExpander: 698.4,
      sharedEdgeSurvivalRatio: 0.5,
      survivedSharedEdgeCount: 630,
      expectedSharedEdgeCount: 1260,
      radialLegibilityScore: -0.25,
    },
    metricsMessage,
  )
})
