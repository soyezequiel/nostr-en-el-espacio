'use client'

import { useEffect, useRef } from 'react'

import type { MinimapSnapshot } from '@/features/graph-v2/ui/SigmaCanvasHost'

interface Props {
  zoomRatio: number | null
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  getSnapshot: () => MinimapSnapshot | null
  // Subscribe returns an unsubscribe fn. Called once on mount; the minimap
  // redraws only when the underlying renderer ticks (camera moved or a
  // frame was drawn) instead of running its own RAF.
  subscribeToRenderTicks: (listener: () => void) => () => void
  // Pan the main camera so a graph-space point lands at the viewport center.
  // Called during pointer drag on the minimap to navigate the graph.
  panCameraToGraph: (graphX: number, graphY: number, options?: { animate?: boolean }) => void
}

// Redraws are coalesced to at most once per animation frame to keep the
// minimap cheap even when the renderer ticks at 60fps.
export function SigmaMinimap({
  zoomRatio,
  onZoomIn,
  onZoomOut,
  onFit,
  getSnapshot,
  subscribeToRenderTicks,
  panCameraToGraph,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Persist the last-computed layout so pointer events can reverse-project
  // without recomputing bounds each time.
  const projectionRef = useRef<{
    bounds: { minX: number; minY: number; maxX: number; maxY: number }
    scale: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const zoomLabel = zoomRatio != null ? zoomRatio.toFixed(2) + '×' : '—'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let rafScheduled = false
    let cancelled = false

    const draw = () => {
      rafScheduled = false
      if (cancelled) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const snapshot = getSnapshot()
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const targetW = Math.max(1, Math.round(rect.width * dpr))
      const targetH = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW
        canvas.height = targetH
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)

      if (!snapshot || snapshot.nodes.length === 0) {
        projectionRef.current = null
        ctx.fillStyle = 'rgba(149, 200, 255, 0.5)'
        ctx.beginPath()
        ctx.arc(rect.width / 2, rect.height / 2, 2.5, 0, Math.PI * 2)
        ctx.fill()
        return
      }

      const { bounds, nodes } = snapshot
      const spanX = Math.max(1e-6, bounds.maxX - bounds.minX)
      const spanY = Math.max(1e-6, bounds.maxY - bounds.minY)
      const padding = 8
      const availW = Math.max(1, rect.width - padding * 2)
      const availH = Math.max(1, rect.height - padding * 2)
      const scale = Math.min(availW / spanX, availH / spanY)
      const renderedW = spanX * scale
      const renderedH = spanY * scale
      const offsetX = padding + (availW - renderedW) / 2
      const offsetY = padding + (availH - renderedH) / 2
      projectionRef.current = { bounds, scale, offsetX, offsetY }

      for (const n of nodes) {
        const px = offsetX + (n.x - bounds.minX) * scale
        const py = offsetY + (n.y - bounds.minY) * scale
        const radius = n.isRoot ? 2.6 : n.isSelected ? 2.2 : 1.4
        ctx.fillStyle = n.isSelected
          ? 'oklch(82% 0.17 75)'
          : n.isRoot
            ? 'oklch(80% 0.14 220)'
            : n.color
        ctx.globalAlpha = n.isRoot || n.isSelected ? 1 : 0.7
        ctx.beginPath()
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const schedule = () => {
      if (rafScheduled || cancelled) return
      rafScheduled = true
      requestAnimationFrame(draw)
    }

    // Initial paint + subscribe to renderer ticks so movement/zoom redraws
    // the minimap. No RAF loop of our own.
    schedule()
    const unsubscribe = subscribeToRenderTicks(schedule)

    // Also refresh on window resize so the canvas aspect stays correct.
    const onResize = () => schedule()
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      unsubscribe()
      window.removeEventListener('resize', onResize)
    }
  }, [getSnapshot, subscribeToRenderTicks])

  // Pointer navigation: click/drag on the minimap pans the main camera.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let pointerDown = false
    let activePointerId: number | null = null

    const toGraphCoords = (clientX: number, clientY: number) => {
      const projection = projectionRef.current
      if (!projection) return null
      const rect = canvas.getBoundingClientRect()
      const localX = clientX - rect.left
      const localY = clientY - rect.top
      const { bounds, scale, offsetX, offsetY } = projection
      if (scale <= 0) return null
      const graphX = bounds.minX + (localX - offsetX) / scale
      const graphY = bounds.minY + (localY - offsetY) / scale
      return { x: graphX, y: graphY }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      pointerDown = true
      activePointerId = event.pointerId
      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {
        // setPointerCapture can throw in rare edge cases; ignore.
      }
      const pt = toGraphCoords(event.clientX, event.clientY)
      if (pt) panCameraToGraph(pt.x, pt.y)
      event.preventDefault()
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!pointerDown || event.pointerId !== activePointerId) return
      const pt = toGraphCoords(event.clientX, event.clientY)
      // Instant (no animation) so drag feels tight.
      if (pt) panCameraToGraph(pt.x, pt.y, { animate: false })
    }
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return
      pointerDown = false
      activePointerId = null
      try {
        canvas.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    }
  }, [panCameraToGraph])

  return (
    <div className="sg-minimap">
      <div className="sg-minimap__head">
        <span>MAPA</span>
        <span>{zoomLabel}</span>
      </div>
      <div className="sg-minimap__canvas">
        <canvas className="sg-minimap__canvas-el" ref={canvasRef} />
      </div>
      <div className="sg-minimap__foot">
        <button onClick={onZoomIn} title="Acercar" type="button">＋</button>
        <div className="sg-minimap__sep" />
        <button onClick={onZoomOut} title="Alejar" type="button">−</button>
        <div className="sg-minimap__sep" />
        <button onClick={onFit} title="Ajustar" type="button">fit</button>
      </div>
    </div>
  )
}
