# Propuesta: Nodos Flotantes con Colisiones Suaves

## Contexto Arquitectural

El sistema actual funciona asi:

```
Worker (buildGraphRenderModel)
  d3-force simula 90 ticks → posiciones estáticas
  ↓
GraphCanvas (React state)
  almacena GraphRenderModel con posiciones fijas
  ↓
DeckGraphRenderer → GraphSceneLayer
  getPosition: node => node.position  (estático, nunca cambia entre layouts)
```

**No existe**: animation loop continuo, drag de nodos individuales, ni movimiento post-layout.

El "isDragging" actual en DeckGraphRenderer se refiere al **pan del viewport**, no a mover nodos.

---

## Diseño: Capa de Animación Post-Layout

La animación flotante se implementa como una **capa de post-procesamiento** entre el modelo estático (del worker) y el render (Deck.gl). No modifica el pipeline de layout.

```
Worker → GraphRenderModel (posiciones estáticas = "home positions")
                ↓
        FloatingNodesController (main thread, rAF loop)
          ├─ Simplex noise → floating offset por nodo
          ├─ Collision detection → impulsos suaves
          ├─ Drag state → posición manual temporal
          └─ Spring return → retorno suave a home
                ↓
        positionOverrides: Map<pubkey, [x, y]>
                ↓
        GraphSceneLayer recibe overrides, usa en getPosition
```

### Por qué esta arquitectura

- **Cero cambios al worker**: el layout d3-force sigue igual
- **Cero cambios al store**: las "home positions" son las del modelo
- **Desacoplado**: si `floatingEnabled = false`, el override map está vacío y todo funciona como antes
- **Reversible**: el toggle apaga el rAF loop y las posiciones vuelven a las estáticas

---

## 1. FloatingNodesController

Clase imperativa (no React state) que corre un `requestAnimationFrame` loop y produce un mapa de posiciones animadas.

```typescript
// src/features/graph/render/floatingNodes.ts

type FloatingNodeState = {
  homePx: number        // home position X (del layout)
  homePy: number        // home position Y
  currentX: number      // posición renderizada actual
  currentY: number      // posición renderizada actual
  collisionVx: number   // velocidad por colisión
  collisionVy: number   // velocidad por colisión
  radius: number        // para detección de colisión
  noiseSeedX: number    // seed único por nodo (hash del pubkey)
  noiseSeedY: number
  isDragging: boolean
  dragTargetX: number
  dragTargetY: number
}

type FloatingConfig = {
  enabled: boolean
  // Flotación
  amplitude: number       // 3-8 unidades mundo (default: 5)
  speed: number           // 0.3-1.0 (default: 0.5)
  // Colisiones
  collisionDamping: number  // 0.90-0.96 (default: 0.93)
  maxPushDistance: number    // 4-12 unidades mundo (default: 6)
  collisionPadding: number  // 2-6 unidades extra al radio (default: 3)
  // Drag
  dragEasing: number        // 0.12-0.25 (default: 0.18)
}
```

### Loop Principal (simplificado)

