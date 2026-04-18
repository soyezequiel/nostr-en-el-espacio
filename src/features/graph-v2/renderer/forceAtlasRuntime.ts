import forceAtlas2 from 'graphology-layout-forceatlas2'
import type { ForceAtlas2Settings } from 'graphology-layout-forceatlas2'
import FA2LayoutSupervisor from 'graphology-layout-forceatlas2/worker'
import type Graph from 'graphology-types'

import type { GraphSceneSnapshot } from '@/features/graph-v2/renderer/contracts'
import type {
  SigmaEdgeAttributes,
  SigmaNodeAttributes,
} from '@/features/graph-v2/renderer/graphologyProjectionStore'

const MINIMUM_RUNNING_NODES = 2
const DENSE_GRAPH_START_NODE_COUNT = 160
const DENSE_GRAPH_FULL_NODE_COUNT = 2200
const OBSIDIAN_PHYSICS_PRESET_VERSION = 'obsidian-v2'
const BASE_SCALING_RATIO = 4.5
const DENSE_SCALING_RATIO = 9
const BASE_GRAVITY = 0.35
const DENSE_GRAVITY = 0.55
const BASE_SLOW_DOWN = 14
const DENSE_SLOW_DOWN = 22
const BASE_EDGE_WEIGHT_INFLUENCE = 1.25
const DENSE_EDGE_WEIGHT_INFLUENCE = 0.65
const BASE_BARNES_HUT_THETA = 0.55
const DENSE_BARNES_HUT_THETA = 0.82
const OVERLAP_SAMPLE_LIMIT = 600
// Convergence watcher: sample node positions periodically; once per-node
// average displacement stays below the threshold for several consecutive
// samples the FA2 worker is stopped, freezing the graph until something
// meaningful changes (new nodes, drag, reheat, settings change).
const STABILIZATION_SAMPLE_INTERVAL_MS = 400
const STABILIZATION_SAMPLE_NODE_LIMIT = 200
const STABILIZATION_AVG_DISPLACEMENT_THRESHOLD = 0.08
const STABILIZATION_CONSECUTIVE_QUIET_SAMPLES = 5
const STABILIZATION_MAX_RUN_MS = 20_000
const MIN_SCALING_RATIO = 0.5
const MAX_SCALING_RATIO = 72
const MIN_GRAVITY = 0.01
const MAX_GRAVITY = 1
const MIN_SLOW_DOWN = 1
const MAX_SLOW_DOWN = 60
const MIN_EDGE_WEIGHT_INFLUENCE = 0.05
const MAX_EDGE_WEIGHT_INFLUENCE = 3

export interface ForceAtlasPhysicsTuning {
  centripetalForce: number
  repulsionForce: number
  linkForce: number
  linkDistance: number
  damping: number
}

export const DEFAULT_FORCE_ATLAS_PHYSICS_TUNING: ForceAtlasPhysicsTuning = {
  centripetalForce: 1,
  repulsionForce: 2.5,
  linkForce: 1,
  linkDistance: 1,
  damping: 0.35,
}

export interface ForceAtlasPhysicsDiagnostics {
  presetVersion: string
  graphOrder: number
  graphSize: number
  settingsKey: string | null
  layoutEligible: boolean
  running: boolean
  suspended: boolean
  denseFactor: number
  tuning: ForceAtlasPhysicsTuning
  settings: ForceAtlas2Settings
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
    width: number
    height: number
  } | null
  averageEdgeLength: number | null
  sampledNodeCount: number
  approximateOverlapCount: number
}

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const interpolateNumber = (start: number, end: number, factor: number) =>
  start + (end - start) * factor

export const createForceAtlasPhysicsTuning = (
  tuning: Partial<ForceAtlasPhysicsTuning> = {},
): ForceAtlasPhysicsTuning => ({
  centripetalForce: clampNumber(
    tuning.centripetalForce ??
      DEFAULT_FORCE_ATLAS_PHYSICS_TUNING.centripetalForce,
    0.25,
    2.5,
  ),
  repulsionForce: clampNumber(
    tuning.repulsionForce ?? DEFAULT_FORCE_ATLAS_PHYSICS_TUNING.repulsionForce,
    0.25,
    5,
  ),
  linkForce: clampNumber(
    tuning.linkForce ?? DEFAULT_FORCE_ATLAS_PHYSICS_TUNING.linkForce,
    0.25,
    2.5,
  ),
  linkDistance: clampNumber(
    tuning.linkDistance ?? DEFAULT_FORCE_ATLAS_PHYSICS_TUNING.linkDistance,
    0.5,
    2,
  ),
  damping: clampNumber(
    tuning.damping ?? DEFAULT_FORCE_ATLAS_PHYSICS_TUNING.damping,
    0.25,
    2.5,
  ),
})

