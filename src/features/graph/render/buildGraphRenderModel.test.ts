import assert from 'node:assert/strict'
import test from 'node:test'

import type { GraphLink } from '../app/store/types'
import type { BuildGraphRenderModelInput } from './types'
import { buildGraphRenderModel } from './buildGraphRenderModel'

const DEFAULT_RENDER_CONFIG: BuildGraphRenderModelInput['renderConfig'] = {
  edgeThickness: 1,
  edgeOpacity: 1,
  arrowType: 'triangle',
  nodeSpacingFactor: 1.25,
  nodeSizeFactor: 0.88,
  autoSizeNodes: false,
  imageQualityMode: 'adaptive',
  avatarHdZoomThreshold: 1.8,
  avatarFullHdZoomThreshold: 2.8,
  showDiscoveryState: true,
  showSharedEmphasis: true,
  showAvatarQualityGuide: false,
  showImageResidencyDebug: false,
  edgeColor: '#94a3b8',
  mutualEdgeColor: '#2dd4bf',
  colorProfile: 'monochrome',
  showFocusFade: true,
}

const DEFAULT_EFFECTIVE_GRAPH_CAPS: BuildGraphRenderModelInput['effectiveGraphCaps'] = {
  maxNodes: 2200,
  coldStartLayoutTicks: 50,
  warmStartLayoutTicks: 20,
}

const createSingleAnchorComparisonInput = (): BuildGraphRenderModelInput => ({
  nodes: {
    root: {
      pubkey: 'root',
      label: 'Root',
      keywordHits: 0,
      discoveredAt: 0,
      source: 'root',
    },
    anchor: {
      pubkey: 'anchor',
      label: 'Anchor',
      keywordHits: 0,
      discoveredAt: 1,
      source: 'follow',
    },
    owned: {
      pubkey: 'owned',
      label: 'Owned',
      keywordHits: 0,
      discoveredAt: 2,
      source: 'follow',
    },
    shared: {
      pubkey: 'shared',
      label: 'Shared',
      keywordHits: 0,
      discoveredAt: 3,
      source: 'follow',
    },
    'context-a': {
      pubkey: 'context-a',
      label: 'Context A',
      keywordHits: 0,
      discoveredAt: 4,
      source: 'follow',
    },
    'context-b': {
      pubkey: 'context-b',
      label: 'Context B',
      keywordHits: 0,
      discoveredAt: 5,
      source: 'follow',
    },
  },
  links: [
    { source: 'root', target: 'anchor', relation: 'follow' },
    { source: 'anchor', target: 'owned', relation: 'follow' },
    { source: 'root', target: 'shared', relation: 'follow' },
    { source: 'anchor', target: 'shared', relation: 'follow' },
    { source: 'root', target: 'context-a', relation: 'follow' },
    { source: 'root', target: 'context-b', relation: 'follow' },
  ],
  inboundLinks: [],
  connectionsLinks: [],
  zapEdges: [],
  activeLayer: 'graph',
  connectionsSourceLayer: 'graph',
  rootNodePubkey: 'root',
  selectedNodePubkey: null,
  expandedNodePubkeys: new Set(['anchor']),
  comparedNodePubkeys: new Set(),
  activeComparisonAnchorPubkeys: [],
  expandedAggregateNodeIds: [],
  comparisonAnchorOrder: ['anchor'],
  layoutMode: 'multi-center-comparison',
  comparisonLayoutBudgets: {
    maxActiveAnchors: 4,
    maxComparisonTargets: 350,
    maxTargetsPerSignature: 24,
  },
  effectiveGraphCaps: DEFAULT_EFFECTIVE_GRAPH_CAPS,
  renderConfig: DEFAULT_RENDER_CONFIG,
})