```typescript
class FloatingNodesController {
  private states: Map<string, FloatingNodeState> = new Map()
  private config: FloatingConfig
  private rafId: number | null = null
  private startTime: number = 0
  private onUpdate: (overrides: Map<string, [number, number]>) => void

  start() {
    this.startTime = performance.now()
    this.tick()
  }

  private tick = () => {
    const elapsed = (performance.now() - this.startTime) / 1000
    const overrides = new Map<string, [number, number]>()

    // 1. Calcular offsets flotantes (Simplex noise)
    for (const [pubkey, state] of this.states) {
      if (state.isDragging) {
        // Durante drag: interpolar hacia cursor
        state.currentX += (state.dragTargetX - state.currentX) * this.config.dragEasing
        state.currentY += (state.dragTargetY - state.currentY) * this.config.dragEasing
      } else {
        // Flotación: home + noise offset + collision velocity
        const t = elapsed * this.config.speed
        const noiseX = simplex2(state.noiseSeedX, t) * this.config.amplitude
        const noiseY = simplex2(state.noiseSeedY, t) * this.config.amplitude

        const targetX = state.homePx + noiseX + state.collisionVx
        const targetY = state.homePy + noiseY + state.collisionVy

        // Suavizar transición (no saltar)
        state.currentX += (targetX - state.currentX) * 0.08
        state.currentY += (targetY - state.currentY) * 0.08
      }

      // Damping de velocidad por colisión
      state.collisionVx *= this.config.collisionDamping
      state.collisionVy *= this.config.collisionDamping

      // Limpiar velocidades despreciables
      if (Math.abs(state.collisionVx) < 0.01) state.collisionVx = 0
      if (Math.abs(state.collisionVy) < 0.01) state.collisionVy = 0

      overrides.set(pubkey, [state.currentX, state.currentY])
    }

    // 2. Detectar colisiones y aplicar impulsos
    this.resolveCollisions()

    // 3. Notificar al render
    this.onUpdate(overrides)

    this.rafId = requestAnimationFrame(this.tick)
  }

  private resolveCollisions() {
    const entries = Array.from(this.states.entries())
    const padding = this.config.collisionPadding
    const maxPush = this.config.maxPushDistance

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [, a] = entries[i]
        const [, b] = entries[j]

        const dx = a.currentX - b.currentX
        const dy = a.currentY - b.currentY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = a.radius + b.radius + padding

        if (dist < minDist && dist > 0) {
          const overlap = minDist - dist
          // Fuerza proporcional al overlap, capped
          const force = Math.min(overlap * 0.15, maxPush)
          const nx = dx / dist  // normal unitaria
          const ny = dy / dist

          a.collisionVx += nx * force * 0.5
          a.collisionVy += ny * force * 0.5
          b.collisionVx -= nx * force * 0.5
          b.collisionVy -= ny * force * 0.5
        }
      }
    }
  }

  // Llamado cuando llega un nuevo GraphRenderModel del worker
  syncModel(model: GraphRenderModel) {
    const existing = new Set(this.states.keys())

    for (const node of model.nodes) {
      const prev = this.states.get(node.pubkey)
      if (prev) {
        // Actualizar home (puede cambiar si se re-layouteó)
        prev.homePx = node.position[0]
        prev.homePy = node.position[1]
        prev.radius = node.radius
        existing.delete(node.pubkey)
      } else {
        // Nodo nuevo: inicializar en su home
        this.states.set(node.pubkey, {
          homePx: node.position[0],
          homePy: node.position[1],
          currentX: node.position[0],
          currentY: node.position[1],
          collisionVx: 0,
          collisionVy: 0,
          radius: node.radius,
          noiseSeedX: hashPubkey(node.pubkey, 0),
          noiseSeedY: hashPubkey(node.pubkey, 1),
          isDragging: false,
          dragTargetX: 0,
          dragTargetY: 0,
        })
      }
    }

    // Remover nodos que ya no existen
    for (const gone of existing) {
      this.states.delete(gone)
    }
  }

  // Drag: llamado desde DeckGraphRenderer
  startDrag(pubkey: string) {
    const state = this.states.get(pubkey)
    if (state) {
      state.isDragging = true
      state.dragTargetX = state.currentX
      state.dragTargetY = state.currentY
    }
  }

  updateDrag(pubkey: string, worldX: number, worldY: number) {
    const state = this.states.get(pubkey)
    if (state) {
      state.dragTargetX = worldX
      state.dragTargetY = worldY
    }
  }

  endDrag(pubkey: string) {
    const state = this.states.get(pubkey)
    if (state) {
      state.isDragging = false
      // Nueva home = donde lo soltó
      state.homePx = state.currentX
      state.homePy = state.currentY
      state.collisionVx = 0
      state.collisionVy = 0
    }
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }
}
```

---

## 2. Integración con el Pipeline de Render

### 2.1 GraphSceneLayer: Aceptar Position Overrides

```diff
// GraphSceneLayer.ts

type GraphSceneLayerProps = {
  model: GraphRenderModel
+ positionOverrides: ReadonlyMap<string, [number, number]> | null
  hoveredNodePubkey: string | null
  // ... resto igual
}
```

