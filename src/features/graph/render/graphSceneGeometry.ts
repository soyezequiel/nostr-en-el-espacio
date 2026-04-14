import {
  GRAPH_CURVED_EDGE_SAMPLE_STEPS,
} from '@/features/graph/render/constants'
import type { GraphRenderEdge } from '@/features/graph/render/types'

type Point = [number, number]

export type GraphEdgeSegment = {
  id: string
  source: string
  target: string
  sourcePosition: Point
  targetPosition: Point
  relation: GraphRenderEdge['relation']
  weight: number
  isPriority: boolean
  targetSharedByExpandedCount: number
  progressStart: number
  progressEnd: number
  isBidirectional?: boolean
}

type EdgeEndpoints = {
  sourcePosition: Point
  targetPosition: Point
}

const EDGE_SOURCE_PADDING_PX = 3
const EDGE_TARGET_PADDING_PX = 2

const compareEdgesById = <T extends { id: string }>(left: T, right: T) =>
  left.id.localeCompare(right.id)



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

const getEdgeEndpoints = (edge: GraphRenderEdge): EdgeEndpoints => ({
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

  return `${edges.length}e:v3:${(hash >>> 0).toString(36)}`
}

const createDirectedFollowKey = (source: string, target: string) =>
  `${source}->${target}`



const buildSegmentsFromPath = (
  edge: GraphRenderEdge,
  path: Point[],
  isBidirectional = false,
): GraphEdgeSegment[] => {
  const segments: GraphEdgeSegment[] = []
  
  for (let index = 0; index < path.length - 1; index++) {
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
      progressStart: index / (path.length - 1),
      progressEnd: (index + 1) / (path.length - 1),
      isBidirectional,
    })
  }

  return segments
}



const buildStraightEdgeSegments = (
  edge: GraphRenderEdge,
  isBidirectional = false,
): GraphEdgeSegment[] => {
  const { sourcePosition, targetPosition } = getEdgeEndpoints(edge)
  const path = Array.from({ length: GRAPH_CURVED_EDGE_SAMPLE_STEPS + 1 }, (_, step) => {
    const t = step / GRAPH_CURVED_EDGE_SAMPLE_STEPS
    return [
      sourcePosition[0] * (1 - t) + targetPosition[0] * t,
      sourcePosition[1] * (1 - t) + targetPosition[1] * t,
    ] as Point
  })

  return buildSegmentsFromPath(edge, path, isBidirectional)
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

  const segments: GraphEdgeSegment[] = []
  const sortedEdges = [...edges].sort(compareEdgesById)
  const directedFollowKeys = new Set(
    sortedEdges
      .filter((edge) => edge.relation === 'follow')
      .map((edge) => createDirectedFollowKey(edge.source, edge.target)),
  )

  for (const edge of sortedEdges) {
    if (edge.relation !== 'follow') {
      segments.push(...buildStraightEdgeSegments(edge))
      continue
    }

    const hasOpposingFollow = directedFollowKeys.has(
      createDirectedFollowKey(edge.target, edge.source),
    )

    if (!hasOpposingFollow) {
      segments.push(...buildStraightEdgeSegments(edge))
      continue
    }

    // Mutual follow (A follows B AND B follows A). 
    // We consolidate this into a single straight bidirectional edge.
    // To ensure determinism, we only process the edge where source < target.
    if (edge.source.localeCompare(edge.target) < 0) {
      segments.push(...buildStraightEdgeSegments(edge, true))
    }
  }

  const geometry = { segments }
  graphSceneGeometryCache.set(cacheKey, geometry)

  return geometry
}