export const resolveForceAtlasDenseFactor = (graphOrder: number) =>
  clampNumber(
    (Math.sqrt(Math.max(0, graphOrder)) -
      Math.sqrt(DENSE_GRAPH_START_NODE_COUNT)) /
      (Math.sqrt(DENSE_GRAPH_FULL_NODE_COUNT) -
        Math.sqrt(DENSE_GRAPH_START_NODE_COUNT)),
    0,
    1,
  )

export const resolveForceAtlasSettings = (
  graphOrder: number,
  tuning: Partial<ForceAtlasPhysicsTuning> = DEFAULT_FORCE_ATLAS_PHYSICS_TUNING,
): ForceAtlas2Settings => {
  const denseFactor = resolveForceAtlasDenseFactor(graphOrder)
  const inferredSettings = forceAtlas2.inferSettings(graphOrder)
  const resolvedTuning = createForceAtlasPhysicsTuning(tuning)
  const distanceScale = Math.sqrt(resolvedTuning.linkDistance)

  return {
    ...inferredSettings,
    adjustSizes: true,
    edgeWeightInfluence: clampNumber(
      (interpolateNumber(
        BASE_EDGE_WEIGHT_INFLUENCE,
        DENSE_EDGE_WEIGHT_INFLUENCE,
        denseFactor,
      ) *
        resolvedTuning.linkForce) /
        distanceScale,
      MIN_EDGE_WEIGHT_INFLUENCE,
      MAX_EDGE_WEIGHT_INFLUENCE,
    ),
    // Obsidian's graph feel is link-dominated: repulsion should separate
    // nodes, not explode clusters. Dense graphs get only a smooth lift.
    scalingRatio: clampNumber(
      interpolateNumber(
        BASE_SCALING_RATIO,
        DENSE_SCALING_RATIO,
        denseFactor,
      ) *
        resolvedTuning.repulsionForce *
        distanceScale,
      MIN_SCALING_RATIO,
      MAX_SCALING_RATIO,
    ),
    // Centripetal pull keeps the moderate repulsion bounded so the graph
    // relaxes into a compact field instead of drifting outward forever.
    gravity: clampNumber(
      interpolateNumber(BASE_GRAVITY, DENSE_GRAVITY, denseFactor) *
        resolvedTuning.centripetalForce,
      MIN_GRAVITY,
      MAX_GRAVITY,
    ),
    // SlowDown is the damping knob. Higher dense values preserve controlled
    // inertia without letting hub clusters slingshot after release.
    slowDown: clampNumber(
      interpolateNumber(BASE_SLOW_DOWN, DENSE_SLOW_DOWN, denseFactor) *
        resolvedTuning.damping,
      MIN_SLOW_DOWN,
      MAX_SLOW_DOWN,
    ),
    barnesHutOptimize: graphOrder > 250,
    barnesHutTheta: interpolateNumber(
      BASE_BARNES_HUT_THETA,
      DENSE_BARNES_HUT_THETA,
      denseFactor,
    ),
    strongGravityMode: false,
  }
}

export interface ForceAtlasLayoutController {
  isRunning(): boolean
  start(): void
  stop(): void
  kill(): void
}

const createSettingsKey = (
  graphOrder: number,
  tuning: ForceAtlasPhysicsTuning,
) => {
  const denseBucket = Math.round(resolveForceAtlasDenseFactor(graphOrder) * 12)
  const tuningBuckets = [
    tuning.centripetalForce,
    tuning.repulsionForce,
    tuning.linkForce,
    tuning.linkDistance,
    tuning.damping,
  ].map((value) => Math.round(value * 100))

  return [
    OBSIDIAN_PHYSICS_PRESET_VERSION,
    Math.floor(Math.log2(Math.max(graphOrder, 1))),
    graphOrder > 250,
    denseBucket,
    ...tuningBuckets,
  ].join('::')
}

const createEmptyBounds = () => ({
  minX: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
})

const resolveGraphBounds = (
  graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>,
): ForceAtlasPhysicsDiagnostics['bounds'] => {
  if (graph.order === 0) {
    return null
  }

  const bounds = createEmptyBounds()

  for (const node of graph.nodes()) {
    const attributes = graph.getNodeAttributes(node)
    bounds.minX = Math.min(bounds.minX, attributes.x)
    bounds.maxX = Math.max(bounds.maxX, attributes.x)
    bounds.minY = Math.min(bounds.minY, attributes.y)
    bounds.maxY = Math.max(bounds.maxY, attributes.y)
  }

  return {
    ...bounds,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  }
}