En todos los sub-layers, el `getPosition` cambia de:

```typescript
// ANTES
getPosition: (node) => node.position

// DESPUÉS  
getPosition: (node) => this.props.positionOverrides?.get(node.pubkey) ?? node.position
```

Esto se aplica a:
- ScatterplotLayer (nodos)
- IconLayer (avatares)
- TextLayer (labels)
- Para edges: recalcular `sourcePosition`/`targetPosition` desde los overrides

### 2.2 Edge Positions con Overrides

Los edges necesitan actualizarse cuando los nodos se mueven:

```typescript
// En el LineLayer de edges
getSourcePosition: (edge) => 
  this.props.positionOverrides?.get(edge.source) ?? edge.sourcePosition,
getTargetPosition: (edge) => 
  this.props.positionOverrides?.get(edge.target) ?? edge.targetPosition,
```

Para edges curvos (graphSceneGeometry), las curvas se recalculan en cada frame solo si hay overrides activos. Si el costo es alto, se degrada a líneas rectas durante la animación.

### 2.3 GraphCanvas: Orquestar el Controller

```typescript
// En GraphCanvas.tsx

const floatingControllerRef = useRef<FloatingNodesController | null>(null)
const [positionOverrides, setPositionOverrides] = useState<
  Map<string, [number, number]> | null
>(null)

// Inicializar controller
useEffect(() => {
  if (!renderConfig.floatingEnabled) {
    floatingControllerRef.current?.stop()
    setPositionOverrides(null)
    return
  }

  const controller = new FloatingNodesController({
    config: FLOATING_CINEMATIC_PRESET,
    onUpdate: setPositionOverrides, // Trigger re-render con nuevas posiciones
  })

  floatingControllerRef.current = controller
  controller.start()

  return () => controller.stop()
}, [renderConfig.floatingEnabled])

// Sincronizar cuando llega nuevo modelo del worker
useEffect(() => {
  floatingControllerRef.current?.syncModel(currentModel)
}, [currentModel])
```

### 2.4 DeckGraphRenderer: Node Dragging

Agregar detección de drag individual sobre nodos:

```typescript
// DeckGraphRenderer.tsx

// Estado de drag
const nodeDragRef = useRef<{
  pubkey: string
  startScreenPos: [number, number]
} | null>(null)

// En onClick → convertir a onMouseDown detección
// Cuando se detecta mousedown sobre un nodo + mousemove > threshold:
//   1. Activar modo drag (nodeDragRef.current = { pubkey, startPos })
//   2. Llamar floatingController.startDrag(pubkey)
//   3. En cada mousemove: convertir screen→world, llamar updateDrag
//   4. En mouseup: llamar endDrag, limpiar nodeDragRef

// Deck.gl provee `onDrag` en el controller config:
// Se necesita custom controller o event listeners en el canvas
```

**Importante**: Deck.gl no tiene drag nativo de objetos individuales. Se necesita:
1. Detectar `mousedown` sobre un nodo (via picking)
2. Capturar `mousemove` en el canvas
3. Convertir coordenadas screen→world via `deck.viewManager.unproject()`
4. Suprimir el pan del viewport mientras se arrastra un nodo

---

## 3. Rendimiento

### 3.1 Colisiones O(n^2)

Para grafos tipicos de este proyecto (~50-500 nodos), O(n^2) es aceptable:
- 100 nodos = 4,950 pares → ~0.2ms
- 300 nodos = 44,850 pares → ~1.5ms
- 500 nodos = 124,750 pares → ~4ms (limite)

**Si n > 300**: usar spatial hashing (grid de celdas). Divide el espacio en celdas del tamaño del radio máximo de colisión. Solo chequear pares dentro de la misma celda y vecinas.

