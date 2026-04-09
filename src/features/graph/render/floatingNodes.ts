/**
 * floatingNodes — sistema de animación flotante cinematográfica para nodos del grafo.
 *
 * Completamente independiente de React: usa un rAF loop propio y notifica
 * al caller con posiciones actualizadas. Se integra en GraphSceneLayer via
 * setNeedsUpdate() de Deck.gl, sin ningún setState de React.
 *
 * Mecánicas:
 *   - Simplex 2D noise por nodo (seed único por pubkey) → movimiento orgánico
 *   - Spring interpolation (easing 0.06) → sensación de peso/inercia
 *   - Colisiones blandas con damping → empujones que se absorben solos
 */

type Vec2 = [number, number]

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type FloatingNodesPreset = 'cinematic' | 'subtle' | 'dramatic'

export type FloatingConfig = {
  /** Amplitud del movimiento en unidades del mundo (radio de flotación) */
  amplitude: number
  /** Velocidad de ciclo del ruido, en ciclos/segundo */
  speed: number
  /** Factor de amortiguación de velocidades de colisión (0-1). Más alto = frena más despacio */
  collisionDamping: number
  /** Máximo impulso de separación al colisionar, en unidades del mundo */
  maxPushDistance: number
  /** Espacio extra más allá del radio físico para detectar colisión */
  collisionPadding: number
}

export const FLOATING_PRESETS: Record<FloatingNodesPreset, FloatingConfig> = {
  cinematic: {
    amplitude: 5,
    speed: 0.5,
    collisionDamping: 0.93,
    maxPushDistance: 6,
    collisionPadding: 3,
  },
  subtle: {
    amplitude: 2,
    speed: 0.7,
    collisionDamping: 0.96,
    maxPushDistance: 3,
    collisionPadding: 2,
  },
  dramatic: {
    amplitude: 10,
    speed: 0.35,
    collisionDamping: 0.88,
    maxPushDistance: 10,
    collisionPadding: 5,
  },
}

// ─── Simplex 2D Noise (inline, sin dependencias externas) ─────────────────────
// Basado en la implementación de dominio público de Stefan Gustavson.

const GRAD2: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
]

const buildPermutation = (): { perm: Uint8Array; permMod8: Uint8Array } => {
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i

  // Fisher-Yates con semilla fija → tabla reproducible
  let s = 0xdeadbeef
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    const tmp = p[i]
    p[i] = p[j]
    p[j] = tmp
  }

  const perm = new Uint8Array(512)
  const permMod8 = new Uint8Array(512)
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255]
    permMod8[i] = perm[i] & 7 // % 8
  }
  return { perm, permMod8 }
}

const { perm: PERM, permMod8: PERM_MOD8 } = buildPermutation()

const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6

const simplex2 = (xIn: number, yIn: number): number => {
  const s = (xIn + yIn) * F2
  const i = Math.floor(xIn + s)
  const j = Math.floor(yIn + s)
  const t = (i + j) * G2
  const x0 = xIn - (i - t)
  const y0 = yIn - (j - t)

  const i1 = x0 > y0 ? 1 : 0
  const j1 = x0 > y0 ? 0 : 1

  const x1 = x0 - i1 + G2
  const y1 = y0 - j1 + G2
  const x2 = x0 - 1 + 2 * G2
  const y2 = y0 - 1 + 2 * G2

  const ii = i & 255
  const jj = j & 255
  const gi0 = PERM_MOD8[ii + PERM[jj]]
  const gi1 = PERM_MOD8[ii + i1 + PERM[jj + j1]]
  const gi2 = PERM_MOD8[(ii + 1) + PERM[(jj + 1) & 511]]

  const g0 = GRAD2[gi0]!
  const g1 = GRAD2[gi1]!
  const g2 = GRAD2[gi2]!

  let t0 = 0.5 - x0 * x0 - y0 * y0
  const n0 = t0 < 0 ? 0 : ((t0 *= t0), t0 * t0 * (g0[0] * x0 + g0[1] * y0))

  let t1 = 0.5 - x1 * x1 - y1 * y1
  const n1 = t1 < 0 ? 0 : ((t1 *= t1), t1 * t1 * (g1[0] * x1 + g1[1] * y1))

  let t2 = 0.5 - x2 * x2 - y2 * y2
  const n2 = t2 < 0 ? 0 : ((t2 *= t2), t2 * t2 * (g2[0] * x2 + g2[1] * y2))

  return 70 * (n0 + n1 + n2) // [-1, 1]
}

