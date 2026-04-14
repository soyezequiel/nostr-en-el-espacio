import type { RenderConfig } from '@/features/graph/app/store/types'
import type { GraphViewState } from '@/features/graph/render/graphViewState'
import { GraphViewportLazy } from '@/features/graph/render/GraphViewportLazy'
import type {
  ImageFrameState,
  ImageRendererDeliverySnapshot,
} from '@/features/graph/render/imageRuntime'
import type { GraphNodeScreenRadii } from '@/features/graph/render/nodeSizing'
import type { PhysicsFrameStore } from '@/features/graph/render/physicsFrameStore'
import type {
  GraphRenderLabel,
  GraphRenderModel,
} from '@/features/graph/render/types'

interface GraphViewportProps {
  width: number
  height: number
  model: GraphRenderModel
  viewState: GraphViewState
  hoveredNodePubkey: string | null
  hoveredEdgeId: string | null
  hoveredEdgePubkeys: readonly string[]
  selectedNodePubkey: string | null
  visibleLabels: readonly GraphRenderLabel[]
  nodeScreenRadii: GraphNodeScreenRadii
  imageFrame: ImageFrameState
  onAvatarRendererDelivery?: (snapshot: ImageRendererDeliverySnapshot) => void
  onHoverGraph: (
    hover:
      | { type: 'node'; pubkey: string }
      | { type: 'edge'; edgeId: string; pubkeys: [string, string] }
      | null,
  ) => void
  onSelectNode: (pubkey: string | null, options?: { shiftKey?: boolean }) => void
  onNodeDragStart?: (pubkey: string, position: [number, number]) => void
  onNodeDragMove?: (pubkey: string, position: [number, number]) => void
  onNodeDragEnd?: (pubkey: string) => void
  onViewStateChange: (viewState: GraphViewState) => void
  renderConfig: RenderConfig
  comparedNodePubkeys: ReadonlySet<string>
  physicsFrameStore?: PhysicsFrameStore | null
  pinnedNodePubkeys?: ReadonlySet<string>
  nodeDragEnabled?: boolean
}

export function GraphViewport({
  width,
  height,
  model,
  viewState,
  hoveredNodePubkey,
  hoveredEdgeId,
  hoveredEdgePubkeys,
  selectedNodePubkey,
  visibleLabels,
  nodeScreenRadii,
  imageFrame,
  onAvatarRendererDelivery,
  onHoverGraph,
  onSelectNode,
  onNodeDragStart,
  onNodeDragMove,
  onNodeDragEnd,
  onViewStateChange,
  renderConfig,
  comparedNodePubkeys,
  physicsFrameStore,
  pinnedNodePubkeys,
  nodeDragEnabled,
}: GraphViewportProps) {
  return (
    <GraphViewportLazy
      height={height}
      hoveredNodePubkey={hoveredNodePubkey}
      hoveredEdgeId={hoveredEdgeId}
      hoveredEdgePubkeys={hoveredEdgePubkeys}
      selectedNodePubkey={selectedNodePubkey}
      model={model}
      nodeScreenRadii={nodeScreenRadii}
      visibleLabels={visibleLabels}
      imageFrame={imageFrame}
      onAvatarRendererDelivery={onAvatarRendererDelivery}
      onHoverGraph={onHoverGraph}
      onSelectNode={onSelectNode}
      onNodeDragStart={onNodeDragStart}
      onNodeDragMove={onNodeDragMove}
      onNodeDragEnd={onNodeDragEnd}
      onViewStateChange={onViewStateChange}
      viewState={viewState}
      width={width}
      renderConfig={renderConfig}
      comparedNodePubkeys={comparedNodePubkeys}
      physicsFrameStore={physicsFrameStore}
      pinnedNodePubkeys={pinnedNodePubkeys}
      nodeDragEnabled={nodeDragEnabled}
    />
  )
}