```typescript
// Spatial hash simple
class SpatialGrid {
  private cellSize: number
  private cells: Map<string, FloatingNodeState[]> = new Map()

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`
  }

  rebuild(nodes: FloatingNodeState[]) {
    this.cells.clear()
    for (const node of nodes) {
      const k = this.key(node.currentX, node.currentY)
      const cell = this.cells.get(k)
      if (cell) cell.push(node)
      else this.cells.set(k, [node])
    }
  }

  // Solo chequear 9 celdas vecinas en lugar de todos los nodos
  getNeighbors(x: number, y: number): FloatingNodeState[] { ... }
}
```

### 3.2 Presupuesto de Frame

Target: **< 4ms** por frame (de 16.67ms @ 60fps).

| Operación | Costo estimado |
|-----------|---------------|
| Simplex noise (200 nodos) | ~0.3ms |
| Colisión brute-force (200 nodos) | ~0.8ms |
| Position interpolation | ~0.1ms |
| Map creation + React setState | ~0.5ms |
| **Total** | **~1.7ms** |

### 3.3 Throttle de React Updates

`setPositionOverrides` dispara re-render de React. Para evitar GC pressure:

```typescript
// Opción 1: Mutar el mismo Map (con setNeedsRedraw en Deck.gl)
// Opción 2: Double-buffer con dos Maps alternantes
// Opción 3: Usar un ref + forceUpdate throttled

// Recomendación: ref + setNeedsRedraw
const overridesRef = useRef(new Map<string, [number, number]>())

// En el controller callback:
onUpdate: (overrides) => {
  overridesRef.current = overrides
  deckRef.current?.setNeedsRedraw('floating animation')
}
```

Esto evita re-renders de React y deja que Deck.gl maneje el redraw eficientemente.

### 3.4 Degradación Automática

```typescript
// Si el frame budget se excede, reducir calidad progresivamente
if (frameDelta > 20) { // >20ms = por debajo de 50fps
  // Paso 1: Reducir frecuencia de colisiones (cada 2 frames)
  this.collisionSkipCounter = 2
}
if (frameDelta > 33) { // >33ms = por debajo de 30fps
  // Paso 2: Desactivar colisiones, solo flotación
  this.collisionEnabled = false
}
if (frameDelta > 50) { // Muy lento
  // Paso 3: Reducir a 30fps (skip frame alternos)
  this.targetFps = 30
}
```

---

## 4. Simplex Noise (sin dependencias externas)

Implementar inline (~80 líneas). No necesita librería.

```typescript
// Simplex 2D minimal - basado en Stefan Gustavson's implementation
// Retorna valor entre -1 y 1

const GRAD2 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]
const PERM = new Uint8Array(512)

// Inicializar permutación una vez
function initSimplex(seed: number) {
  // ... ~30 líneas, standard simplex setup
}

function simplex2(x: number, y: number): number {
  // ... ~50 líneas, standard 2D simplex
}

