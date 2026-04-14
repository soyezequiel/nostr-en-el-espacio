import type { GraphNode } from '@/features/graph/app/store/types'

import { GRAPH_LABEL_ZOOM_THRESHOLD } from '@/features/graph/render/constants'
import {
  projectGraphPointToScreen,
  type GraphViewState,
} from '@/features/graph/render/graphViewState'
import type { GraphLabelPolicy, GraphRenderLabel } from '@/features/graph/render/types'

export const truncatePubkey = (pubkey: string, head = 8, tail = 6) => {
  if (pubkey.length <= head + tail + 3) {
    return pubkey
  }

  return `${pubkey.slice(0, head)}...${pubkey.slice(-tail)}`
}

export const getNodeDisplayLabel = (node: GraphNode) =>
  node.label?.trim() || truncatePubkey(node.pubkey)

export const shouldShowGraphLabel = ({
  label,
  hoveredNodePubkey,
  zoomLevel,
  labelPolicy,
}: {
  label: GraphRenderLabel
  hoveredNodePubkey: string | null
  zoomLevel: number
  labelPolicy: GraphLabelPolicy
}) =>
  label.isRoot ||
  label.isAnchor === true ||
  label.isAggregate === true ||
  hoveredNodePubkey === label.pubkey ||
  label.isSelected ||
  (labelPolicy === 'hover-selected-or-zoom' &&
    zoomLevel >= GRAPH_LABEL_ZOOM_THRESHOLD)

export const selectVisibleGraphLabels = ({
  labels,
  hoveredNodePubkey,
  zoomLevel,
  labelPolicy,
}: {
  labels: readonly GraphRenderLabel[]
  hoveredNodePubkey: string | null
  zoomLevel: number
  labelPolicy: GraphLabelPolicy
}) =>
  labels.filter((label) =>
    shouldShowGraphLabel({
      label,
      hoveredNodePubkey,
      zoomLevel,
      labelPolicy,
    }),
  )

type GraphLabelBox = {
  left: number
  top: number
  right: number
  bottom: number
}

type SelectDeclutteredGraphLabelsInput = {
  labels: readonly GraphRenderLabel[]
  hoveredNodePubkey: string | null
  zoomLevel: number
  labelPolicy: GraphLabelPolicy
  viewState: Pick<GraphViewState, 'target' | 'zoom'>
  width: number
  height: number
  nodeScreenRadii: ReadonlyMap<string, number>
}

const getLabelPriority = (
  label: GraphRenderLabel,
  hoveredNodePubkey: string | null,
) => {
  if (label.isSelected) {
    return 0
  }

  if (hoveredNodePubkey === label.pubkey) {
    return 1
  }

  if (label.isRoot) {
    return 2
  }

  if (label.isAnchor === true) {
    return 3
  }

  if (label.isAggregate === true) {
    return 4
  }

  return 5
}

const getLabelFontSize = (label: GraphRenderLabel) =>
  label.isRoot ? 14 : label.isAnchor ? 13.5 : 13

const resolveLabelScreenRadius = (
  label: GraphRenderLabel,
  nodeScreenRadii: ReadonlyMap<string, number>,
) => nodeScreenRadii.get(label.pubkey) ?? label.radius

const estimateLabelBox = (input: {
  label: GraphRenderLabel
  screenPosition: [number, number]
  screenRadius: number
}): GraphLabelBox => {
  const fontSize = getLabelFontSize(input.label)
  const textWidth = Math.max(40, input.label.text.length * fontSize * 0.56 + 12)
  const textHeight = fontSize + 7
  const top = input.screenPosition[1] + input.screenRadius + 8

  return {
    left: input.screenPosition[0] - textWidth / 2,
    top,
    right: input.screenPosition[0] + textWidth / 2,
    bottom: top + textHeight,
  }
}

const boxesIntersect = (left: GraphLabelBox, right: GraphLabelBox) =>
  !(
    left.right <= right.left ||
    left.left >= right.right ||
    left.bottom <= right.top ||
    left.top >= right.bottom
  )

export const selectDeclutteredGraphLabels = ({
  labels,
  hoveredNodePubkey,
  zoomLevel,
  labelPolicy,
  viewState,
  width,
  height,
  nodeScreenRadii,
}: SelectDeclutteredGraphLabelsInput) => {
  const visibleLabels = selectVisibleGraphLabels({
    labels,
    hoveredNodePubkey,
    zoomLevel,
    labelPolicy,
  })

  const orderedLabels = visibleLabels
    .map((label, index) => ({
      index,
      label,
      priority: getLabelPriority(label, hoveredNodePubkey),
      screenRadius: resolveLabelScreenRadius(label, nodeScreenRadii),
    }))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority
      }

      if (left.screenRadius !== right.screenRadius) {
        return right.screenRadius - left.screenRadius
      }

      if (left.label.text.length !== right.label.text.length) {
        return right.label.text.length - left.label.text.length
      }

      return left.index - right.index
    })

  const acceptedLabels: GraphRenderLabel[] = []
  const acceptedBoxes: GraphLabelBox[] = []

  for (const item of orderedLabels) {
    const screenPosition = projectGraphPointToScreen({
      height,
      position: item.label.position,
      viewState,
      width,
    })
    const candidateBox = estimateLabelBox({
      label: item.label,
      screenPosition,
      screenRadius: item.screenRadius,
    })

    if (acceptedBoxes.some((box) => boxesIntersect(box, candidateBox))) {
      continue
    }

    acceptedLabels.push(item.label)
    acceptedBoxes.push(candidateBox)
  }

  return acceptedLabels
}
