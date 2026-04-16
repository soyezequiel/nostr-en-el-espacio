import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PhysicsSimulationRuntime,
  resolveRuntimeLinkStrength,
  resolveRuntimePhysicsConfig,
} from './runtime'
import type {
  PhysicsTopologySnapshot,
  PhysicsWorkerEvent,
} from './types'

type RuntimeNode = {
  pubkey: string
  radius: number
  x?: number
  y?: number
}

type RuntimeHarness = {
  nodes: RuntimeNode[]
  status: string
  tick(): void
  stopTickLoop(): void
}

const createSnapshot = (): PhysicsTopologySnapshot => ({
  topologySignature: 'collision-smoke',
  activeLayer: 'graph',
  rootPubkey: 'root',
  nodes: [
    {
      pubkey: 'root',
      position: [0, 0],
      radius: 20,
      isRoot: true,
    },
    {
      pubkey: 'a',
      position: [0, 0],
      radius: 20,
      isRoot: false,
    },
    {
      pubkey: 'b',
      position: [0, 0],
      radius: 20,
      isRoot: false,
    },
  ],
  edges: [],
})

test('runtime physics scales magnetic repulsion and collision work for dense graphs', () => {
  const smallConfig = resolveRuntimePhysicsConfig(80)
  const denseConfig = resolveRuntimePhysicsConfig(2200)

  assert.equal(smallConfig.denseFactor, 0)
  assert.equal(denseConfig.denseFactor, 1)
  assert.ok(
    denseConfig.nBodyStrength < smallConfig.nBodyStrength,
    'expected dense graphs to use stronger magnetic repulsion',
  )
  assert.ok(
    denseConfig.nBodyDistanceMax > smallConfig.nBodyDistanceMax,
    'expected dense graphs to repel nodes over a wider radius',
  )
  assert.ok(
    denseConfig.collisionIterations > smallConfig.collisionIterations,
    'expected dense graphs to spend more work resolving contact',
  )
  assert.ok(
    denseConfig.centerGravityStrength < smallConfig.centerGravityStrength,
    'expected dense graphs to reduce inward compression',
  )
})

test('runtime physics softens link springs as graph density increases', () => {
  const smallConfig = resolveRuntimePhysicsConfig(80)
  const denseConfig = resolveRuntimePhysicsConfig(2200)

  assert.ok(
    resolveRuntimeLinkStrength('follow', denseConfig) <
      resolveRuntimeLinkStrength('follow', smallConfig),
  )
  assert.ok(
    resolveRuntimeLinkStrength('inbound', denseConfig) <
      resolveRuntimeLinkStrength('inbound', smallConfig),
  )
  assert.ok(
    resolveRuntimeLinkStrength('follow', denseConfig) >
      resolveRuntimeLinkStrength('zap', denseConfig),
  )
})

test('live physics runtime separates overlapping nodes with collision force', async () => {
  const events: PhysicsWorkerEvent[] = []
  const runtime = new PhysicsSimulationRuntime((event) => {
    events.push(event)
  })
  const runtimeHarness = runtime as unknown as RuntimeHarness

  try {
    runtime.handleMessage({
      type: 'SYNC_TOPOLOGY',
      payload: createSnapshot(),
    })

    runtimeHarness.stopTickLoop()

    for (let tick = 0; tick < 50; tick += 1) {
      runtimeHarness.tick()
    }

    const nodeA = runtimeHarness.nodes.find((node: RuntimeNode) => node.pubkey === 'a')
    const nodeB = runtimeHarness.nodes.find((node: RuntimeNode) => node.pubkey === 'b')

    assert.ok(nodeA, 'expected node a to exist in runtime state')
    assert.ok(nodeB, 'expected node b to exist in runtime state')

    const distance = Math.hypot(
      (nodeA.x ?? 0) - (nodeB.x ?? 0),
      (nodeA.y ?? 0) - (nodeB.y ?? 0),
    )

    assert.ok(
      distance >= nodeA.radius + nodeB.radius,
      `expected live runtime collision separation, got distance ${distance}`,
    )
    assert.ok(events.some((event) => event.type === 'FRAME'))
  } finally {
    runtime.handleMessage({ type: 'DISPOSE' })
  }
})

