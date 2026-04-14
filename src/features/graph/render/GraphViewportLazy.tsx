/* eslint-disable @next/next/no-assign-module-variable */

/**
 * GraphViewportLazy — async adapter for the deck.gl 2D renderer.
 *
 * Wraps DeckGraphRenderer behind React.lazy() so the deck.gl vendor tree
 * (graph-renderer, graph-layers, graph-webgl chunks) is never downloaded
 * until a renderable graph model is available, keeping the structural UI
 * (header, controls, sidepanel) instantaneous.
 *
 * GraphCanvas must import this module instead of GraphViewport directly.
 * GraphViewport.tsx is kept as a pure pass-through for static typing and
 * non-lazy consumers (e.g. Storybook, tests).
 */
import { lazy, memo, Suspense } from 'react'
import type { RenderConfig } from '@/features/graph/app/store/types'
import type { GraphViewState } from '@/features/graph/render/graphViewState'
import type {
  ImageRenderPayload,
  ImageRendererDeliverySnapshot,
} from '@/features/graph/render/imageRuntime'
import type { GraphNodeScreenRadii } from '@/features/graph/render/nodeSizing'
import type { PhysicsFrameStore } from '@/features/graph/render/physicsFrameStore'
import type { GraphRenderLabel, GraphRenderModel } from '@/features/graph/render/types'

// DeckRendererAsync is the ONLY module that statically imports DeckGraphRenderer.
// Rollup treats this dynamic import as the chunk split boundary.
const DeckGraphRendererLazy = lazy(async () => {
  const module = await import('@/features/graph/render/DeckRendererAsync')
  return { default: module.DeckGraphRenderer }
})

interface GraphViewportLazyProps {
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
  imageFrame: ImageRenderPayload
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
  forceLowDevicePixels?: boolean
  hoverInteractionEnabled?: boolean
  comparedNodePubkeys?: ReadonlySet<string>
  physicsFrameStore?: PhysicsFrameStore | null
  pinnedNodePubkeys?: ReadonlySet<string>
  nodeDragEnabled?: boolean
}

/**
 * Renders the deck.gl 2D graph viewport behind a Suspense boundary.
 * The fallback is null — GraphCanvas already shows its own empty-state
 * overlay while shouldMountRenderer is false, so no double skeleton.
 */
export const GraphViewportLazy = memo(function GraphViewportLazy({
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
  forceLowDevicePixels,
  hoverInteractionEnabled,
  comparedNodePubkeys,
  physicsFrameStore,
  pinnedNodePubkeys,
  nodeDragEnabled,
}: GraphViewportLazyProps) {
  return (
    <Suspense fallback={null}>
      <DeckGraphRendererLazy
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
        forceLowDevicePixels={forceLowDevicePixels}
        hoverInteractionEnabled={hoverInteractionEnabled}
        comparedNodePubkeys={comparedNodePubkeys}
        physicsFrameStore={physicsFrameStore}
        pinnedNodePubkeys={pinnedNodePubkeys}
        nodeDragEnabled={nodeDragEnabled}
      />
    </Suspense>
  )
})