const createTwoAnchorComparisonWithSecondaryContextInput =
  (): BuildGraphRenderModelInput => ({
    ...createSingleAnchorComparisonInput(),
    nodes: {
      ...createSingleAnchorComparisonInput().nodes,
      'outsider-a': {
        pubkey: 'outsider-a',
        label: 'Outsider A',
        keywordHits: 0,
        discoveredAt: 6,
        source: 'follow',
      },
      'outsider-b': {
        pubkey: 'outsider-b',
        label: 'Outsider B',
        keywordHits: 0,
        discoveredAt: 7,
        source: 'follow',
      },
      orphan: {
        pubkey: 'orphan',
        label: 'Orphan',
        keywordHits: 0,
        discoveredAt: 8,
        source: 'follow',
      },
    },
    links: [
      ...createSingleAnchorComparisonInput().links,
      { source: 'outsider-a', target: 'outsider-b', relation: 'follow' },
    ],
  })

test('root plus one expanded node becomes a two-anchor outgoing comparison', async () => {
  const model = await buildGraphRenderModel({
    ...createSingleAnchorComparisonInput(),
  })

  assert.equal(model.layoutMode, 'multi-center-comparison')
  assert.deepEqual(model.nodes.map((node) => node.pubkey).sort(), [
    'anchor',
    'context-a',
    'context-b',
    'owned',
    'root',
    'shared',
  ])
  assert.equal(model.nodes.some((node) => node.isAggregate === true), false)
  const rootNode = model.nodes.find((node) => node.pubkey === 'root')
  const anchorNode = model.nodes.find((node) => node.pubkey === 'anchor')
  const sharedNode = model.nodes.find((node) => node.pubkey === 'shared')
  const rootOnlyNodes = model.nodes.filter((node) =>
    ['context-a', 'context-b'].includes(node.pubkey),
  )
  const anchorOnlyNode = model.nodes.find((node) => node.pubkey === 'owned')
  assert.ok(rootNode)
  assert.ok(anchorNode)
  assert.ok(sharedNode)
  assert.ok(anchorOnlyNode)
  assert.equal(anchorNode.layoutRole, 'anchor')
  assert.equal(sharedNode.sharedCount, 2)
  assert.deepEqual(sharedNode.ownerAnchorPubkeys, ['anchor', 'root'])
  assert.ok(sharedNode.position[0] > rootNode.position[0])
  assert.ok(sharedNode.position[0] < anchorNode.position[0])
  assert.equal(rootOnlyNodes.every((node) => node.sharedCount === 1), true)
  assert.equal(
    rootOnlyNodes.every((node) => node.ownerAnchorPubkeys[0] === 'root'),
    true,
  )
  assert.equal(anchorOnlyNode.ownerAnchorPubkeys[0], 'anchor')
  assert.deepEqual(
    model.edges.map((edge) => edge.id).sort(),
    [
      'anchor->owned:follow',
      'anchor->shared:follow',
      'root->anchor:follow',
      'root->context-a:follow',
      'root->context-b:follow',
      'root->shared:follow',
    ],
  )
})

test('root-only and shared follows stay explicit instead of collapsing into a root-context aggregate', async () => {
  const model = await buildGraphRenderModel({
    ...createSingleAnchorComparisonInput(),
  })

  assert.equal(model.nodes.some((node) => node.isAggregate === true), false)
  assert.equal(
    model.nodes.filter((node) => node.ownerAnchorPubkeys.includes('root')).length,
    3,
  )
  assert.equal(
    model.nodes.filter((node) => node.ownerAnchorPubkeys.includes('anchor')).length,
    3,
  )
})