// Hash del pubkey para seed único por nodo
function hashPubkey(pubkey: string, axis: number): number {
  let h = 0x811c9dc5 ^ axis
  for (let i = 0; i < 8; i++) { // primeros 8 chars suficientes
    h ^= pubkey.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 0xffffffff * 100 // escalar a rango útil
}
```

---

## 5. Configuración en RenderConfig

### 5.1 Extensión del tipo

```diff
// app/store/types.ts
export interface RenderConfig {
  edgeThickness: number
  arrowType: ArrowType
  nodeSpacingFactor: number
  nodeSizeFactor: number
  autoSizeNodes: boolean
  imageQualityMode: ImageQualityMode
  // ... existentes
+ floatingEnabled: boolean
+ floatingPreset: 'cinematic' | 'subtle' | 'dramatic'
}
```

### 5.2 Presets

```typescript
const FLOATING_PRESETS = {
  cinematic: {
    amplitude: 5,
    speed: 0.5,
    collisionDamping: 0.93,
    maxPushDistance: 6,
    collisionPadding: 3,
    dragEasing: 0.18,
  },
  subtle: {
    amplitude: 2,
    speed: 0.7,
    collisionDamping: 0.96,
    maxPushDistance: 3,
    collisionPadding: 2,
    dragEasing: 0.22,
  },
  dramatic: {
    amplitude: 10,
    speed: 0.35,
    collisionDamping: 0.88,
    maxPushDistance: 10,
    collisionPadding: 5,
    dragEasing: 0.12,
  },
} as const
```

### 5.3 Lo que cada parámetro controla visualmente

| Parámetro | Bajo | Alto | Efecto visual |
|-----------|------|------|---------------|
| `amplitude` | 2 | 10 | Rango de desplazamiento. 2 = tiembla sutil. 10 = nodos "exploran" |
| `speed` | 0.3 | 1.0 | Velocidad. 0.3 = lento y majestuoso. 1.0 = nervioso |
| `collisionDamping` | 0.88 | 0.96 | 0.88 = rebote breve y seco. 0.96 = desliza lejos antes de frenar |
| `maxPushDistance` | 3 | 10 | Tope de repulsión. 3 = apenas se nota. 10 = empujón visible |
| `collisionPadding` | 2 | 6 | Zona de detección extra. Mayor = colisionan "antes" de tocarse |
| `dragEasing` | 0.12 | 0.25 | 0.12 = sigue el cursor con lag pesado. 0.25 = casi inmediato |

---

## 6. Drag de Nodos Individuales

### El problema con Deck.gl

Deck.gl no soporta drag de objetos individuales. Su `controller` maneja pan/zoom del viewport. Para drag de nodos necesitamos interceptar eventos a nivel más bajo.

### Solución

```typescript
// En DeckGraphRenderer o un hook dedicado useNodeDrag

function useNodeDrag(
  deckRef: RefObject<DeckGL>,
  floatingController: FloatingNodesController | null,
  onHoverChange: (pubkey: string | null) => void,
) {
  const dragStateRef = useRef<{
    pubkey: string
    active: boolean
  } | null>(null)

  const handlePointerDown = useCallback((info: PickingInfo) => {
    const pubkey = resolvePickedPubkey(info.object)
    if (!pubkey || !floatingController) return

    // Marcar intención de drag (se activa en pointerMove si hay movimiento)
    dragStateRef.current = { pubkey, active: false }
  }, [floatingController])

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const drag = dragStateRef.current
    if (!drag || !floatingController || !deckRef.current) return

    if (!drag.active) {
      drag.active = true
      floatingController.startDrag(drag.pubkey)
      // IMPORTANTE: deshabilitar pan del viewport
      // Deck.gl: controller={{ dragPan: false }} temporalmente
    }

    // Convertir screen → world coordinates
    const viewport = deckRef.current.viewManager?.getViewport('graph-view')
    if (!viewport) return
    const [worldX, worldY] = viewport.unproject([event.clientX, event.clientY])

    floatingController.updateDrag(drag.pubkey, worldX, worldY)
  }, [floatingController])

  const handlePointerUp = useCallback(() => {
    const drag = dragStateRef.current
    if (!drag?.active || !floatingController) return

    floatingController.endDrag(drag.pubkey)
    dragStateRef.current = null
    // Restaurar pan del viewport
  }, [floatingController])

  return { handlePointerDown, handlePointerMove, handlePointerUp }
}
```

### Flujo de Drag

```
1. PointerDown sobre nodo
   → Marcar pubkey como "pendiente de drag"
   → No activar aún (podría ser click)

2. PointerMove (> 3px de threshold)
   → Activar drag: floatingController.startDrag(pubkey)
   → Deshabilitar viewport pan temporalmente
   → Cursor → "grabbing"
   → En cada move: unproject(screenPos) → updateDrag(worldPos)

3. PointerUp
   → endDrag(pubkey): nueva home = posición actual
   → Restaurar viewport pan
   → El nodo continúa flotando desde donde lo soltaste
   → Cursor → "grab"
