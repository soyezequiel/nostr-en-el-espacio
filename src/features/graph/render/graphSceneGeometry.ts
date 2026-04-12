import {
  GRAPH_CURVED_EDGE_OFFSET_FACTOR,
  GRAPH_CURVED_EDGE_OFFSET_MAX,
  GRAPH_CURVED_EDGE_OFFSET_MIN,
  GRAPH_CURVED_EDGE_SAMPLE_STEPS,
} from '@/features/graph/render/constants'
import type { GraphRenderEdge } from '@/features/graph/render/types'

type Point = [number, number]

export type GraphVisualRelation = GraphRenderEdge['relation'] | 'mutual'

export type GraphEdgeSegment = {
  id: string
  source: string
  target: string
  sourcePosition: Point
  targetPosition: Point
  relation: GraphVisualRelation
  weight: number
  isPriority: boolean
  targetSharedByExpandedCount: number
  progressStart: number
  progressEnd: number
  isBidirectional?: boolean
}

type GraphVisualEdge = {
  id: string
  source: string
  target: string
  sourcePosition: Point
  targetPosition: Point
  sourceRadius: number
  targetRadius: number
  relation: GraphVisualRelation
  weight: number
  isPriority: boolean
  targetSharedByExpandedCount: number
  isBidirectional?: boolean
}

type EdgeEndpoints = {
  sourcePosition: Point
  targetPosition: Point
}

type EdgeEndpointInput = {
  sourcePosition: Point
  targetPosition: Point
  sourceRadius: number
  targetRadius: number
}

const EDGE_SOURCE_PADDING_PX = 3
const EDGE_TARGET_PADDING_PX = 2

const compareEdgesById = <T extends { id: string }>(left: T, right: T) =>
  left.id.localeCompare(right.id)

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const graphSceneGeometryCache = new Map<
  string,
  {
    segments: GraphEdgeSegment[]
  }
>()

const adjustEdgeEndpoint = ({
  from,
  to,
  padding,
}: {
  from: Point
  to: Point
  padding: number
}): Point => {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy)

  if (length === 0) {
    return to
  }

  return [to[0] - (dx / length) * padding, to[1] - (dy / length) * padding]
}

const getEdgeEndpoints = (edge: EdgeEndpointInput): EdgeEndpoints => ({
  sourcePosition: adjustEdgeEndpoint({
    from: edge.targetPosition,
    to: edge.sourcePosition,
    padding: edge.sourceRadius + EDGE_SOURCE_PADDING_PX,
  }),
  targetPosition: adjustEdgeEndpoint({
    from: edge.sourcePosition,
    to: edge.targetPosition,
    padding: edge.targetRadius + EDGE_TARGET_PADDING_PX,
  }),
})

export const createGraphSceneGeometrySignature = (
  edges: readonly GraphRenderEdge[],
) => {
  let hash = 2166136261

  const feedString = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
  }

  const feedNumber = (value: number) => {
    feedString(Number.isFinite(value) ? value.toString() : 'NaN')
  }

  for (const edge of edges) {
    feedString(edge.id)
    feedString(edge.source)
    feedString(edge.target)
    feedString(edge.relation)
    feedNumber(edge.weight)
    feedNumber(edge.sourcePosition[0])
    feedNumber(edge.sourcePosition[1])
    feedNumber(edge.targetPosition[0])
    feedNumber(edge.targetPosition[1])
    feedNumber(edge.sourceRadius)
    feedNumber(edge.targetRadius)
    feedNumber(edge.targetSharedByExpandedCount)
    feedString(edge.isPriority ? '1' : '0')
  }

  return `${edges.length}e:v4:${(hash >>> 0).toString(36)}`
}

const createDirectedPairKey = (source: string, target: string) =>
  `${source}->${target}`

const createUndirectedPairKey = (source: string, target: string) =>
  source.localeCompare(target) <= 0 ? `${source}:${target}` : `${target}:${source}`

const createMutualVisualEdgeId = (source: string, target: string) =>
  `pair:${source}:${target}:mutual`

const VISUAL_RELATION_PRECEDENCE: Record<GraphRenderEdge['relation'], number> = {
  follow: 3,
  inbound: 2,
  zap: 1,
}