/** FNV-1a hash → seed float en rango positivo para el noise */
const hashPubkeyToSeed = (pubkey: string, axis: number): number => {
  let h = (0x811c9dc5 ^ (axis * 0x9e3779b9)) >>> 0
  const len = Math.min(pubkey.length, 16)
  for (let i = 0; i < len; i++) {
    h = (h ^ pubkey.charCodeAt(i)) >>> 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  // Rango [10, 110]: evita zona 0 del noise (menos interesante)
  return 10 + (h / 0xffffffff) * 100
}

// ─── Estado interno por nodo ──────────────────────────────────────────────────

type NodeFloatState = {
  /** Posición "anclada" (resultado del layout d3-force) */
  homeX: number
  homeY: number
  /** Posición renderizada actual (home + floating offset + collision velocity) */
  currentX: number
  currentY: number
  /** Velocidad acumulada por colisiones (se amortigua sola) */
  collisionVx: number
  collisionVy: number
  /** Radio del nodo (para detección de colisión) */
  radius: number
  /** Seeds únicos del noise para cada eje */
  seedX: number
  seedY: number
}

// ─── Controller ──────────────────────────────────────────────────────────────

export type FloatingNodeInput = {
  pubkey: string
  position: Vec2
  radius: number
}

/**
 * FloatingNodesController — motor de animación flotante.
 *
 * Ciclo de vida esperado:
 *   1. new FloatingNodesController(config, onFrame)
 *   2. syncNodes(model.nodes) — llamar cuando llega un nuevo modelo
 *   3. start()
 *   4. (animación corre sola vía rAF)
 *   5. stop() — al desmontar o deshabilitar la feature
 */
export class FloatingNodesController {
  private readonly nodeStates = new Map<string, NodeFloatState>()
  private config: FloatingConfig
  private rafId: number | null = null
  private startTime = 0
  /** Mapa mutable reutilizado entre frames (evita GC) */
  private readonly positions = new Map<string, Vec2>()
  private readonly onFrame: (positions: ReadonlyMap<string, Vec2>) => void

  constructor(
    config: FloatingConfig,
    onFrame: (positions: ReadonlyMap<string, Vec2>) => void,
  ) {
    this.config = config
    this.onFrame = onFrame
  }

  setConfig(config: FloatingConfig): void {
    this.config = config
  }

  /**
   * Sincroniza los nodos del modelo con el estado interno.
   * Los nodos nuevos se inicializan en su posición home.
   * Los nodos existentes actualizan solo su home (si el layout cambió).
   * Los nodos eliminados se limpian.
   */
  syncNodes(nodes: ReadonlyArray<FloatingNodeInput>): void {
    const seen = new Set<string>()

    for (const node of nodes) {
      seen.add(node.pubkey)
      const prev = this.nodeStates.get(node.pubkey)

      if (prev) {
        // Actualizar home — el layout puede haber cambiado
        prev.homeX = node.position[0]
        prev.homeY = node.position[1]
        prev.radius = node.radius
      } else {
        // Nodo nuevo: empieza exactamente en su posición home
        this.nodeStates.set(node.pubkey, {
          homeX: node.position[0],
          homeY: node.position[1],
          currentX: node.position[0],
          currentY: node.position[1],
          collisionVx: 0,
          collisionVy: 0,
          radius: node.radius,
          seedX: hashPubkeyToSeed(node.pubkey, 0),
          seedY: hashPubkeyToSeed(node.pubkey, 1),
        })
      }
    }

    // Limpiar nodos que ya no existen
    for (const pubkey of this.nodeStates.keys()) {
      if (!seen.has(pubkey)) {
        this.nodeStates.delete(pubkey)
        this.positions.delete(pubkey)
      }
    }
  }

  start(): void {
    if (this.rafId !== null) return
    this.startTime = performance.now()
    this.rafId = requestAnimationFrame(this.tick)
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  isRunning(): boolean {
    return this.rafId !== null
  }

  private tick = (): void => {
    const elapsed = (performance.now() - this.startTime) / 1000
    const t = elapsed * this.config.speed
    const { amplitude } = this.config

    // ── Paso 1: Actualizar posiciones via noise + spring ──────────────────────
    for (const [pubkey, state] of this.nodeStates) {
      // Offset flotante basado en simplex noise
      const noiseX = simplex2(state.seedX, t) * amplitude
      const noiseY = simplex2(state.seedY, t) * amplitude

      // Posición objetivo = home + flotación + impulso de colisión
      const targetX = state.homeX + noiseX + state.collisionVx
      const targetY = state.homeY + noiseY + state.collisionVy

      // Spring interpolation (easing 0.06 → movimiento lento y cinematográfico)
      state.currentX += (targetX - state.currentX) * 0.06
      state.currentY += (targetY - state.currentY) * 0.06

      // Amortiguación de velocidad de colisión
      state.collisionVx *= this.config.collisionDamping
      state.collisionVy *= this.config.collisionDamping

      // Umbral de limpieza (evita acumulación de floats ínfimos)
      if (Math.abs(state.collisionVx) < 0.005) state.collisionVx = 0
      if (Math.abs(state.collisionVy) < 0.005) state.collisionVy = 0

      this.positions.set(pubkey, [state.currentX, state.currentY])
    }

    // ── Paso 2: Resolver colisiones ───────────────────────────────────────────
    this.resolveCollisions()

    // ── Paso 3: Notificar al caller ───────────────────────────────────────────
    this.onFrame(this.positions)

    this.rafId = requestAnimationFrame(this.tick)
  }

  private resolveCollisions(): void {
    const nodes = Array.from(this.nodeStates.values())
    const { collisionPadding, maxPushDistance } = this.config

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]!
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]!

        const dx = a.currentX - b.currentX
        const dy = a.currentY - b.currentY
        const distSq = dx * dx + dy * dy
        const minDist = a.radius + b.radius + collisionPadding

        if (distSq < minDist * minDist && distSq > 0.001) {
          const dist = Math.sqrt(distSq)
          const overlap = minDist - dist
          // Fuerza proporcional al overlap, con techo
          const force = Math.min(overlap * 0.15, maxPushDistance)
          const nx = dx / dist
          const ny = dy / dist

          // Distribución simétrica del impulso
          a.collisionVx += nx * force * 0.5
          a.collisionVy += ny * force * 0.5
          b.collisionVx -= nx * force * 0.5
          b.collisionVy -= ny * force * 0.5
        }
      }
    }
  }
}
