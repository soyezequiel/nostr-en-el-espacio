import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_DENSE_GRAPH_PHYSICS_CONFIG,
  createGraphPhysicsSimulation,
  type GraphPhysicsLink,
  type GraphPhysicsNode,
} from './graphPhysics'

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
  showFocusFade: true,
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

test('dense follow neighborhoods keep a meaningful lateral footprint after simulation', async () => {
  const nodes = [
    createNode({ id: 'root', x: 0, y: 0, radius: 24, isRoot: true }),
    ...Array.from({ length: 10 }, (_, index) =>
      createNode({
        id: `n-${index + 1}`,
        x: 12 + index * 2,
        y: 18 + index * 2,
      }),
    ),
  ]
  const links: GraphPhysicsLink[] = nodes
    .slice(1)
    .map((node) => ({
      id: `root-${node.id}`,
      source: 'root',
      target: node.id,
      relation: 'follow' as const,
    }))

  await runSimulation({ nodes, links, ticks: 60 })

  const nonRootXs = nodes.slice(1).map((node) => node.x)
  const lateralSpan = Math.max(...nonRootXs) - Math.min(...nonRootXs)

  assert.ok(lateralSpan > 220, `expected lateral span > 220, got ${lateralSpan}`)
})