const sampleQuadraticBezierPath = ({
  start,
  control,
  end,
}: {
  start: Point
  control: Point
  end: Point
}): Point[] =>
  Array.from({ length: GRAPH_CURVED_EDGE_SAMPLE_STEPS + 1 }, (_, step) => {
    const t = step / GRAPH_CURVED_EDGE_SAMPLE_STEPS
    const inverseT = 1 - t

    return [
      inverseT * inverseT * start[0] +
        2 * inverseT * t * control[0] +
        t * t * end[0],
      inverseT * inverseT * start[1] +
        2 * inverseT * t * control[1] +
        t * t * end[1],
    ]
  })

const buildSegmentsFromPath = (
  edge: GraphVisualEdge,
  path: Point[],
): GraphEdgeSegment[] => {
  const segments: GraphEdgeSegment[] = []
  const segmentCount = path.length - 1

  for (let index = 0; index < segmentCount; index++) {
    segments.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourcePosition: path[index],
      targetPosition: path[index + 1],
      relation: edge.relation,
      weight: edge.weight,
      isPriority: edge.isPriority,
      targetSharedByExpandedCount: edge.targetSharedByExpandedCount,
      progressStart: index / segmentCount,
      progressEnd: (index + 1) / segmentCount,
      isBidirectional: edge.isBidirectional ?? false,
    })
  }

  return segments
}

const buildCurvedEdgeSegments = (
  edge: GraphVisualEdge,
  laneOffset: number,
): GraphEdgeSegment[] | null => {
  const { sourcePosition, targetPosition } = getEdgeEndpoints(edge)
  const dx = targetPosition[0] - sourcePosition[0]
  const dy = targetPosition[1] - sourcePosition[1]
  const length = Math.hypot(dx, dy)

  if (length === 0) {
    return null
  }

  const normalX = -dy / length
  const normalY = dx / length
  const offsetStep = clampNumber(
    length * GRAPH_CURVED_EDGE_OFFSET_FACTOR,
    GRAPH_CURVED_EDGE_OFFSET_MIN,
    GRAPH_CURVED_EDGE_OFFSET_MAX,
  )
  const control: Point = [
    (sourcePosition[0] + targetPosition[0]) / 2 +
      normalX * laneOffset * offsetStep,
    (sourcePosition[1] + targetPosition[1]) / 2 +
      normalY * laneOffset * offsetStep,
  ]

  const path = sampleQuadraticBezierPath({
    start: sourcePosition,
    control,
    end: targetPosition,
  })

  return buildSegmentsFromPath(edge, path)
}

const resolveOpposingFollowLaneOffset = (edge: GraphRenderEdge) =>
  edge.source.localeCompare(edge.target) <= 0 ? -0.8 : 0.8

const buildStraightEdgeSegments = (edge: GraphVisualEdge): GraphEdgeSegment[] => {
  const { sourcePosition, targetPosition } = getEdgeEndpoints(edge)
  const path = Array.from({ length: GRAPH_CURVED_EDGE_SAMPLE_STEPS + 1 }, (_, step) => {
    const t = step / GRAPH_CURVED_EDGE_SAMPLE_STEPS
    return [
      sourcePosition[0] * (1 - t) + targetPosition[0] * t,
      sourcePosition[1] * (1 - t) + targetPosition[1] * t,
    ] as Point
  })

  return buildSegmentsFromPath(edge, path)
}

const compareEdgesByVisualPriority = (
  left: GraphRenderEdge,
  right: GraphRenderEdge,
) => {
  const precedenceDelta =
    VISUAL_RELATION_PRECEDENCE[right.relation] -
    VISUAL_RELATION_PRECEDENCE[left.relation]

  if (precedenceDelta !== 0) {
    return precedenceDelta
  }

  if (left.isPriority !== right.isPriority) {
    return left.isPriority ? -1 : 1
  }

  if (left.relation === 'zap' || right.relation === 'zap') {
    const weightDelta = right.weight - left.weight
    if (weightDelta !== 0) {
      return weightDelta
    }
  }

  return compareEdgesById(left, right)
}

