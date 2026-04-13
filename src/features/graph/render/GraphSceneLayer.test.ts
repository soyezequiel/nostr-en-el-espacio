import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldBypassCompareFocusFade } from './GraphSceneLayer'
import { buildArrowMarkerData } from './arrowMarkers'
import type { GraphEdgeSegment } from './graphSceneGeometry'
import type { GraphRenderModel } from './types'

const createSegment = (
  overrides: Partial<GraphEdgeSegment> = {},
): GraphEdgeSegment => ({
  id: 'a-b:follow',
  source: 'a',
  target: 'b',
  sourcePosition: [0, 0],
  targetPosition: [10, 0],
  relation: 'follow',
  weight: 0,
  isPriority: false,
  targetSharedByExpandedCount: 0,
  progressStart: 0,
  progressEnd: 1,
  ...overrides,
})

test('uses a dedicated bidirectional marker for reciprocal segments', () => {
  const arrowData = buildArrowMarkerData({
    segments: [
      createSegment({
        id: 'pair:a:b:mutual',
        relation: 'mutual',
        isBidirectional: true,
        progressStart: 0.375,
        progressEnd: 0.5,
      }),
      createSegment({
        id: 'pair:a:b:mutual',
        relation: 'mutual',
        isBidirectional: true,
        progressStart: 0.5,
        progressEnd: 0.625,
      }),
    ],
    arrowType: 'triangle',
  })

  assert.equal(arrowData.length, 1)
  assert.equal(arrowData[0].arrowIcon, 'triangle-bidirectional')
})

test('keeps single-direction arrowheads for non-mutual segments', () => {
  const arrowData = buildArrowMarkerData({
    segments: [createSegment()],
    arrowType: 'arrow',
  })

  assert.equal(arrowData.length, 1)
  assert.equal(arrowData[0].arrowIcon, 'chevron')
})

const createComparisonModel = (): GraphRenderModel => ({
  nodes: [
    {
      id: 'root',
      pubkey: 'root',
      displayLabel: 'Root',
      pictureUrl: null,
      position: [0, 0],
      radius: 20,
      visibleDegree: 0,
      keywordHits: 0,
      isRoot: true,
      isExpanded: false,
      isSelected: false,
      isCommonFollow: false,
      layoutRole: 'root',
      ownerAnchorPubkeys: [],
      membershipSignature: 'root',
      sharedCount: 0,
      isAggregate: false,
      aggregateCount: null,
      source: 'root',
      discoveredAt: 0,
      sharedByExpandedCount: 0,
      fillColor: [0, 0, 0, 255],
      lineColor: [255, 255, 255, 255],
      bridgeHaloColor: null,
      analysisCommunityId: null,
    },
    {
      id: 'anchor',
      pubkey: 'anchor',
      displayLabel: 'Anchor',
      pictureUrl: null,
      position: [1, 1],
      radius: 20,
      visibleDegree: 0,
      keywordHits: 0,
      isRoot: false,
      isExpanded: true,
      isSelected: true,
      isCommonFollow: false,
      layoutRole: 'anchor',
      ownerAnchorPubkeys: ['anchor'],
      membershipSignature: 'anchor:anchor',
      sharedCount: 0,
      isAggregate: false,
      aggregateCount: null,
      source: 'follow',
      discoveredAt: 1,
      sharedByExpandedCount: 0,
      fillColor: [0, 0, 0, 255],
      lineColor: [255, 255, 255, 255],
      bridgeHaloColor: null,
      analysisCommunityId: null,
    },
    {
      id: 'shared',
      pubkey: 'shared',
      displayLabel: 'Shared',
      pictureUrl: null,
      position: [2, 1],
      radius: 16,
      visibleDegree: 0,
      keywordHits: 0,
      isRoot: false,
      isExpanded: false,
      isSelected: false,
      isCommonFollow: false,
      layoutRole: 'target',
      ownerAnchorPubkeys: ['root', 'anchor'],
      membershipSignature: 'anchor|root',
      sharedCount: 2,
      isAggregate: false,
      aggregateCount: null,
      source: 'follow',
      discoveredAt: 2,
      sharedByExpandedCount: 0,
      fillColor: [0, 0, 0, 255],
      lineColor: [255, 255, 255, 255],
      bridgeHaloColor: null,
      analysisCommunityId: null,
    },
  ],
  edges: [],
  labels: [],
  accessibleNodes: [],
  bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  topologySignature: 'graph:test',
  layoutKey: 'test',
  layoutMode: 'multi-center-comparison',
  layoutSnapshot: {
      mode: 'multi-center-comparison',
      comparison: {
        mode: 'multi-center-comparison',
        activeAnchorPubkeys: ['root', 'anchor'],
        comparisonAnchorOrder: ['root', 'anchor'],
        overflowAnchorPubkeys: [],
        membershipSignatureByPubkey: {},
        anchorSlots: {},
    },
  },
  lod: {
    labelPolicy: 'hover-selected-or-zoom',
    labelsSuppressedByBudget: false,
    edgesThinned: false,
    thinnedEdgeCount: 0,
    candidateEdgeCount: 0,
    visibleEdgeCount: 0,
    visibleNodeCount: 3,
    degradedReasons: [],
  },
  analysisOverlay: {
    status: 'idle',
    isStale: false,
    mode: null,
    confidence: null,
    badgeLabel: null,
    summary: null,
    detail: null,
    legendItems: [],
  },
  activeLayer: 'graph',
  renderConfig: {
    showFocusFade: true,
  } as GraphRenderModel['renderConfig'],
})

