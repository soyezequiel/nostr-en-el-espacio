import {
  GRAPH_FIT_PADDING_PX,
  GRAPH_MAX_ZOOM,
  GRAPH_MIN_SETTLED_ZOOM,
  GRAPH_MIN_ZOOM,
} from '@/features/graph/render/constants'
import type { GraphBounds } from '@/features/graph/render/types'

export interface GraphViewInsets {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface GraphViewState {
  target: [number, number, number]
  zoom: number
  minZoom: number
  maxZoom: number
}

type GraphViewStateInput = {
  target?: [number, number, number] | [number, number]
  zoom?: number | [number, number]
  minZoom?: number
  maxZoom?: number
}

const normalizeTarget = (
  target: [number, number, number] | [number, number] | undefined,
): [number, number, number] => {
  if (!target) {
    return [0, 0, 0]
  }

  if (target.length === 3) {
    return [target[0], target[1], target[2]]
  }

  return [target[0], target[1], 0]
}

const normalizeInset = (value: number | undefined) =>
  Math.max(0, value ?? 0)

const normalizeGraphInsets = (insets?: GraphViewInsets): Required<GraphViewInsets> => ({
  top: normalizeInset(insets?.top),
  right: normalizeInset(insets?.right),
  bottom: normalizeInset(insets?.bottom),
  left: normalizeInset(insets?.left),
})

const normalizeFitNumber = (value: number) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0

const serializeGraphBounds = (bounds: GraphBounds) =>
  [
    bounds.minX,
    bounds.maxX,
    bounds.minY,
    bounds.maxY,
  ]
    .map(normalizeFitNumber)
    .join(',')

const serializeGraphInsets = (insets?: GraphViewInsets) => {
  const normalizedInsets = normalizeGraphInsets(insets)
  return [
    normalizedInsets.top,
    normalizedInsets.right,
    normalizedInsets.bottom,
    normalizedInsets.left,
  ]
    .map(normalizeFitNumber)
    .join(',')
}

export const sanitizeGraphViewState = (
  viewState: GraphViewStateInput | undefined,
): GraphViewState => {
  const rawZoom = Array.isArray(viewState?.zoom)
    ? viewState.zoom[0]
    : viewState?.zoom

  return {
    target: normalizeTarget(viewState?.target),
    zoom: Math.min(
      GRAPH_MAX_ZOOM,
      Math.max(GRAPH_MIN_ZOOM, rawZoom ?? GRAPH_MIN_SETTLED_ZOOM),
    ),
    minZoom: GRAPH_MIN_ZOOM,
    maxZoom: GRAPH_MAX_ZOOM,
  }
}

export const createGraphFitSignature = ({
  layoutKey,
  bounds,
  width,
  height,
  insets,
}: {
  layoutKey: string
  bounds: GraphBounds
  width: number
  height: number
  insets?: GraphViewInsets
}) =>
  [
    layoutKey,
    serializeGraphBounds(bounds),
    normalizeFitNumber(width),
    normalizeFitNumber(height),
    serializeGraphInsets(insets),
  ].join(':')

export const createFittedGraphViewState = ({
  bounds,
  width,
  height,
  insets,
}: {
  bounds: GraphBounds
  width: number
  height: number
  insets?: GraphViewInsets
}): GraphViewState => {
  const normalizedInsets = normalizeGraphInsets(insets)
  const availableWidth = Math.max(
    1,
    width -
      normalizedInsets.left -
      normalizedInsets.right -
      GRAPH_FIT_PADDING_PX * 2,
  )
  const availableHeight = Math.max(
    1,
    height -
      normalizedInsets.top -
      normalizedInsets.bottom -
      GRAPH_FIT_PADDING_PX * 2,
  )
  const extentX = Math.max(1, bounds.maxX - bounds.minX)
  const extentY = Math.max(1, bounds.maxY - bounds.minY)
  const fitScale = Math.min(availableWidth / extentX, availableHeight / extentY)
  const scale = Math.max(fitScale, Number.MIN_VALUE)
  const fitZoom = Math.log2(scale)
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  const targetOffsetX =
    (normalizedInsets.right - normalizedInsets.left) / (2 * scale)
  const targetOffsetY =
    (normalizedInsets.bottom - normalizedInsets.top) / (2 * scale)

  return sanitizeGraphViewState({
    target: [centerX + targetOffsetX, centerY + targetOffsetY, 0],
    zoom: fitZoom,
  })
}

export const projectGraphPointToScreen = ({
  height,
  position,
  viewState,
  width,
}: {
  height: number
  position: readonly [number, number]
  viewState: Pick<GraphViewState, 'target' | 'zoom'>
  width: number
}): [number, number] => {
  const scale = Math.pow(2, viewState.zoom)

  return [
    (position[0] - viewState.target[0]) * scale + width / 2,
    (position[1] - viewState.target[1]) * scale + height / 2,
  ]
}
