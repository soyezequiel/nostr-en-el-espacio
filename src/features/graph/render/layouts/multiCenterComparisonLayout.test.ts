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

test('fans root-owned and anchor-owned targets laterally in the root plus one expanded case', () => {
  const input = createLayoutInput({
    comparedNodePubkeys: new Set(['anchor-a']),
    activeComparisonAnchorPubkeys: ['anchor-a'],
    comparisonAnchorOrder: ['anchor-a'],
  })

  const extraOwnedNodes = [
    ['root-only-1', 10],
    ['root-only-2', 11],
    ['root-only-3', 12],
    ['root-only-4', 13],
    ['root-only-5', 14],
    ['anchor-only-1', 15],
    ['anchor-only-2', 16],
    ['anchor-only-3', 17],
    ['anchor-only-4', 18],
    ['anchor-only-5', 19],
  ] as const satisfies readonly (readonly [string, number])[]

  extraOwnedNodes.forEach(([pubkey, discoveredAt]) => {
    input.nodes[pubkey] = createNode(pubkey, { discoveredAt })
    input.visiblePubkeys.add(pubkey)
    input.radiiByPubkey.set(pubkey, 12)
  })

  input.links.push(
    { source: 'root', target: 'root-only-1', relation: 'follow' },
    { source: 'root', target: 'root-only-2', relation: 'follow' },
    { source: 'root', target: 'root-only-3', relation: 'follow' },
    { source: 'root', target: 'root-only-4', relation: 'follow' },
    { source: 'root', target: 'root-only-5', relation: 'follow' },
    { source: 'anchor-a', target: 'anchor-only-1', relation: 'follow' },
    { source: 'anchor-a', target: 'anchor-only-2', relation: 'follow' },
    { source: 'anchor-a', target: 'anchor-only-3', relation: 'follow' },
    { source: 'anchor-a', target: 'anchor-only-4', relation: 'follow' },
    { source: 'anchor-a', target: 'anchor-only-5', relation: 'follow' },
  )

  const result = runMultiCenterComparisonLayout(input)

  assert.ok(result)

  const rootPosition = result.positions.get('root')
  const anchorPosition = result.positions.get('anchor-a')
  const rootOwnedPositions = [
    'root-only-1',
    'root-only-2',
    'root-only-3',
    'root-only-4',
    'root-only-5',
  ].map((pubkey) => result.positions.get(pubkey))
  const anchorOwnedPositions = [
    'anchor-only-1',
    'anchor-only-2',
    'anchor-only-3',
    'anchor-only-4',
    'anchor-only-5',
  ].map((pubkey) => result.positions.get(pubkey))

  assert.ok(rootPosition)
  assert.ok(anchorPosition)
  assert.equal(rootOwnedPositions.every(Boolean), true)
  assert.equal(anchorOwnedPositions.every(Boolean), true)

  const rootOwnedXs = rootOwnedPositions.map((position) => position![0])
  const anchorOwnedXs = anchorOwnedPositions.map((position) => position![0])

  assert.ok(rootOwnedXs.every((x) => x < rootPosition[0] - 48))
  assert.ok(anchorOwnedXs.every((x) => x > anchorPosition[0] + 48))
  assert.ok(Math.max(...rootOwnedXs) - Math.min(...rootOwnedXs) > 180)
  assert.ok(Math.max(...anchorOwnedXs) - Math.min(...anchorOwnedXs) > 180)
})