test('bypasses focus fade for explicit compare nodes and edges', () => {
  const model = createComparisonModel()

  assert.equal(
    shouldBypassCompareFocusFade({
      model,
      opMode: 'node',
      pubkeyOrSource: 'shared',
    }),
    true,
  )
  assert.equal(
    shouldBypassCompareFocusFade({
      model,
      opMode: 'edge',
      pubkeyOrSource: 'root',
      target: 'shared',
    }),
    true,
  )
  assert.equal(
    shouldBypassCompareFocusFade({
      model,
      opMode: 'node',
      pubkeyOrSource: 'unrelated',
    }),
    false,
  )
})

test('bypasses focus fade for secondary compare context aggregates', () => {
  const baseModel = createComparisonModel()
  const model: GraphRenderModel = {
    ...baseModel,
    nodes: [
      ...baseModel.nodes,
      {
        id: 'aggregate:compare-secondary-context:root|anchor',
        pubkey: 'aggregate:compare-secondary-context:root|anchor',
        displayLabel: '+2 otros',
        pictureUrl: null,
        position: [0, 3],
        radius: 18,
        visibleDegree: 0,
        keywordHits: 0,
        isRoot: false,
        isExpanded: false,
        isSelected: false,
        isCommonFollow: false,
        layoutRole: 'aggregate',
        ownerAnchorPubkeys: [],
        membershipSignature: 'compare-secondary-context-aggregate',
        sharedCount: 0,
        comparisonContextRole: 'compare-secondary-context-aggregate',
        isAggregate: true,
        aggregateCount: 2,
        source: 'follow',
        discoveredAt: null,
        sharedByExpandedCount: 0,
        fillColor: [0, 0, 0, 255],
        lineColor: [255, 255, 255, 255],
        bridgeHaloColor: null,
        analysisCommunityId: null,
      },
    ],
    lod: {
      ...baseModel.lod,
      visibleNodeCount: baseModel.lod.visibleNodeCount + 1,
    },
  }

  assert.equal(
    shouldBypassCompareFocusFade({
      model,
      opMode: 'node',
      pubkeyOrSource: 'aggregate:compare-secondary-context:root|anchor',
    }),
    true,
  )
})
