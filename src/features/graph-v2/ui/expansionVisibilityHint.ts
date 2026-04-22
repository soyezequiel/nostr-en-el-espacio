import type { GraphV2Layer } from '@/features/graph-v2/domain/invariants'

const INTEGER_FORMATTER = new Intl.NumberFormat('es-AR')

const formatInteger = (value: number) => INTEGER_FORMATTER.format(value)

const translateLayer = (layer: GraphV2Layer) => {
  switch (layer) {
    case 'graph':
      return 'Toda la red'
    case 'followers':
      return 'Me siguen'
    case 'following':
      return 'A quienes sigo'
    case 'mutuals':
      return 'Mutuos'
    case 'following-non-followers':
    case 'nonreciprocal-followers':
      return 'Sin reciprocidad'
    case 'connections':
      return 'Conexiones'
    default:
      return layer
  }
}

export const buildExpansionVisibilityHint = (input: {
  activeLayer: GraphV2Layer
  totalGraphNodeCount: number
  visibleNodeCount: number
  maxGraphNodes: number
  capReached: boolean
  expansionMessage: string | null
}) => {
  const { activeLayer, totalGraphNodeCount, visibleNodeCount, maxGraphNodes, capReached, expansionMessage } = input

  if (activeLayer === 'graph') {
    return null
  }

  if (totalGraphNodeCount <= visibleNodeCount) {
    return null
  }

  const normalizedMessage = expansionMessage?.trim().toLowerCase() ?? ''
  const mentionsCap = capReached || normalizedMessage.includes('cap de')

  if (!mentionsCap) {
    return null
  }

  const layerLabel = translateLayer(activeLayer)
  const totalLabel = capReached
    ? `${formatInteger(totalGraphNodeCount)} / ${formatInteger(maxGraphNodes)}`
    : formatInteger(totalGraphNodeCount)

  return `Estas mirando "${layerLabel}": el canvas muestra ${formatInteger(visibleNodeCount)} nodos, pero el grafo total cargado tiene ${totalLabel}. El cap aplica sobre ese total, no sobre la capa visible.`
}
