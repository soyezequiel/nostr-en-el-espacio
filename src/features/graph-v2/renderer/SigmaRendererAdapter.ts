import Sigma from 'sigma'

import type {
  GraphInteractionCallbacks,
  GraphSceneSnapshot,
  RendererAdapter,
} from '@/features/graph-v2/renderer/contracts'
import { ForceAtlasRuntime } from '@/features/graph-v2/renderer/forceAtlasRuntime'
import type {
  SigmaEdgeAttributes,
  SigmaNodeAttributes,
} from '@/features/graph-v2/renderer/graphologyProjectionStore'
import { GraphologyProjectionStore } from '@/features/graph-v2/renderer/graphologyProjectionStore'
import {
  createSuppressedNodeClick,
  createPendingNodeDragGesture,
  shouldSuppressNodeClick,
  shouldStartNodeDrag,
  type PendingNodeDragGesture,
  type SuppressedNodeClick,
} from '@/features/graph-v2/renderer/nodeDragGesture'

export class SigmaRendererAdapter implements RendererAdapter {
  private sigma: Sigma<SigmaNodeAttributes, SigmaEdgeAttributes> | null = null

  private projectionStore: GraphologyProjectionStore | null = null

  private forceRuntime: ForceAtlasRuntime | null = null

  private callbacks: GraphInteractionCallbacks | null = null

  private scene: GraphSceneSnapshot | null = null

  private pendingDragGesture: PendingNodeDragGesture | null = null

  private suppressedClick: SuppressedNodeClick | null = null

  private draggedNodePubkey: string | null = null

  private pendingDragFrame: number | null = null

  private pendingGraphPosition: { x: number; y: number } | null = null

  private readonly flushPendingDragFrame = () => {
    this.pendingDragFrame = null

    if (
      !this.sigma ||
      !this.projectionStore ||
      !this.callbacks ||
      !this.draggedNodePubkey ||
      !this.pendingGraphPosition
    ) {
      return
    }

    const draggedNodePubkey = this.draggedNodePubkey
    const graphPosition = this.pendingGraphPosition
    this.pendingGraphPosition = null

    this.projectionStore.setNodePosition(
      draggedNodePubkey,
      graphPosition.x,
      graphPosition.y,
      true,
    )
    this.sigma.refresh()
    this.callbacks.onNodeDragMove(draggedNodePubkey, graphPosition)
  }

  private readonly scheduleDragFrame = (graphPosition: { x: number; y: number }) => {
    this.pendingGraphPosition = graphPosition

    if (this.pendingDragFrame !== null) {
      return
    }

    this.pendingDragFrame = requestAnimationFrame(this.flushPendingDragFrame)
  }

  private readonly cancelPendingDragFrame = () => {
    if (this.pendingDragFrame !== null) {
      cancelAnimationFrame(this.pendingDragFrame)
      this.pendingDragFrame = null
    }

    this.pendingGraphPosition = null
  }

  private readonly startDrag = (pubkey: string) => {
    if (!this.projectionStore || !this.callbacks) {
      return
    }

    this.draggedNodePubkey = pubkey
    this.cancelPendingDragFrame()
    this.projectionStore.setNodeFixed(pubkey, true)
    this.forceRuntime?.suspend()
    this.callbacks.onNodeDragStart(pubkey)
  }

  private readonly releaseDrag = () => {
    this.pendingDragGesture = null

    if (!this.draggedNodePubkey || !this.projectionStore || !this.callbacks) {
      this.cancelPendingDragFrame()
      return
    }

    this.flushPendingDragFrame()

    const draggedNodePubkey = this.draggedNodePubkey
    const position = this.projectionStore.getNodePosition(draggedNodePubkey)
    const isPinned = this.scene?.pins.pubkeys.includes(draggedNodePubkey) ?? false

    this.projectionStore.setNodeFixed(draggedNodePubkey, isPinned)
    this.forceRuntime?.resume()
    this.forceRuntime?.reheat()
    this.draggedNodePubkey = null
    this.suppressedClick = createSuppressedNodeClick(draggedNodePubkey)

    if (position) {
      this.callbacks.onNodeDragEnd(draggedNodePubkey, position)
    }
  }

