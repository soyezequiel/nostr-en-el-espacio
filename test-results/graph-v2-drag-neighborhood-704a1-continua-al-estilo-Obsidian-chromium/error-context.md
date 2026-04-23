# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: graph-v2-drag-neighborhood.spec.ts >> arrastra un nodo real con influencia elastica continua al estilo Obsidian
- Location: tests\graph-v2-drag-neighborhood.spec.ts:181:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic:
      - generic [ref=e12]:
        - generic [ref=e15]: RF
        - generic [ref=e16]:
          - generic [ref=e17]: Identidad raíz
          - generic [ref=e18]: Root Fixture
        - button "Cambiar" [ref=e19] [cursor=pointer]
      - generic [ref=e20]:
        - generic [ref=e21]:
          - combobox "Formato de imagen" [ref=e22]:
            - option "wide" [selected]
            - option "square"
            - option "story"
          - button "Compartir imagen" [ref=e23] [cursor=pointer]:
            - img [ref=e24]
            - generic [ref=e29]: Compartir imagen
        - generic [ref=e30]:
          - link "Nostr Espacial" [ref=e31] [cursor=pointer]:
            - /url: /
            - img "Nostr Espacial" [ref=e33]
          - generic [ref=e34]: v0.3.2
    - region "Filtros del grafo":
      - generic [ref=e35]:
        - 'button "Toda la red: Vista base: raiz, follows salientes, followers entrantes y nodos expandidos." [ref=e36] [cursor=pointer]':
          - text: Toda la red
          - generic [ref=e38]: "40"
        - 'button "A quienes sigo: A quienes sigo: follows salientes desde la raiz y desde nodos expandidos." [ref=e39] [cursor=pointer]':
          - text: A quienes sigo
          - generic [ref=e41]: "-"
        - 'button "Me siguen: Me siguen: follows entrantes hacia la raiz y nodos expandidos." [ref=e42] [cursor=pointer]':
          - text: Me siguen
          - generic [ref=e44]: "-"
        - 'button "Mutuos: Mutuos: relacion de ida y vuelta confirmada." [ref=e45] [cursor=pointer]':
          - text: Mutuos
          - generic [ref=e47]: "-"
        - 'button "Sin reciprocidad: Sin reciprocidad: vinculo confirmado de un solo lado." [ref=e48] [cursor=pointer]':
          - text: Sin reciprocidad
          - generic [ref=e50]: "-"
        - 'button "Conexiones: Conexiones: solo mutuos de raiz y expandidos." [ref=e51] [cursor=pointer]':
          - text: Conexiones
          - generic [ref=e53]: mutuos
    - generic [ref=e54]:
      - button "Ajustes" [ref=e56] [cursor=pointer]:
        - img [ref=e57]
        - text: Ajustes
      - button "Notificaciones (0)" [ref=e61] [cursor=pointer]:
        - img [ref=e62]
        - text: Notificaciones (0)
      - button "Inspector de runtime (Shift + D)" [ref=e65] [cursor=pointer]:
        - img [ref=e66]
        - text: Inspector de runtime (Shift + D)
      - button "Pausar física" [ref=e69] [cursor=pointer]:
        - img [ref=e70]
        - text: Pausar física
      - button "Ocultar zaps" [ref=e76] [cursor=pointer]:
        - img [ref=e77]
        - text: Ocultar zaps
      - button "Recentrar vista" [ref=e81] [cursor=pointer]:
        - img [ref=e82]
        - text: Recentrar vista
      - button "Relays al día" [ref=e86] [cursor=pointer]:
        - img [ref=e87]
        - text: Relays al día
      - button "Buscar persona (/)" [ref=e92] [cursor=pointer]:
        - img [ref=e93]
        - text: Buscar persona (/)
    - generic [ref=e97]:
      - generic [ref=e98]:
        - generic [ref=e99]: Nodos
        - generic [ref=e100]: "40"
      - generic [ref=e101]:
        - generic [ref=e102]: Aristas
        - generic [ref=e103]: "56"
      - generic [ref=e104]:
        - generic [ref=e105]: Visibles
        - generic [ref=e106]: "56"
      - generic [ref=e107]:
        - generic [ref=e108]: Física
        - generic [ref=e109]: activa
      - generic [ref=e110]:
        - generic [ref=e111]: Relays
        - generic [ref=e112]: 1/1
      - generic [ref=e113]:
        - generic [ref=e114]: Frame
        - generic [ref=e115]: 15.0ms
    - generic [ref=e116]:
      - generic [ref=e117]:
        - generic [ref=e118]: MAPA
        - generic [ref=e119]: —
      - generic [ref=e122]:
        - button "＋" [ref=e123] [cursor=pointer]
        - button "−" [ref=e125] [cursor=pointer]
        - button "fit" [ref=e127] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e133] [cursor=pointer]:
    - img [ref=e134]
  - alert [ref=e137]