const pickRepresentativeEdge = (edges: readonly GraphRenderEdge[]) =>
  [...edges].sort(compareEdgesByVisualPriority)[0]

const buildDirectedVisualEdge = (
  edges: readonly GraphRenderEdge[],
): GraphVisualEdge => {
  const representative = pickRepresentativeEdge(edges)

  return {
    id: representative.id,
    source: representative.source,
    target: representative.target,
    sourcePosition: representative.sourcePosition,
    targetPosition: representative.targetPosition,
    sourceRadius: representative.sourceRadius,
    targetRadius: representative.targetRadius,
    relation: representative.relation,
    weight: representative.weight,
    isPriority: representative.isPriority,
    targetSharedByExpandedCount: representative.targetSharedByExpandedCount,
    isBidirectional: false,
  }
}

const buildMutualVisualEdge = ({
  pairKey,
  edges,
}: {
  pairKey: string
  edges: readonly GraphRenderEdge[]
}): GraphVisualEdge => {
  const [source, target] = pairKey.split(':')
  const forwardEdges = edges.filter(
    (edge) => edge.source === source && edge.target === target,
  )
  const reverseEdges = edges.filter(
    (edge) => edge.source === target && edge.target === source,
  )

  const forwardRepresentative =
    forwardEdges.length > 0
      ? pickRepresentativeEdge(forwardEdges)
      : pickRepresentativeEdge(reverseEdges)

  return {
    id: createMutualVisualEdgeId(source, target),
    source,
    target,
    sourcePosition: forwardRepresentative.sourcePosition,
    targetPosition: forwardRepresentative.targetPosition,
    sourceRadius: forwardRepresentative.sourceRadius,
    targetRadius: forwardRepresentative.targetRadius,
    relation: 'mutual',
    weight: edges.reduce(
      (maxWeight, edge) => Math.max(maxWeight, edge.weight),
      0,
    ),
    isPriority: edges.some((edge) => edge.isPriority),
    targetSharedByExpandedCount: forwardRepresentative.targetSharedByExpandedCount,
    isBidirectional: true,
  }
}

const buildVisualEdges = (
  edges: readonly GraphRenderEdge[],
): GraphVisualEdge[] => {
  const pairGroups = new Map<string, GraphRenderEdge[]>()

  for (const edge of edges) {
    const pairKey = createUndirectedPairKey(edge.source, edge.target)
    const pairEdges = pairGroups.get(pairKey)

    if (pairEdges) {
      pairEdges.push(edge)
    } else {
      pairGroups.set(pairKey, [edge])
    }
  }

  const visualEdges: GraphVisualEdge[] = []
  const sortedPairKeys = [...pairGroups.keys()].sort()

  for (const pairKey of sortedPairKeys) {
    const pairEdges = pairGroups.get(pairKey) ?? []
    const edgesByDirection = new Map<string, GraphRenderEdge[]>()

    for (const edge of pairEdges) {
      const directionKey = createDirectedPairKey(edge.source, edge.target)
      const directionEdges = edgesByDirection.get(directionKey)

      if (directionEdges) {
        directionEdges.push(edge)
      } else {
        edgesByDirection.set(directionKey, [edge])
      }
    }

    if (edgesByDirection.size > 1) {
      visualEdges.push(
        buildMutualVisualEdge({
          pairKey,
          edges: pairEdges,
        }),
      )
      continue
    }

    for (const directionEdges of edgesByDirection.values()) {
      visualEdges.push(buildDirectedVisualEdge(directionEdges))
    }
  }

  return visualEdges.sort(compareEdgesById)
}

export const buildGraphSceneGeometry = (
  edges: readonly GraphRenderEdge[],
  signature?: string,
) => {
  const cacheKey = signature ?? createGraphSceneGeometrySignature(edges)
  const cachedGeometry = graphSceneGeometryCache.get(cacheKey)

  if (cachedGeometry) {
    return cachedGeometry
  }

  const sortedEdges = [...edges].sort(compareEdgesById)
  const visualEdges = buildVisualEdges(sortedEdges)
  const segments = visualEdges.flatMap((edge) => buildStraightEdgeSegments(edge))

  const geometry = { segments }
  graphSceneGeometryCache.set(cacheKey, geometry)

  return geometry
}
