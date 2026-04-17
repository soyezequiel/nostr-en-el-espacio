import type {
  NodeHoverDrawingFunction,
  NodeLabelDrawingFunction,
} from 'sigma/rendering'

import type {
  SigmaEdgeAttributes,
  SigmaNodeAttributes,
} from '@/features/graph-v2/renderer/graphologyProjectionStore'
import { measureNodeLabelTextWidth } from '@/features/graph-v2/renderer/textMetricsCache'

const HOVER_LABEL_PADDING = 2

export const drawCachedDiscNodeLabel: NodeLabelDrawingFunction<
  SigmaNodeAttributes,
  SigmaEdgeAttributes
> = (context, data, settings) => {
  if (!data.label) {
    return
  }

  const size = settings.labelSize
  const font = settings.labelFont
  const weight = settings.labelWeight
  const color = settings.labelColor.attribute
    ? data[settings.labelColor.attribute] || settings.labelColor.color || '#000'
    : settings.labelColor.color

  context.fillStyle = color
  context.font = `${weight} ${size}px ${font}`
  context.fillText(data.label, data.x + data.size + 3, data.y + size / 3)
}

export const drawCachedDiscNodeHover: NodeHoverDrawingFunction<
  SigmaNodeAttributes,
  SigmaEdgeAttributes
> = (context, data, settings) => {
  const size = settings.labelSize
  const font = settings.labelFont
  const weight = settings.labelWeight

  context.font = `${weight} ${size}px ${font}`
  context.fillStyle = '#FFF'
  context.shadowOffsetX = 0
  context.shadowOffsetY = 0
  context.shadowBlur = 8
  context.shadowColor = '#000'

  if (typeof data.label === 'string') {
    const textWidth = measureNodeLabelTextWidth(context, data.label)
    const boxWidth = Math.round(textWidth + 5)
    const boxHeight = Math.round(size + 2 * HOVER_LABEL_PADDING)
    const radius = Math.max(data.size, size / 2) + HOVER_LABEL_PADDING
    const angleRadian = Math.asin(boxHeight / 2 / radius)
    const xDeltaCoord = Math.sqrt(
      Math.abs(radius ** 2 - (boxHeight / 2) ** 2),
    )

    context.beginPath()
    context.moveTo(data.x + xDeltaCoord, data.y + boxHeight / 2)
    context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2)
    context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2)
    context.lineTo(data.x + xDeltaCoord, data.y - boxHeight / 2)
    context.arc(data.x, data.y, radius, angleRadian, -angleRadian)
    context.closePath()
    context.fill()
  } else {
    context.beginPath()
    context.arc(
      data.x,
      data.y,
      data.size + HOVER_LABEL_PADDING,
      0,
      Math.PI * 2,
    )
    context.closePath()
    context.fill()
  }

  context.shadowOffsetX = 0
  context.shadowOffsetY = 0
  context.shadowBlur = 0
  drawCachedDiscNodeLabel(context, data, settings)
}