```

# Test source

```ts
  129 |   return Object.fromEntries(
  130 |     entries.filter((entry): entry is readonly [string, DebugNodePosition] => Boolean(entry[1])),
  131 |   )
  132 | }
  133 | 
  134 | const meanDisplacement = (
  135 |   baseline: Record<string, DebugNodePosition>,
  136 |   current: Record<string, DebugNodePosition>,
  137 |   pubkeys: readonly string[],
  138 | ) => {
  139 |   const displacements = pubkeys
  140 |     .map((pubkey) => {
  141 |       const initial = baseline[pubkey]
  142 |       const next = current[pubkey]
  143 |       return initial && next ? distance(initial, next) : null
  144 |     })
  145 |     .filter((value): value is number => value !== null)
  146 | 
  147 |   if (displacements.length === 0) {
  148 |     return 0
  149 |   }
  150 | 
  151 |   return displacements.reduce((sum, value) => sum + value, 0) / displacements.length
  152 | }
  153 | 
  154 | const collectTrackedNodes = async (page: Page): Promise<SampledNodes> => {
  155 |   const [target, depth1, depth2, depth3, outside, pinned] = await Promise.all([
  156 |     getNodePosition(page, TARGET_PUBKEY),
  157 |     getNodePosition(page, DEPTH1_MOVABLE_PUBKEY),
  158 |     getNodePosition(page, DEPTH2_PUBKEY),
  159 |     getNodePosition(page, DEPTH3_PUBKEY),
  160 |     getNodePosition(page, OUTSIDE_PUBKEY),
  161 |     getNodePosition(page, PINNED_NEIGHBOR_PUBKEY),
  162 |   ])
  163 | 
  164 |   expect(target).not.toBeNull()
  165 |   expect(depth1).not.toBeNull()
  166 |   expect(depth2).not.toBeNull()
  167 |   expect(depth3).not.toBeNull()
  168 |   expect(outside).not.toBeNull()
  169 |   expect(pinned).not.toBeNull()
  170 | 
  171 |   return {
  172 |     target: target!,
  173 |     depth1: depth1!,
  174 |     depth2: depth2!,
  175 |     depth3: depth3!,
  176 |     outside: outside!,
  177 |     pinned: pinned!,
  178 |   }
  179 | }
  180 | 
  181 | test('arrastra un nodo real con influencia elastica continua al estilo Obsidian', async ({
  182 |   page,
  183 | }, testInfo) => {
  184 |   const metrics: DragMetrics = {
  185 |     selectedBeforeDrag: null,
  186 |     selectedAfterDrag: null,
  187 |     pinnedNeighborPubkey: null,
  188 |     candidatePubkey: null,
  189 |     degree: null,
  190 |     cursorDistancePx: [],
  191 |     meanDisplacements: {},
  192 |     pinnedDisplacement: null,
  193 |     residuals: [],
  194 |   }
  195 | 
  196 |   try {
  197 |     await page.goto(SIGMA_LAB_URL)
  198 |     await page.waitForFunction(
  199 |       () =>
  200 |         typeof window.__sigmaLabDebug !== 'undefined' &&
  201 |         window.__sigmaLabDebug !== null &&
  202 |         window.__sigmaLabDebug.findDragCandidate()?.pubkey === 'fixture-drag-target',
  203 |     )
  204 |     await expect.poll(() => getViewportPosition(page, TARGET_PUBKEY)).not.toBeNull()
  205 |     await expect.poll(() => getNodePosition(page, TARGET_PUBKEY)).not.toBeNull()
  206 | 
  207 |     const candidate = await page.evaluate(
  208 |       () => window.__sigmaLabDebug?.findDragCandidate({ minDegree: 3, maxDegree: 10 }) ?? null,
  209 |     )
  210 |     expect(candidate).toMatchObject({
  211 |       pubkey: TARGET_PUBKEY,
  212 |     })
  213 | 
  214 |     metrics.candidatePubkey = candidate?.pubkey ?? null
  215 |     metrics.degree = candidate?.degree ?? null
  216 | 
  217 |     const neighborGroups = await getNeighborGroups(page, TARGET_PUBKEY)
  218 |     expect(neighborGroups).not.toBeNull()
  219 |     expect(neighborGroups).toMatchObject({
  220 |       sourcePubkey: TARGET_PUBKEY,
  221 |     })
  222 |     expect(neighborGroups?.depth1).toContain(PINNED_NEIGHBOR_PUBKEY)
  223 |     expect(neighborGroups?.depth1).toContain(DEPTH1_MOVABLE_PUBKEY)
  224 |     expect(neighborGroups?.depth2).toContain(DEPTH2_PUBKEY)
  225 |     expect(neighborGroups?.depth3).toContain(DEPTH3_PUBKEY)
  226 |     expect(neighborGroups?.outside).toContain(OUTSIDE_PUBKEY)
  227 | 
  228 |     metrics.pinnedNeighborPubkey = PINNED_NEIGHBOR_PUBKEY
> 229 |     expect(await getFixedState(page, PINNED_NEIGHBOR_PUBKEY)).toBe(true)
      |                                                               ^ Error: expect(received).toBe(expected) // Object.is equality
  230 |     const initialPinnedSelection = await getSelectionState(page)
  231 |     expect(initialPinnedSelection?.pinnedNodePubkeys).toContain(PINNED_NEIGHBOR_PUBKEY)
  232 | 
  233 |     const baselineRuntimeState = await getDragRuntimeState(page)
  234 |     expect(baselineRuntimeState).toMatchObject({
  235 |       draggedNodePubkey: null,
  236 |       forceAtlasRunning: true,
  237 |       forceAtlasSuspended: false,
  238 |     })
  239 | 
  240 |     const baselineSelection = await getSelectionState(page)
  241 |     expect(baselineSelection).toMatchObject({
  242 |       selectedNodePubkey: null,
  243 |     })
  244 | 
  245 |     const trackedPubkeys = [
  246 |       TARGET_PUBKEY,
  247 |       ...neighborGroups!.depth1,
  248 |       ...neighborGroups!.depth2,
  249 |       ...neighborGroups!.depth3,
  250 |       ...neighborGroups!.outside,
  251 |     ]
  252 |     const movableDepth1Pubkeys = neighborGroups!.depth1.filter(
  253 |       (pubkey) => pubkey !== PINNED_NEIGHBOR_PUBKEY,
  254 |     )
  255 |     await clickNodeUntilSelected(page, TARGET_PUBKEY)
  256 | 
  257 |     const selectionAfterClick = await getSelectionState(page)
  258 |     metrics.selectedBeforeDrag = selectionAfterClick?.selectedNodePubkey ?? null
  259 | 
  260 |     const baselinePositions = await collectTrackedNodes(page)
  261 |     const baselineGroupPositions = await collectPositions(page, trackedPubkeys)
  262 | 
  263 |     const start = await getViewportPosition(page, TARGET_PUBKEY)
  264 |     expect(start).not.toBeNull()
  265 |     await page.mouse.move(start!.clientX, start!.clientY)
  266 |     await page.mouse.down()
  267 | 
  268 |     const totalDx = 120
  269 |     const totalDy = 72
  270 |     const steps = 8
  271 |     const dragSamples: Array<{
  272 |       viewport: DebugViewportPosition
  273 |       runtime: DebugDragRuntimeState | null
  274 |       position: DebugNodePosition
  275 |       cursorErrorPx: number
  276 |     }> = []
  277 | 
  278 |     for (let step = 1; step <= steps; step += 1) {
  279 |       const nextX = start!.clientX + (totalDx * step) / steps
  280 |       const nextY = start!.clientY + (totalDy * step) / steps
  281 |       await page.mouse.move(nextX, nextY, { steps: 1 })
  282 |       await page.waitForTimeout(32)
  283 |       const dragRuntimeState = await getDragRuntimeState(page)
  284 |       const viewport = await getViewportPosition(page, TARGET_PUBKEY)
  285 |       const position = await getNodePosition(page, TARGET_PUBKEY)
  286 |       expect(viewport).not.toBeNull()
  287 |       expect(position).not.toBeNull()
  288 | 
  289 |       const cursorErrorPx = Math.hypot(viewport!.clientX - nextX, viewport!.clientY - nextY)
  290 |       metrics.cursorDistancePx.push(cursorErrorPx)
  291 |       dragSamples.push({
  292 |         viewport: viewport!,
  293 |         runtime: dragRuntimeState,
  294 |         position: position!,
  295 |         cursorErrorPx,
  296 |       })
  297 |     }
  298 | 
  299 |     const lastCursorX = start!.clientX + totalDx
  300 |     const lastCursorY = start!.clientY + totalDy
  301 |     await expect
  302 |       .poll(async () => {
  303 |         const viewport = await getViewportPosition(page, TARGET_PUBKEY)
  304 |         if (!viewport) {
  305 |           return Number.POSITIVE_INFINITY
  306 |         }
  307 | 
  308 |         return Math.hypot(viewport.clientX - lastCursorX, viewport.clientY - lastCursorY)
  309 |       })
  310 |       .toBeLessThan(18)
  311 |     const duringDragPositions = await collectTrackedNodes(page)
  312 |     const duringDragGroupPositions = await collectPositions(page, trackedPubkeys)
  313 | 
  314 |     for (const sample of dragSamples) {
  315 |       expect(sample.runtime).toMatchObject({
  316 |         draggedNodePubkey: TARGET_PUBKEY,
  317 |         forceAtlasSuspended: true,
  318 |         forceAtlasRunning: false,
  319 |       })
  320 |       expect(sample.cursorErrorPx).toBeLessThan(18)
  321 |     }
  322 | 
  323 |     const runtimeDuringDrag = await getDragRuntimeState(page)
  324 |     expect(runtimeDuringDrag?.influencedNodeCount ?? 0).toBeGreaterThanOrEqual(6)
  325 |     expect(runtimeDuringDrag?.maxHopDistance ?? 0).toBeGreaterThanOrEqual(3)
  326 |     expect(
  327 |       runtimeDuringDrag?.influenceHopSample.some(
  328 |         (entry) => entry.pubkey === DEPTH3_PUBKEY && entry.hopDistance === 3,
  329 |       ) ?? false,
```