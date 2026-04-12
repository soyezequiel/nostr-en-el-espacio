import type { RenderConfig } from '@/features/graph/app/store/types'
import type { GraphEdgeSegment } from '@/features/graph/render/graphSceneGeometry'

export type ArrowMarkerIcon =
  | 'triangle'
  | 'triangle-bidirectional'
  | 'chevron'
  | 'chevron-bidirectional'

export type ArrowMarkerDatum = GraphEdgeSegment & {
  arrowIcon: ArrowMarkerIcon
}

export const buildArrowMarkerData = ({
  segments,
  arrowType,
}: {
  segments: readonly GraphEdgeSegment[]
  arrowType: RenderConfig['arrowType']
}): ArrowMarkerDatum[] => {
  const directionalArrowIcon = arrowType === 'triangle' ? 'triangle' : 'chevron'
  const bidirectionalArrowIcon =
    arrowType === 'triangle'
      ? 'triangle-bidirectional'
      : 'chevron-bidirectional'

  const edgeStates = new Map<
    string,
    {
      prototype: GraphEdgeSegment
      isBidirectional: boolean
      middleSegment: GraphEdgeSegment | null
      middleSegmentDistance: number
      endSegment: GraphEdgeSegment | null
      endSegmentProgress: number
    }
  >()

  for (const segment of segments) {
    const edgeState =
      edgeStates.get(segment.id) ?? {
        prototype: segment,
        isBidirectional:
          segment.relation === 'mutual' || segment.isBidirectional === true,
        middleSegment: null,
        middleSegmentDistance: Number.POSITIVE_INFINITY,
        endSegment: null,
        endSegmentProgress: Number.NEGATIVE_INFINITY,
      }
    edgeState.isBidirectional =
      edgeState.isBidirectional ||
      segment.relation === 'mutual' ||
      segment.isBidirectional === true

    const midpointDistance = Math.abs(
      (segment.progressStart + segment.progressEnd) / 2 - 0.5,
    )
    if (midpointDistance < edgeState.middleSegmentDistance) {
      edgeState.middleSegmentDistance = midpointDistance
      edgeState.middleSegment = segment
    }

    if (segment.progressEnd >= edgeState.endSegmentProgress) {
      edgeState.endSegment = segment
      edgeState.endSegmentProgress = segment.progressEnd
    }

    edgeStates.set(segment.id, edgeState)
  }

  const result: ArrowMarkerDatum[] = []

  for (const edgeState of edgeStates.values()) {
    if (edgeState.isBidirectional) {
      if (edgeState.middleSegment !== null) {
        result.push({
          ...edgeState.prototype,
          sourcePosition: edgeState.middleSegment.sourcePosition,
          targetPosition: edgeState.middleSegment.targetPosition,
          progressStart: edgeState.middleSegment.progressStart,
          progressEnd: edgeState.middleSegment.progressEnd,
          relation: 'mutual',
          isBidirectional: true,
          arrowIcon: bidirectionalArrowIcon,
        })
      }
      continue
    }

    if (edgeState.endSegment !== null) {
      result.push({
        ...edgeState.prototype,
        sourcePosition: edgeState.endSegment.sourcePosition,
        targetPosition: edgeState.endSegment.targetPosition,
        progressStart: edgeState.endSegment.progressStart,
        progressEnd: edgeState.endSegment.progressEnd,
        isBidirectional: false,
        arrowIcon: directionalArrowIcon,
      })
    }
  }

  return result
}
