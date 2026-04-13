import assert from 'node:assert/strict'
import test from 'node:test'

import type { GraphLink, GraphNode } from '../../app/store/types'

import { runMultiCenterComparisonLayout } from './multiCenterComparisonLayout'

const createNode = (
  pubkey: string,
  overrides: Partial<GraphNode> = {},
): GraphNode => ({
  pubkey,
  keywordHits: 0,
  discoveredAt: null,
  source: pubkey === 'root' ? 'root' : 'follow',
  ...overrides,
})

const createLayoutInput = ({
  comparedNodePubkeys = new Set(['anchor-a', 'anchor-b']),
  activeComparisonAnchorPubkeys = ['anchor-a', 'anchor-b'],
  comparisonAnchorOrder = ['anchor-a', 'anchor-b'],
  budgets = {
    maxActiveAnchors: 4,
    maxComparisonTargets: 350,
    maxTargetsPerSignature: 24,
  },
}: {
  comparedNodePubkeys?: ReadonlySet<string>
  activeComparisonAnchorPubkeys?: readonly string[]
  comparisonAnchorOrder?: readonly string[]
  budgets?: {
    maxActiveAnchors: number
    maxComparisonTargets: number
    maxTargetsPerSignature: number
  }
} = {}) => {
  const nodes: Record<string, GraphNode> = {
    root: createNode('root'),
    'anchor-a': createNode('anchor-a', { discoveredAt: 1 }),
    'anchor-b': createNode('anchor-b', { discoveredAt: 2 }),
    'anchor-c': createNode('anchor-c', { discoveredAt: 3 }),
    'shared-ab': createNode('shared-ab', { discoveredAt: 4 }),
    'exclusive-a': createNode('exclusive-a', { discoveredAt: 5 }),
    'exclusive-b': createNode('exclusive-b', { discoveredAt: 6 }),
  }
  const visiblePubkeys = new Set(Object.keys(nodes))
  const expandedNodePubkeys = new Set(['anchor-a', 'anchor-b', 'anchor-c'])
  const links: GraphLink[] = [
    { source: 'root', target: 'anchor-a', relation: 'follow' },
    { source: 'root', target: 'anchor-b', relation: 'follow' },
    { source: 'root', target: 'anchor-c', relation: 'follow' },
    { source: 'anchor-a', target: 'shared-ab', relation: 'follow' },
    { source: 'anchor-b', target: 'shared-ab', relation: 'follow' },
    { source: 'anchor-a', target: 'exclusive-a', relation: 'follow' },
    { source: 'anchor-b', target: 'exclusive-b', relation: 'follow' },
  ]
  const radiiByPubkey = new Map(
    Object.keys(nodes).map((pubkey) => [pubkey, pubkey === 'root' ? 24 : 12]),
  )

  return {
    nodes,
    visiblePubkeys,
    links,
    rootNodePubkey: 'root',
    expandedNodePubkeys,
    comparedNodePubkeys,
    activeComparisonAnchorPubkeys,
    comparisonAnchorOrder,
    comparisonLayoutBudgets: budgets,
    previousPositions: undefined,
    previousLayoutSnapshot: null,
    radiiByPubkey,
    ticks: 40,
  } as const
}

test('positions shared targets between anchors and exclusive targets near their owner', () => {
  const result = runMultiCenterComparisonLayout(createLayoutInput())

  assert.ok(result)
  assert.deepEqual(result.activeAnchorPubkeys, ['root', 'anchor-a', 'anchor-b'])

  const rootPosition = result.positions.get('root')
  const anchorAPosition = result.positions.get('anchor-a')
  const anchorBPosition = result.positions.get('anchor-b')
  const sharedPosition = result.positions.get('shared-ab')
  const exclusiveAPosition = result.positions.get('exclusive-a')
  const sharedMembership = result.memberships.get('shared-ab')
  const exclusiveAMembership = result.memberships.get('exclusive-a')

  assert.ok(rootPosition)
  assert.ok(anchorAPosition)
  assert.ok(anchorBPosition)
  assert.ok(sharedPosition)
  assert.ok(exclusiveAPosition)
  assert.ok(sharedMembership)
  assert.ok(exclusiveAMembership)

  assert.equal(sharedMembership.sharedCount, 2)
  assert.deepEqual(sharedMembership.ownerAnchorPubkeys, ['anchor-a', 'anchor-b'])
  assert.equal(exclusiveAMembership.sharedCount, 1)
  assert.deepEqual(exclusiveAMembership.ownerAnchorPubkeys, ['anchor-a'])

  assert.ok(anchorAPosition[0] < anchorBPosition[0])
  assert.ok(sharedPosition[0] > anchorAPosition[0])
  assert.ok(sharedPosition[0] < anchorBPosition[0])

  const exclusiveAToOwner = Math.hypot(
    exclusiveAPosition[0] - anchorAPosition[0],
    exclusiveAPosition[1] - anchorAPosition[1],
  )
  const exclusiveAToOtherAnchor = Math.hypot(
    exclusiveAPosition[0] - anchorBPosition[0],
    exclusiveAPosition[1] - anchorBPosition[1],
  )

  assert.ok(exclusiveAToOwner < exclusiveAToOtherAnchor)
})

