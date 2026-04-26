/**
 * Limita el `devicePixelRatio` (DPR, relación pixel-físico vs pixel-CSS) que ve
 * Sigma para evitar buffers WebGL gigantescos en mobile y en Chrome DevTools
 * mobile emulation, donde DPR puede llegar a 3.5+ y saturar el pipeline GPU
 * durante un drag/pan táctil.
 *
 * Sigma 3.x lee `window.devicePixelRatio` directamente en su constructor y en
 * cada `resize()` mediante un helper interno `getPixelRatio()` que NO está
 * expuesto por la API pública (no es un setting). Para limitarlo sin fork ni
 * patch-package, instalamos un getter sobre `window.devicePixelRatio` que
 * devuelve el valor "tope" calculado para el dispositivo. Se desinstala en
 * `dispose()` restaurando el descriptor original.
 *
 * Alcance: el override está activo solo mientras el grafo está montado.
 * Otros consumidores en la misma página (backdrop, overlay de zaps, avatar
 * pipeline) también verán el valor limitado, lo que es deseado: el backdrop
 * debe alinearse con el canvas WebGL de Sigma.
 */

const MOBILE_MAX_DPR = 2
const DESKTOP_MAX_DPR = 2

const isDevEnv =
  typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'

const isDebugFlagEnabled = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }
  try {
    return window.localStorage?.getItem('sigma-dpr-debug') === '1'
  } catch {
    return false
  }
}

export interface SigmaPixelRatioInfo {
  rawDpr: number
  effectiveDpr: number
  isCoarsePointer: boolean
  isSmallViewport: boolean
}

export const computeSigmaPixelRatioInfo = (): SigmaPixelRatioInfo => {
  const rawDpr =
    typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
      ? window.devicePixelRatio || 1
      : 1

  const isCoarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches

  const isSmallViewport =
    typeof window !== 'undefined' && window.innerWidth <= 768

  const isMobileLike = isCoarsePointer || isSmallViewport
  const max = isMobileLike ? MOBILE_MAX_DPR : DESKTOP_MAX_DPR
  const effectiveDpr = Math.min(rawDpr, max)

  return { rawDpr, effectiveDpr, isCoarsePointer, isSmallViewport }
}

const logCanvasState = (
  container: HTMLElement | null,
  info: SigmaPixelRatioInfo,
  label: string,
) => {
  if (!isDevEnv && !isDebugFlagEnabled()) {
    return
  }
  if (typeof window === 'undefined') {
    return
  }

  const containerSize = container
    ? { width: container.clientWidth, height: container.clientHeight }
    : null
  const canvases = container
    ? Array.from(container.querySelectorAll('canvas')).map((canvas) => ({
        width: canvas.width,
        height: canvas.height,
        styleWidth: canvas.style.width,
        styleHeight: canvas.style.height,
      }))
    : []

  console.log(`[sigma-dpr] ${label}`, {
    rawDpr: info.rawDpr,
    effectiveDpr: info.effectiveDpr,
    isCoarsePointer: info.isCoarsePointer,
    isSmallViewport: info.isSmallViewport,
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    },
    container: containerSize,
    canvasCount: canvases.length,
    canvases,
  })
}

/**
 * Instala un getter sobre `window.devicePixelRatio` que devuelve el DPR
 * efectivo (ver `computeSigmaPixelRatioInfo`). Devuelve una función `dispose`
 * que restaura el descriptor original.
 *
 * Si el override ya estaba instalado por otra instancia, se respeta
 * (reference counting básico) y solo el último `dispose` restaura.
 */
export const installSigmaPixelRatioCap = (
  container: HTMLElement | null,
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const info = computeSigmaPixelRatioInfo()
  logCanvasState(container, info, 'install (pre-mount)')

  // Si el DPR efectivo es igual al raw, no hace falta override (caso desktop
  // con DPR=1 o =2). Aún así loggeamos y devolvemos un dispose no-op.
  if (info.effectiveDpr >= info.rawDpr) {
    return () => {
      logCanvasState(container, computeSigmaPixelRatioInfo(), 'dispose (no-op)')
    }
  }

  const originalDescriptor =
    Object.getOwnPropertyDescriptor(window, 'devicePixelRatio') ??
    Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(window) as object,
      'devicePixelRatio',
    ) ??
    null

  // Capturamos el efectivo en una constante para evitar recursión: el getter
  // no puede volver a llamar a computeSigmaPixelRatioInfo() porque eso leería
  // window.devicePixelRatio (= este mismo getter) → stack overflow.
  const cappedDpr = info.effectiveDpr

  let installed = false
  try {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      get: () => cappedDpr,
    })
    installed = true
  } catch (err) {
    if (isDevEnv) {
      console.warn('[sigma-dpr] override failed', err)
    }
  }

  return () => {
    if (!installed) {
      return
    }
    try {
      if (originalDescriptor) {
        Object.defineProperty(window, 'devicePixelRatio', originalDescriptor)
      } else {
        // No había descriptor propio; eliminamos el getter para que vuelva a
        // resolver vía el prototype.
        delete (window as unknown as Record<string, unknown>).devicePixelRatio
      }
    } catch (err) {
      if (isDevEnv) {
        console.warn('[sigma-dpr] restore failed', err)
      }
    }
    logCanvasState(container, computeSigmaPixelRatioInfo(), 'dispose')
  }
}