test('same-node topology changes softly reheat a frozen runtime so link tension applies again', () => {
  const runtime = new PhysicsSimulationRuntime(() => {})
  const runtimeHarness = runtime as unknown as RuntimeHarness

  const initialSnapshot: PhysicsTopologySnapshot = {
    topologySignature: 'freeze-baseline',
    activeLayer: 'graph',
    rootPubkey: 'root',
    nodes: [
      { pubkey: 'root', position: [0, 0], radius: 20, isRoot: true },
      { pubkey: 'a', position: [200, 0], radius: 20, isRoot: false },
      { pubkey: 'b', position: [-200, 0], radius: 20, isRoot: false },
    ],
    edges: [],
  }

  const linkedSnapshot: PhysicsTopologySnapshot = {
    ...initialSnapshot,
    topologySignature: 'freeze-with-link',
    edges: [
      {
        id: 'a-b',
        source: 'a',
        target: 'b',
        relation: 'follow',
      },
    ],
  }

  try {
    runtime.handleMessage({
      type: 'SYNC_TOPOLOGY',
      payload: initialSnapshot,
    })

    runtimeHarness.stopTickLoop()
    for (let tick = 0; tick < 120; tick += 1) {
      runtimeHarness.tick()
      if (runtimeHarness.status === 'frozen') {
        break
      }
    }

    assert.equal(runtimeHarness.status, 'frozen')

    const beforeSyncDistance = Math.hypot(
      (runtimeHarness.nodes[1]?.x ?? 0) - (runtimeHarness.nodes[2]?.x ?? 0),
      (runtimeHarness.nodes[1]?.y ?? 0) - (runtimeHarness.nodes[2]?.y ?? 0),
    )

    runtime.handleMessage({
      type: 'SYNC_TOPOLOGY',
      payload: linkedSnapshot,
    })

    assert.equal(runtimeHarness.status, 'running')

    runtimeHarness.stopTickLoop()
    runtimeHarness.tick()

    const afterSyncDistance = Math.hypot(
      (runtimeHarness.nodes[1]?.x ?? 0) - (runtimeHarness.nodes[2]?.x ?? 0),
      (runtimeHarness.nodes[1]?.y ?? 0) - (runtimeHarness.nodes[2]?.y ?? 0),
    )

    assert.notEqual(
      afterSyncDistance,
      beforeSyncDistance,
      'expected topology sync to wake the runtime and move linked neighbors',
    )
  } finally {
    runtime.handleMessage({ type: 'DISPOSE' })
  }
})

test('dragging a connected node propagates visible movement to its neighbors', () => {
  const runtime = new PhysicsSimulationRuntime(() => {})
  const runtimeHarness = runtime as unknown as RuntimeHarness

  const snapshot: PhysicsTopologySnapshot = {
    topologySignature: 'drag-propagation',
    activeLayer: 'graph',
    rootPubkey: null,
    nodes: [
      { pubkey: 'dragged', position: [220, 0], radius: 16, isRoot: false },
      { pubkey: 'a', position: [40, 0], radius: 12, isRoot: false },
      { pubkey: 'b', position: [-20, 30], radius: 12, isRoot: false },
      { pubkey: 'c', position: [-20, -30], radius: 12, isRoot: false },
    ],
    edges: [
      { id: 'dragged-a', source: 'dragged', target: 'a', relation: 'follow' },
      { id: 'dragged-b', source: 'dragged', target: 'b', relation: 'follow' },
      { id: 'dragged-c', source: 'dragged', target: 'c', relation: 'follow' },
    ],
  }

  try {
    runtime.handleMessage({
      type: 'SYNC_TOPOLOGY',
      payload: snapshot,
    })

    runtimeHarness.stopTickLoop()
    for (let tick = 0; tick < 30; tick += 1) {
      runtimeHarness.tick()
    }

    const before = runtimeHarness.nodes
      .filter((node) => node.pubkey !== 'dragged')
      .map((node) => ({ pubkey: node.pubkey, x: node.x ?? 0, y: node.y ?? 0 }))

    runtime.handleMessage({
      type: 'DRAG_START',
      payload: { pubkey: 'dragged', position: [640, 0] },
    })
    runtimeHarness.stopTickLoop()

    runtime.handleMessage({
      type: 'DRAG_MOVE',
      payload: { pubkey: 'dragged', position: [640, 0] },
    })
    runtimeHarness.stopTickLoop()

    const after = runtimeHarness.nodes
      .filter((node) => node.pubkey !== 'dragged')
      .map((node) => ({ pubkey: node.pubkey, x: node.x ?? 0, y: node.y ?? 0 }))

    const averageShift =
      after.reduce(
        (sum, node, index) =>
          sum +
          Math.hypot(node.x - before[index].x, node.y - before[index].y),
        0,
      ) / after.length

    assert.ok(
      averageShift >= 10,
      `expected drag tension to move connected neighbors, got average shift ${averageShift}`,
    )
  } finally {
    runtime.handleMessage({ type: 'DISPOSE' })
  }
})

test('released dragged node relaxes back toward its layout home position', () => {
  const runtime = new PhysicsSimulationRuntime(() => {})
  const runtimeHarness = runtime as unknown as RuntimeHarness

  const snapshot: PhysicsTopologySnapshot = {
    topologySignature: 'drag-release-home-return',
    activeLayer: 'graph',
    rootPubkey: null,
    nodes: [
      { pubkey: 'dragged', position: [500, 0], radius: 16, isRoot: false },
    ],
    edges: [],
  }

  try {
    runtime.handleMessage({
      type: 'SYNC_TOPOLOGY',
      payload: snapshot,
    })
    runtimeHarness.stopTickLoop()

    runtime.handleMessage({
      type: 'DRAG_START',
      payload: { pubkey: 'dragged', position: [0, 0] },
    })
    runtimeHarness.stopTickLoop()
    runtime.handleMessage({
      type: 'DRAG_END',
      payload: { pubkey: 'dragged' },
    })
    runtimeHarness.stopTickLoop()

    const beforeTicksX =
      runtimeHarness.nodes.find((node) => node.pubkey === 'dragged')?.x ?? 0

    for (let tick = 0; tick < 12; tick += 1) {
      runtimeHarness.tick()
    }

    const afterTicksX =
      runtimeHarness.nodes.find((node) => node.pubkey === 'dragged')?.x ?? 0

    assert.ok(
      afterTicksX > beforeTicksX + 20,
      `expected released node to return toward home x=500, got ${afterTicksX}`,
    )
  } finally {
    runtime.handleMessage({ type: 'DISPOSE' })
  }
})
