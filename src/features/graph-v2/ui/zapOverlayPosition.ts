export interface ZapOverlayViewportAdapter {
  getViewportPosition: (pubkey: string) => { x: number; y: number } | null
}

export function resolveZapOverlayCssPosition(
  adapter: ZapOverlayViewportAdapter | null,
  pubkey: string,
): { x: number; y: number } | null {
  const viewportPosition = adapter?.getViewportPosition(pubkey)
  if (!viewportPosition) {
    return null
  }

  // Sigma's graphToViewport returns viewport coordinates in CSS pixels.
  // The zap overlay canvas already applies its own DPR transform, so scaling
  // these coordinates by canvas.width would make zaps pan/zoom at the wrong
  // speed on high-density screens.
  return {
    x: viewportPosition.x,
    y: viewportPosition.y,
  }
}