  public mount(
    container: HTMLElement,
    initialScene: GraphSceneSnapshot,
    callbacks: GraphInteractionCallbacks,
  ) {
    this.callbacks = callbacks
    this.scene = initialScene
    this.projectionStore = new GraphologyProjectionStore()
    this.projectionStore.applyScene(initialScene)
    this.forceRuntime = new ForceAtlasRuntime(this.projectionStore.getGraph())
    this.sigma = new Sigma(this.projectionStore.getGraph(), container, {
      renderEdgeLabels: false,
      hideEdgesOnMove: false,
      labelDensity: 0.08,
      labelRenderedSizeThreshold: 10,
      enableEdgeEvents: false,
      defaultEdgeColor: '#8fb6ff',
      defaultNodeColor: '#7dd3a7',
      minCameraRatio: 0.05,
      maxCameraRatio: 4,
    })

    const sigma = this.sigma
    this.bindEvents()
    this.forceRuntime.sync(initialScene)
    sigma.getCamera().animatedReset({ duration: 250 }).catch(() => {})
  }

  public update(scene: GraphSceneSnapshot) {
    if (!this.sigma || !this.projectionStore || !this.forceRuntime) {
      return
    }

    const sigma = this.sigma
    const previousScene = this.scene
    this.scene = scene
    this.projectionStore.applyScene(scene)
    this.forceRuntime.sync(scene)

    if (
      previousScene?.cameraHint.rootPubkey !== scene.cameraHint.rootPubkey &&
      scene.nodes.length > 0
    ) {
      sigma.getCamera().animatedReset({ duration: 250 }).catch(() => {})
    }

    sigma.refresh()
  }

  public dispose() {
    this.releaseDrag()
    this.cancelPendingDragFrame()
    this.forceRuntime?.dispose()
    this.forceRuntime = null
    this.sigma?.kill()
    this.sigma = null
    this.projectionStore = null
    this.callbacks = null
    this.scene = null
  }

  private bindEvents() {
    if (!this.sigma || !this.projectionStore || !this.callbacks) {
      return
    }

    const sigma = this.sigma
    const callbacks = this.callbacks

    sigma.on('clickNode', ({ node }) => {
      if (shouldSuppressNodeClick(this.suppressedClick, node)) {
        this.suppressedClick = null
        return
      }

      if (this.suppressedClick && Date.now() > this.suppressedClick.expiresAt) {
        this.suppressedClick = null
      }

      callbacks.onNodeClick(node)
    })

    sigma.on('enterNode', ({ node }) => {
      callbacks.onNodeHover(node)
    })

    sigma.on('leaveNode', () => {
      callbacks.onNodeHover(null)
    })

    sigma.on('downNode', ({ node, event }) => {
      this.pendingDragGesture = createPendingNodeDragGesture(node, {
        x: event.x,
        y: event.y,
      })
    })

    sigma.on('moveBody', ({ event, preventSigmaDefault }) => {
      const pendingDragGesture = this.pendingDragGesture

      if (!this.draggedNodePubkey && !pendingDragGesture) {
        return
      }

      if (!this.draggedNodePubkey) {
        if (
          !pendingDragGesture ||
          !shouldStartNodeDrag(pendingDragGesture, {
            x: event.x,
            y: event.y,
          })
        ) {
          return
        }

        this.startDrag(pendingDragGesture.pubkey)
      }

      const draggedNodePubkey = this.draggedNodePubkey

      if (!draggedNodePubkey) {
        return
      }

      preventSigmaDefault()

      const graphPosition = sigma.viewportToGraph({
        x: event.x,
        y: event.y,
      })

      this.scheduleDragFrame(graphPosition)
    })

    sigma.on('upNode', () => {
      this.releaseDrag()
    })

    sigma.on('upStage', () => {
      this.releaseDrag()
    })

    sigma.getCamera().on('updated', (viewport) => {
      callbacks.onViewportChange(viewport)
    })
  }
}