test('fills a second expanded anchor when only one explicit compare anchor is set', () => {
  const result = runMultiCenterComparisonLayout(
    createLayoutInput({
      comparedNodePubkeys: new Set(['anchor-a']),
      activeComparisonAnchorPubkeys: ['anchor-a'],
      comparisonAnchorOrder: ['anchor-a', 'anchor-b'],
    }),
  )

  assert.ok(result)
  assert.deepEqual(result.activeAnchorPubkeys, ['root', 'anchor-a', 'anchor-b'])
  assert.deepEqual(
    result.snapshot.comparison?.activeAnchorPubkeys,
    ['root', 'anchor-a', 'anchor-b'],
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

test('partitions three-anchor subsets into stable semantic regions', () => {
  const input = createLayoutInput()

  input.nodes['exclusive-root'] = createNode('exclusive-root', { discoveredAt: 20 })
  input.nodes['shared-root-a'] = createNode('shared-root-a', { discoveredAt: 21 })
  input.nodes['shared-root-b'] = createNode('shared-root-b', { discoveredAt: 22 })
  input.nodes['shared-all'] = createNode('shared-all', { discoveredAt: 23 })
  input.visiblePubkeys.add('exclusive-root')
  input.visiblePubkeys.add('shared-root-a')
  input.visiblePubkeys.add('shared-root-b')
  input.visiblePubkeys.add('shared-all')
  input.links.push(
    { source: 'root', target: 'exclusive-root', relation: 'follow' },
    { source: 'root', target: 'shared-root-a', relation: 'follow' },
    { source: 'anchor-a', target: 'shared-root-a', relation: 'follow' },
    { source: 'root', target: 'shared-root-b', relation: 'follow' },
    { source: 'anchor-b', target: 'shared-root-b', relation: 'follow' },
    { source: 'root', target: 'shared-all', relation: 'follow' },
    { source: 'anchor-a', target: 'shared-all', relation: 'follow' },
    { source: 'anchor-b', target: 'shared-all', relation: 'follow' },
  )
  input.radiiByPubkey.set('exclusive-root', 12)
  input.radiiByPubkey.set('shared-root-a', 12)
  input.radiiByPubkey.set('shared-root-b', 12)
  input.radiiByPubkey.set('shared-all', 12)

  const result = runMultiCenterComparisonLayout(input)

  assert.ok(result)
  assert.deepEqual(result.activeAnchorPubkeys, ['root', 'anchor-a', 'anchor-b'])

  const rootPosition = result.positions.get('root')!
  const anchorAPosition = result.positions.get('anchor-a')!
  const anchorBPosition = result.positions.get('anchor-b')!
  const rootExclusivePosition = result.positions.get('exclusive-root')!
  const rootAnchorAPairPosition = result.positions.get('shared-root-a')!
  const rootAnchorBPairPosition = result.positions.get('shared-root-b')!
  const allSharedPosition = result.positions.get('shared-all')!

  assert.ok(rootPosition[0] < anchorAPosition[0])
  assert.ok(anchorAPosition[0] < anchorBPosition[0])

  assert.ok(rootExclusivePosition[0] < rootAnchorAPairPosition[0])
  assert.ok(rootAnchorAPairPosition[0] < anchorAPosition[0])
  assert.ok(rootAnchorAPairPosition[0] < allSharedPosition[0])
  assert.ok(allSharedPosition[0] < rootAnchorBPairPosition[0])
  assert.ok(rootAnchorBPairPosition[0] < anchorBPosition[0])

  assert.ok(allSharedPosition[1] < rootAnchorBPairPosition[1])
  assert.ok(allSharedPosition[1] < rootExclusivePosition[1])
})

test('does not cap three-anchor buckets by maxTargetsPerSignature', () => {
  const input = createLayoutInput({
    budgets: {
      maxActiveAnchors: 4,
      maxComparisonTargets: 16,
      maxTargetsPerSignature: 1,
    },
  })

  input.nodes['root-only-3a'] = createNode('root-only-3a', { discoveredAt: 40 })
  input.nodes['root-only-3b'] = createNode('root-only-3b', { discoveredAt: 41 })
  input.nodes['root-only-3c'] = createNode('root-only-3c', { discoveredAt: 42 })
  input.visiblePubkeys.add('root-only-3a')
  input.visiblePubkeys.add('root-only-3b')
  input.visiblePubkeys.add('root-only-3c')
  input.links.push(
    { source: 'root', target: 'root-only-3a', relation: 'follow' },
    { source: 'root', target: 'root-only-3b', relation: 'follow' },
    { source: 'root', target: 'root-only-3c', relation: 'follow' },
  )
  input.radiiByPubkey.set('root-only-3a', 12)
  input.radiiByPubkey.set('root-only-3b', 12)
  input.radiiByPubkey.set('root-only-3c', 12)

  const result = runMultiCenterComparisonLayout(input)

  assert.ok(result)

  const rootExclusiveCount = Array.from(result.memberships.entries()).filter(
    ([, membership]) =>
      membership.ownerAnchorPubkeys.length === 1 &&
      membership.ownerAnchorPubkeys[0] === 'root',
  ).length

  assert.ok(rootExclusiveCount >= 3)
})

test('partitions four-anchor subsets without falling back to the soft solver', () => {
  const input = createLayoutInput({
    comparedNodePubkeys: new Set(['anchor-a', 'anchor-b', 'anchor-c']),
    activeComparisonAnchorPubkeys: ['anchor-a', 'anchor-b', 'anchor-c'],
    comparisonAnchorOrder: ['anchor-a', 'anchor-b', 'anchor-c'],
  })

  input.nodes['exclusive-root-4'] = createNode('exclusive-root-4', { discoveredAt: 30 })
  input.nodes['exclusive-c'] = createNode('exclusive-c', { discoveredAt: 31 })
  input.nodes['shared-root-a-4'] = createNode('shared-root-a-4', { discoveredAt: 32 })
  input.nodes['shared-b-c-4'] = createNode('shared-b-c-4', { discoveredAt: 33 })
  input.nodes['shared-all-4'] = createNode('shared-all-4', { discoveredAt: 34 })
  input.visiblePubkeys.add('exclusive-root-4')
  input.visiblePubkeys.add('exclusive-c')
  input.visiblePubkeys.add('shared-root-a-4')
  input.visiblePubkeys.add('shared-b-c-4')
  input.visiblePubkeys.add('shared-all-4')
  input.links.push(
    { source: 'root', target: 'exclusive-root-4', relation: 'follow' },
    { source: 'anchor-c', target: 'exclusive-c', relation: 'follow' },
    { source: 'root', target: 'shared-root-a-4', relation: 'follow' },
    { source: 'anchor-a', target: 'shared-root-a-4', relation: 'follow' },
    { source: 'anchor-b', target: 'shared-b-c-4', relation: 'follow' },
    { source: 'anchor-c', target: 'shared-b-c-4', relation: 'follow' },
    { source: 'root', target: 'shared-all-4', relation: 'follow' },
    { source: 'anchor-a', target: 'shared-all-4', relation: 'follow' },
    { source: 'anchor-b', target: 'shared-all-4', relation: 'follow' },
    { source: 'anchor-c', target: 'shared-all-4', relation: 'follow' },
  )
  input.radiiByPubkey.set('exclusive-root-4', 12)
  input.radiiByPubkey.set('exclusive-c', 12)
  input.radiiByPubkey.set('shared-root-a-4', 12)
  input.radiiByPubkey.set('shared-b-c-4', 12)
  input.radiiByPubkey.set('shared-all-4', 12)

  const result = runMultiCenterComparisonLayout(input)

  assert.ok(result)
  assert.deepEqual(result.activeAnchorPubkeys, ['root', 'anchor-a', 'anchor-b', 'anchor-c'])

  const rootPosition = result.positions.get('root')!
  const anchorAPosition = result.positions.get('anchor-a')!
  const anchorBPosition = result.positions.get('anchor-b')!
  const anchorCPosition = result.positions.get('anchor-c')!
  const rootExclusivePosition = result.positions.get('exclusive-root-4')!
  const anchorCExclusivePosition = result.positions.get('exclusive-c')!
  const rootAnchorAPairPosition = result.positions.get('shared-root-a-4')!
  const anchorBAnchorCPairPosition = result.positions.get('shared-b-c-4')!
  const allSharedPosition = result.positions.get('shared-all-4')!

  assert.ok(rootPosition[0] < anchorAPosition[0])
  assert.ok(anchorAPosition[0] < anchorBPosition[0])
  assert.ok(anchorBPosition[0] < anchorCPosition[0])

  assert.ok(rootExclusivePosition[0] < rootAnchorAPairPosition[0])
  assert.ok(rootAnchorAPairPosition[0] < anchorAPosition[0])
  assert.ok(anchorBPosition[0] < anchorBAnchorCPairPosition[0])
  assert.ok(anchorBAnchorCPairPosition[0] < anchorCPosition[0])

  assert.ok(allSharedPosition[0] > rootPosition[0])
  assert.ok(allSharedPosition[0] < anchorCPosition[0])
  assert.ok(allSharedPosition[1] < rootExclusivePosition[1])
  assert.ok(allSharedPosition[1] < anchorCExclusivePosition[1])
})
