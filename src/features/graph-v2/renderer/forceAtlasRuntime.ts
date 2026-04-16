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
const BASE_SCALING_RATIO = 6
const DENSE_SCALING_RATIO = 15
const BASE_GRAVITY = 0.12
const DENSE_GRAVITY = 0.24
const BASE_SLOW_DOWN = 8
const DENSE_SLOW_DOWN = 18
const BASE_EDGE_WEIGHT_INFLUENCE = 1
const DENSE_EDGE_WEIGHT_INFLUENCE = 0.45
const BASE_BARNES_HUT_THETA = 0.55
const DENSE_BARNES_HUT_THETA = 0.82

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const interpolateNumber = (start: number, end: number, factor: number) =>
  start + (end - start) * factor

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
): ForceAtlas2Settings => {
  const denseFactor = resolveForceAtlasDenseFactor(graphOrder)
  const inferredSettings = forceAtlas2.inferSettings(graphOrder)

  return {
    ...inferredSettings,
    adjustSizes: true,
    edgeWeightInfluence: interpolateNumber(
      BASE_EDGE_WEIGHT_INFLUENCE,
      DENSE_EDGE_WEIGHT_INFLUENCE,
      denseFactor,
    ),
    // scalingRatio is ForceAtlas2's magnetic repulsion coefficient. Dense
    // graphs need a wider magnetic field or hub clusters collapse on release.
    scalingRatio: interpolateNumber(
      BASE_SCALING_RATIO,
      DENSE_SCALING_RATIO,
      denseFactor,
    ),
    // Gravity bounds the stronger repulsion so large graphs relax instead of
    // drifting outward forever.
    gravity: interpolateNumber(BASE_GRAVITY, DENSE_GRAVITY, denseFactor),
    // SlowDown controls per-tick displacement. Higher values keep release
    // inertia visible without letting dense layouts slingshot.
    slowDown: interpolateNumber(BASE_SLOW_DOWN, DENSE_SLOW_DOWN, denseFactor),
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

const createSettingsKey = (graphOrder: number) => {
  const denseBucket = Math.round(resolveForceAtlasDenseFactor(graphOrder) * 12)

  return [
    Math.floor(Math.log2(Math.max(graphOrder, 1))),
    graphOrder > 250,
    denseBucket,
  ].join('::')
}

export class ForceAtlasRuntime {
  private layout: ForceAtlasLayoutController | null = null

  private lastSettingsKey: string | null = null

  private suspended = false

  private layoutEligible = false

  public constructor(
    private readonly graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>,
    private readonly layoutFactory: (
      graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes>,
    ) => ForceAtlasLayoutController = (graph) =>
      new FA2LayoutSupervisor(graph, {
        settings: resolveForceAtlasSettings(graph.order),
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

    const settingsKey = createSettingsKey(this.graph.order)

    if (this.layout === null) {
      this.layout = this.createLayout()
      this.lastSettingsKey = settingsKey
      this.layout.start()
      return
    }

    if (this.lastSettingsKey !== settingsKey) {
      this.stop()
      this.kill()
      this.layout = this.createLayout()
      this.lastSettingsKey = settingsKey
      this.layout.start()
      return
    }

    if (!this.layout.isRunning()) {
      this.layout.start()
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
    this.lastSettingsKey = createSettingsKey(this.graph.order)
    this.layout.start()
  }

  public stop() {
    if (this.layout?.isRunning()) {
      this.layout.stop()
    }
  }

  public suspend() {
    this.suspended = true
    this.stop()
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
      this.lastSettingsKey = createSettingsKey(this.graph.order)
      this.layout.start()
      return
    }

    if (!this.layout.isRunning()) {
      this.layout.start()
    }
  }

  public isSuspended() {
    return this.suspended
  }

  public isRunning() {
    return this.layout?.isRunning() ?? false
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
    return this.layoutFactory(this.graph)
  }
}
