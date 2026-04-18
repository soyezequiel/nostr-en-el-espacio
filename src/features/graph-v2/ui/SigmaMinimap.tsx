'use client'

import { useEffect, useRef } from 'react'

import type { MinimapSnapshot } from '@/features/graph-v2/ui/SigmaCanvasHost'

interface Props {
  zoomRatio: number | null
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  getSnapshot: () => MinimapSnapshot | null
  isPhysicsActive: boolean
}

// Throttle the redraw loop: physics-active → ~10fps, idle → static (no loop).
const ACTIVE_INTERVAL_MS = 100

export function SigmaMinimap({
  zoomRatio,
  onZoomIn,
  onZoomOut,
  onFit,
  getSnapshot,
  isPhysicsActive,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const zoomLabel = zoomRatio != null ? zoomRatio.toFixed(2) + '×' : '—'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let rafId: number | null = null
    let lastDrawMs = 0
    let cancelled = false

    const draw = () => {
      const snapshot = getSnapshot()
      const ctx = canvas.getContext('2d')
      if (!ctx) return
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
        // Empty state: keep a single accent dot in the middle.
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
      // Preserve aspect ratio so the minimap shape matches the real graph.
      const scale = Math.min(availW / spanX, availH / spanY)
      const renderedW = spanX * scale
      const renderedH = spanY * scale
      const offsetX = padding + (availW - renderedW) / 2
      const offsetY = padding + (availH - renderedH) / 2
      const toPx = (x: number, y: number) => ({
        x: offsetX + (x - bounds.minX) * scale,
        y: offsetY + (y - bounds.minY) * scale,
      })
      for (const n of nodes) {
        const p = toPx(n.x, n.y)
        const radius = n.isRoot ? 2.6 : n.isSelected ? 2.2 : 1.4
        ctx.fillStyle = n.isSelected
          ? 'oklch(82% 0.17 75)'
          : n.isRoot
            ? 'oklch(80% 0.14 220)'
            : n.color
        ctx.globalAlpha = n.isRoot || n.isSelected ? 1 : 0.7
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const loop = (now: number) => {
      if (cancelled) return
      if (now - lastDrawMs >= ACTIVE_INTERVAL_MS) {
        draw()
        lastDrawMs = now
      }
      if (isPhysicsActive) rafId = requestAnimationFrame(loop)
    }

    draw() // initial paint
    if (isPhysicsActive) rafId = requestAnimationFrame(loop)

    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [getSnapshot, isPhysicsActive])

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