const resolveAverageEdgeLength = (
  graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>,
) => {
  if (graph.size === 0) {
    return null
  }

  let totalLength = 0
  let measuredEdges = 0

  for (const edge of graph.edges()) {
    const source = graph.getNodeAttributes(graph.source(edge))
    const target = graph.getNodeAttributes(graph.target(edge))
    totalLength += Math.hypot(target.x - source.x, target.y - source.y)
    measuredEdges += 1
  }

  return measuredEdges > 0 ? totalLength / measuredEdges : null
}

const resolveApproximateOverlapCount = (
  graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>,
) => {
  const nodes = graph.nodes().slice(0, OVERLAP_SAMPLE_LIMIT)
  let overlapCount = 0

  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = graph.getNodeAttributes(nodes[leftIndex]!)

    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = graph.getNodeAttributes(nodes[rightIndex]!)
      const minimumDistance = (left.size + right.size) * 0.5

      if (Math.hypot(right.x - left.x, right.y - left.y) < minimumDistance) {
        overlapCount += 1
      }
    }
  }

  return {
    sampledNodeCount: nodes.length,
    approximateOverlapCount: overlapCount,
  }
}

export class ForceAtlasRuntime {
  private layout: ForceAtlasLayoutController | null = null

  private lastSettingsKey: string | null = null

  private suspended = false

  private layoutEligible = false

  private physicsTuning = DEFAULT_FORCE_ATLAS_PHYSICS_TUNING

  private stabilizationTimer: ReturnType<typeof setInterval> | null = null

  private stabilizationSample: Map<string, { x: number; y: number }> | null = null

  private stabilizationQuietSamples = 0

  private stabilizationStartedAt = 0

  public constructor(
    private readonly graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>,
    private readonly layoutFactory: (
      graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>,
      settings: ForceAtlas2Settings,
    ) => ForceAtlasLayoutController = (graph, settings) =>
      new FA2LayoutSupervisor(graph, {
        settings,
        getEdgeWeight: 'weight',
      }),
  ) {}

  public sync(scene: GraphSceneSnapshot) {
    const shouldRun =
      scene.nodes.length >= MINIMUM_RUNNING_NODES && scene.forceEdges.length > 0
    this.layoutEligible = shouldRun

    if (!shouldRun) {
      this.stop()
      return
    }

    if (this.suspended) {
      return
    }

    const settingsKey = createSettingsKey(this.graph.order, this.physicsTuning)

    if (this.layout === null) {
      this.layout = this.createLayout()
      this.lastSettingsKey = settingsKey
      this.layout.start()
      this.startStabilizationWatcher()
      return
    }

    if (this.lastSettingsKey !== settingsKey) {
      this.stop()
      this.kill()
      this.layout = this.createLayout()
      this.lastSettingsKey = settingsKey
      this.layout.start()
      this.startStabilizationWatcher()
      return
    }

    if (!this.layout.isRunning()) {
      this.layout.start()
      this.startStabilizationWatcher()
    } else {
      // New scene sync with existing running layout: reset the quiet
      // counter so newly-added nodes get time to settle before we stop.
      this.stabilizationQuietSamples = 0
    }
  }

  public reheat() {
    if (this.suspended) {
      return
    }

    if (!this.layoutEligible) {
      return
    }

    this.stop()
    this.kill()
    this.layout = this.createLayout()
    this.lastSettingsKey = createSettingsKey(this.graph.order, this.physicsTuning)
    this.layout.start()
    this.startStabilizationWatcher()
  }

  public setPhysicsTuning(tuning: Partial<ForceAtlasPhysicsTuning> = {}) {
    const nextTuning = createForceAtlasPhysicsTuning(tuning)
    const currentKey = createSettingsKey(this.graph.order, this.physicsTuning)
    const nextKey = createSettingsKey(this.graph.order, nextTuning)

    this.physicsTuning = nextTuning

    if (currentKey === nextKey) {
      return
    }

    if (!this.layoutEligible || this.suspended) {
      this.stop()
      this.kill()
      return
    }

    this.stop()
    this.kill()
    this.layout = this.createLayout()
    this.lastSettingsKey = nextKey
    this.layout.start()
    this.startStabilizationWatcher()
  }