test('exports widened compare bounds for the root plus one expanded layout', async () => {
  const input = createSingleAnchorComparisonInput()

  input.nodes['root-only-1'] = {
    pubkey: 'root-only-1',
    label: 'Root Only 1',
    keywordHits: 0,
    discoveredAt: 10,
    source: 'follow',
  }
  input.nodes['root-only-2'] = {
    pubkey: 'root-only-2',
    label: 'Root Only 2',
    keywordHits: 0,
    discoveredAt: 11,
    source: 'follow',
  }
  input.nodes['anchor-only-1'] = {
    pubkey: 'anchor-only-1',
    label: 'Anchor Only 1',
    keywordHits: 0,
    discoveredAt: 12,
    source: 'follow',
  }
  input.nodes['anchor-only-2'] = {
    pubkey: 'anchor-only-2',
    label: 'Anchor Only 2',
    keywordHits: 0,
    discoveredAt: 13,
    source: 'follow',
  }
  input.links = [
    ...input.links,
    { source: 'root', target: 'root-only-1', relation: 'follow' },
    { source: 'root', target: 'root-only-2', relation: 'follow' },
    { source: 'anchor', target: 'anchor-only-1', relation: 'follow' },
    { source: 'anchor', target: 'anchor-only-2', relation: 'follow' },
  ]

  const model = await buildGraphRenderModel(input)
  const rawNodeMinX = Math.min(
    ...model.nodes.map((node) => node.position[0] - node.radius),
  )
  const rawNodeMaxX = Math.max(
    ...model.nodes.map((node) => node.position[0] + node.radius),
  )

  assert.ok(model.bounds.minX < rawNodeMinX)
  assert.ok(model.bounds.maxX > rawNodeMaxX)
  assert.ok(model.bounds.maxX - model.bounds.minX > 700)
})

test('no aggregate is created when root follows only the anchor-owned target', async () => {
  const input = createSingleAnchorComparisonInput()
  const model = await buildGraphRenderModel({
    ...input,
    nodes: {
      root: input.nodes.root,
      anchor: input.nodes.anchor,
      owned: input.nodes.owned,
      shared: input.nodes.shared,
    },
    links: [
      { source: 'root', target: 'anchor', relation: 'follow' },
      { source: 'anchor', target: 'owned', relation: 'follow' },
      { source: 'root', target: 'owned', relation: 'follow' },
    ],
  })

  assert.deepEqual(model.nodes.map((node) => node.pubkey).sort(), [
    'anchor',
    'owned',
    'root',
  ])
  assert.equal(model.nodes.some((node) => node.isAggregate === true), false)
  assert.deepEqual(
    model.edges.map((edge) => edge.id).sort(),
    ['anchor->owned:follow', 'root->anchor:follow', 'root->owned:follow'],
  )
})

test('non-compared visible nodes collapse into a secondary compare aggregate', async () => {
  const model = await buildGraphRenderModel({
    ...createTwoAnchorComparisonWithSecondaryContextInput(),
  })

  const aggregateNode = model.nodes.find(
    (node) => node.comparisonContextRole === 'compare-secondary-context-aggregate',
  )

  assert.ok(aggregateNode)
  assert.equal(aggregateNode.isAggregate, true)
  assert.equal(aggregateNode.aggregateCount, 3)
  assert.equal(
    model.nodes.some((node) => node.pubkey === 'outsider-a'),
    false,
  )
  assert.equal(
    model.nodes.some((node) => node.pubkey === 'outsider-b'),
    false,
  )
  assert.equal(model.nodes.some((node) => node.pubkey === 'orphan'), false)
})

test('expanding the secondary compare aggregate reveals the other visible nodes', async () => {
  const aggregateId = 'aggregate:compare-secondary-context:root|anchor'
  const model = await buildGraphRenderModel({
    ...createTwoAnchorComparisonWithSecondaryContextInput(),
    expandedAggregateNodeIds: [aggregateId],
  })

  const outsiderNodes = model.nodes.filter(
    (node) => node.comparisonContextRole === 'compare-secondary-context',
  )

  assert.deepEqual(
    outsiderNodes.map((node) => node.pubkey).sort(),
    ['orphan', 'outsider-a', 'outsider-b'],
  )
  assert.equal(
    model.nodes.some(
      (node) =>
        node.comparisonContextRole === 'compare-secondary-context-aggregate',
    ),
    false,
  )
})