test('activates a bridge layout for a single active anchor instead of falling back to legacy', () => {
  const result = runMultiCenterComparisonLayout(
    createLayoutInput({
      comparedNodePubkeys: new Set(['anchor-a']),
      activeComparisonAnchorPubkeys: ['anchor-a'],
      comparisonAnchorOrder: ['anchor-a'],
    }),
  )

  assert.ok(result)
  assert.deepEqual(result.activeAnchorPubkeys, ['root', 'anchor-a'])

  const rootPosition = result.positions.get('root')
  const anchorPosition = result.positions.get('anchor-a')
  const exclusivePosition = result.positions.get('exclusive-a')

  assert.ok(rootPosition)
  assert.ok(anchorPosition)
  assert.ok(exclusivePosition)

  assert.ok(rootPosition[0] < anchorPosition[0])
  assert.ok(Math.abs(rootPosition[1] - anchorPosition[1]) < 160)
  assert.ok(exclusivePosition[1] > anchorPosition[1])
  assert.equal(
    result.snapshot.comparison?.activeAnchorPubkeys.length,
    2,
  )
})

test('caps explicit active anchors and records overflow deterministically', () => {
  const result = runMultiCenterComparisonLayout(
    createLayoutInput({
      comparedNodePubkeys: new Set(['anchor-a', 'anchor-b', 'anchor-c']),
      activeComparisonAnchorPubkeys: ['anchor-a', 'anchor-b', 'anchor-c'],
      comparisonAnchorOrder: ['anchor-a', 'anchor-b', 'anchor-c'],
      budgets: {
        maxActiveAnchors: 2,
        maxComparisonTargets: 350,
        maxTargetsPerSignature: 24,
      },
    }),
  )

  assert.ok(result)
  assert.deepEqual(result.activeAnchorPubkeys, ['root', 'anchor-a'])
  assert.deepEqual(result.overflowAnchorPubkeys, ['anchor-b', 'anchor-c'])
  assert.deepEqual(
    result.snapshot.comparison?.activeAnchorPubkeys,
    ['root', 'anchor-a'],
  )
  assert.deepEqual(
    result.snapshot.comparison?.overflowAnchorPubkeys,
    ['anchor-b', 'anchor-c'],
  )
})

test('does not cap two-anchor exclusive buckets by maxTargetsPerSignature', () => {
  const input = createLayoutInput({
    comparedNodePubkeys: new Set(['anchor-a']),
    activeComparisonAnchorPubkeys: ['anchor-a'],
    comparisonAnchorOrder: ['anchor-a'],
    budgets: {
      maxActiveAnchors: 4,
      maxComparisonTargets: 12,
      maxTargetsPerSignature: 1,
    },
  })

  input.nodes['root-only-1'] = createNode('root-only-1', { discoveredAt: 10 })
  input.nodes['root-only-2'] = createNode('root-only-2', { discoveredAt: 11 })
  input.nodes['root-only-3'] = createNode('root-only-3', { discoveredAt: 12 })
  input.visiblePubkeys.add('root-only-1')
  input.visiblePubkeys.add('root-only-2')
  input.visiblePubkeys.add('root-only-3')
  input.links.push(
    { source: 'root', target: 'root-only-1', relation: 'follow' },
    { source: 'root', target: 'root-only-2', relation: 'follow' },
    { source: 'root', target: 'root-only-3', relation: 'follow' },
  )
  input.radiiByPubkey.set('root-only-1', 12)
  input.radiiByPubkey.set('root-only-2', 12)
  input.radiiByPubkey.set('root-only-3', 12)

  const result = runMultiCenterComparisonLayout(input)

  assert.ok(result)

  const rootExclusiveCount = Array.from(result.memberships.entries()).filter(
    ([, membership]) =>
      membership.ownerAnchorPubkeys.length === 1 &&
      membership.ownerAnchorPubkeys[0] === 'root',
  ).length

  assert.ok(rootExclusiveCount >= 3)
})