  public stop() {
    if (this.layout?.isRunning()) {
      this.layout.stop()
    }
    this.stopStabilizationWatcher()
  }

  public suspend() {
    this.suspended = true
    this.stop()
    this.stopStabilizationWatcher()
  }

  public resume() {
    if (!this.suspended) {
      return
    }

    this.suspended = false

    if (!this.layoutEligible) {
      return
    }

    if (this.layout === null) {
      this.layout = this.createLayout()
      this.lastSettingsKey = createSettingsKey(this.graph.order, this.physicsTuning)
      this.layout.start()
      this.startStabilizationWatcher()
      return
    }

    if (!this.layout.isRunning()) {
      this.layout.start()
      this.startStabilizationWatcher()
    }
  }

  public isSuspended() {
    return this.suspended
  }

  public isRunning() {
    return this.layout?.isRunning() ?? false
  }

  public getDiagnostics(): ForceAtlasPhysicsDiagnostics {
    const overlap = resolveApproximateOverlapCount(this.graph)

    return {
      presetVersion: OBSIDIAN_PHYSICS_PRESET_VERSION,
      graphOrder: this.graph.order,
      graphSize: this.graph.size,
      settingsKey: this.lastSettingsKey,
      layoutEligible: this.layoutEligible,
      running: this.isRunning(),
      suspended: this.suspended,
      denseFactor: resolveForceAtlasDenseFactor(this.graph.order),
      tuning: this.physicsTuning,
      settings: resolveForceAtlasSettings(this.graph.order, this.physicsTuning),
      bounds: resolveGraphBounds(this.graph),
      averageEdgeLength: resolveAverageEdgeLength(this.graph),
      ...overlap,
    }
  }

  public kill() {
    this.layout?.kill()
    this.layout = null
    this.lastSettingsKey = null
  }

  public dispose() {
    this.stop()
    this.kill()
  }

  private createLayout() {
    return this.layoutFactory(
      this.graph,
      resolveForceAtlasSettings(this.graph.order, this.physicsTuning),
    )
  }

  private startStabilizationWatcher() {
    if (typeof window === 'undefined') return
    this.stopStabilizationWatcher()
    this.stabilizationSample = this.snapshotStabilizationSample()
    this.stabilizationQuietSamples = 0
    this.stabilizationStartedAt = Date.now()
    this.stabilizationTimer = setInterval(
      () => this.evaluateStabilization(),
      STABILIZATION_SAMPLE_INTERVAL_MS,
    )
  }

  private stopStabilizationWatcher() {
    if (this.stabilizationTimer !== null) {
      clearInterval(this.stabilizationTimer)
      this.stabilizationTimer = null
    }
    this.stabilizationSample = null
    this.stabilizationQuietSamples = 0
  }

  private snapshotStabilizationSample() {
    const sample = new Map<string, { x: number; y: number }>()
    let count = 0
    for (const node of this.graph.nodes()) {
      if (count >= STABILIZATION_SAMPLE_NODE_LIMIT) break
      const attrs = this.graph.getNodeAttributes(node)
      sample.set(node, { x: attrs.x, y: attrs.y })
      count += 1
    }
    return sample
  }

  private evaluateStabilization() {
    if (!this.layout || !this.layout.isRunning() || this.suspended) {
      this.stopStabilizationWatcher()
      return
    }

    const previous = this.stabilizationSample
    const current = this.snapshotStabilizationSample()

    // Hard cap to avoid pathological oscillation eating CPU forever.
    if (Date.now() - this.stabilizationStartedAt > STABILIZATION_MAX_RUN_MS) {
      this.stop()
      this.stopStabilizationWatcher()
      return
    }

    if (!previous || current.size === 0) {
      this.stabilizationSample = current
      return
    }

    let totalDisplacement = 0
    let measured = 0
    for (const [node, pos] of current) {
      const prev = previous.get(node)
      if (!prev) continue
      totalDisplacement += Math.hypot(pos.x - prev.x, pos.y - prev.y)
      measured += 1
    }

    this.stabilizationSample = current

    if (measured === 0) return

    const averageDisplacement = totalDisplacement / measured

    if (averageDisplacement < STABILIZATION_AVG_DISPLACEMENT_THRESHOLD) {
      this.stabilizationQuietSamples += 1
      if (
        this.stabilizationQuietSamples >= STABILIZATION_CONSECUTIVE_QUIET_SAMPLES
      ) {
        this.stop()
        this.stopStabilizationWatcher()
      }
    } else {
      this.stabilizationQuietSamples = 0
    }
  }
}