```

---

## 7. Experiencia Cinematográfica: Los Detalles

### 7.1 Movimiento Orgánico

El Simplex noise genera trayectorias curvas, no lineales. Cada nodo tiene seeds independientes, asi que:
- Nunca se mueven en sincronía (no parece robótico)
- El patrón nunca se repite de forma obvia (ruido, no seno)
- El eje X e Y tienen seeds distintos, asi que se mueven en curvas, no en líneas rectas

### 7.2 Colisiones "Blandas"

La colisión no es instantánea como en un motor de física. El impulso se aplica gradualmente y se amortigua con damping:

```
Frame 0: Nodos se tocan
Frame 1: Impulso pequeño (overlap * 0.15)
Frame 2-5: El impulso mueve el nodo, pero el damping (0.93) lo frena
Frame 6-15: El nodo desacelera y el noise lo devuelve a su zona
Frame 20+: Como si nada hubiera pasado
```

Resultado visual: un "empujón suave" que se absorbe naturalmente.

### 7.3 Drag con Peso

El `dragEasing: 0.18` hace que el nodo no salte al cursor sino que lo persiga con un pequeño retraso. Esto da sensación de masa y peso, como si el nodo tuviera inercia.

### 7.4 Transición al Soltar

Cuando sueltas un nodo:
1. Su nueva `home` es donde lo soltaste
2. El noise continúa desde esa posición (sin salto)
3. Si otros nodos están cerca, las colisiones los empujan suavemente

### 7.5 Edges Vivos

Los edges siguen a los nodos. Como los nodos flotan, los edges ondean suavemente. Esto da vida al grafo completo, no solo a los nodos.

---

## 8. Archivos a Crear/Modificar

### Nuevos

| Archivo | Contenido |
|---------|-----------|
| `render/floatingNodes.ts` | FloatingNodesController, simplex noise, spatial hash |

### Modificados

| Archivo | Cambio |
|---------|--------|
| `render/GraphSceneLayer.ts` | Prop `positionOverrides`, usarlo en `getPosition` de todos los sub-layers |
| `render/DeckGraphRenderer.tsx` | Props para overrides, node drag handling, cursor states |
| `components/GraphCanvas.tsx` | Instanciar controller, pasar overrides, sincronizar modelo |
| `app/store/types.ts` | Agregar `floatingEnabled`, `floatingPreset` a `RenderConfig` |
| `app/store/slices/uiSlice.ts` | Default values para floating config |
| `render/graphSceneGeometry.ts` | Aceptar position overrides para recalcular curvas de edges (o degradar a rectas) |

### No se toca

- `buildGraphRenderModel.ts` - el layout sigue igual
- `graph.worker.ts` - no cambia
- Workers - no cambian
- Store slices (excepto uiSlice defaults) - no cambian

---

## 9. Plan de Implementación por Fases

### Fase 1: Flotación Básica
1. Implementar simplex noise inline
2. Crear `FloatingNodesController` solo con flotación (sin colisiones ni drag)
3. Agregar `positionOverrides` a `GraphSceneLayer`
4. Integrar en `GraphCanvas` con toggle

**Resultado**: nodos flotan suavemente. Se puede validar el feel visual.

### Fase 2: Colisiones
1. Agregar detección de colisiones al controller
2. Implementar spatial hash si hay > 300 nodos
3. Tuning del damping y maxPushDistance

**Resultado**: nodos se empujan suavemente al acercarse.

### Fase 3: Node Drag
1. Implementar `useNodeDrag` hook
2. Integrar con el controller
3. Manejar supresión de viewport pan durante drag
4. Actualizar cursor states

**Resultado**: feature completa.

### Fase 4: Polish
1. Degradación automática por frame budget
2. Presets (cinematic/subtle/dramatic) en UI
3. Edge animation (recalcular curvas o degradar a rectas)

---

## 10. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| rAF + React setState = GC pressure | Micro-stutters | Usar ref + setNeedsRedraw en vez de setState |
| Colisiones O(n^2) con 500+ nodos | Frame drops | Spatial hash automático + degradación |
| Drag conflicta con viewport pan | UX confusa | Threshold de movimiento + detección de picking |
| Edges curvos recalculados cada frame | CPU cost | Degradar a rectas durante animación, restaurar curvas al pausar |
| Nuevo modelo del worker resetea posiciones | Salto visual | `syncModel` interpola home positions en vez de saltar |