test('collapses dense membership signatures into expandable aggregates for many anchors', async () => {
  const nodes: BuildGraphRenderModelInput['nodes'] = {
    root: {
      pubkey: 'root',
      label: 'Root',
      keywordHits: 0,
      discoveredAt: 0,
      source: 'root',
    },
    'anchor-a': {
      pubkey: 'anchor-a',
      label: 'Anchor A',
      keywordHits: 0,
      discoveredAt: 1,
      source: 'follow',
    },
    'anchor-b': {
      pubkey: 'anchor-b',
      label: 'Anchor B',
      keywordHits: 0,
      discoveredAt: 2,
      source: 'follow',
    },
    'anchor-c': {
      pubkey: 'anchor-c',
      label: 'Anchor C',
      keywordHits: 0,
      discoveredAt: 3,
      source: 'follow',
    },
  }
  const links: GraphLink[] = [
    { source: 'root', target: 'anchor-a', relation: 'follow' },
    { source: 'root', target: 'anchor-b', relation: 'follow' },
    { source: 'root', target: 'anchor-c', relation: 'follow' },
  ]

  for (let index = 0; index < 12; index += 1) {
    const pubkey = `shared-root-a-${index}`
    nodes[pubkey] = {
      pubkey,
      label: `Shared ${index}`,
      keywordHits: 0,
      discoveredAt: 10 + index,
      source: 'follow',
    }
    links.push(
      { source: 'root', target: pubkey, relation: 'follow' },
      { source: 'anchor-a', target: pubkey, relation: 'follow' },
    )
  }

  const baseInput: BuildGraphRenderModelInput = {
    nodes,
    links,
    inboundLinks: [],
    connectionsLinks: [],
    zapEdges: [],
    activeLayer: 'graph',
    connectionsSourceLayer: 'graph',
    rootNodePubkey: 'root',
    selectedNodePubkey: null,
    expandedNodePubkeys: new Set(['anchor-a', 'anchor-b', 'anchor-c']),
    comparedNodePubkeys: new Set(['anchor-a', 'anchor-b', 'anchor-c']),
    activeComparisonAnchorPubkeys: ['anchor-a', 'anchor-b', 'anchor-c'],
    expandedAggregateNodeIds: [],
    comparisonAnchorOrder: ['anchor-a', 'anchor-b', 'anchor-c'],
    layoutMode: 'multi-center-comparison',
    comparisonLayoutBudgets: {
      maxActiveAnchors: 4,
      maxComparisonTargets: 350,
      maxTargetsPerSignature: 24,
    },
    effectiveGraphCaps: DEFAULT_EFFECTIVE_GRAPH_CAPS,
    renderConfig: DEFAULT_RENDER_CONFIG,
  }

  const collapsedModel = await buildGraphRenderModel(baseInput)
  const signatureAggregate = collapsedModel.nodes.find(
    (node) => node.comparisonContextRole === 'compare-signature-aggregate',
  )

  assert.ok(signatureAggregate)
  assert.equal(signatureAggregate.isAggregate, true)
  assert.equal(signatureAggregate.aggregateCount, 4)
  assert.equal(
    collapsedModel.edges.some(
      (edge) =>
        edge.target === signatureAggregate.pubkey &&
        edge.comparisonRole === 'compare-signature-aggregate',
    ),
    true,
  )

  const expandedModel = await buildGraphRenderModel({
    ...baseInput,
    expandedAggregateNodeIds: ['aggregate:compare-signature:anchor-a|root'],
  })

  assert.equal(
    expandedModel.nodes.some(
      (node) => node.comparisonContextRole === 'compare-signature-aggregate',
    ),
    false,
  )
  assert.equal(
    expandedModel.nodes.filter((node) =>
      node.membershipSignature === 'anchor-a|root',
    ).length >= 12,
    true,
  )
})
