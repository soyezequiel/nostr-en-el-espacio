import assert from 'node:assert/strict'
import test from 'node:test'

import { buildExpansionVisibilityHint } from '@/features/graph-v2/ui/expansionVisibilityHint'

test('explains that the cap applies to the full graph when the active layer hides nodes', () => {
  assert.equal(
    buildExpansionVisibilityHint({
      activeLayer: 'mutuals',
      totalGraphNodeCount: 3000,
      visibleNodeCount: 319,
      maxGraphNodes: 3000,
      capReached: true,
      expansionMessage:
        '1308 follows descubiertos desde cache local (457 nodos nuevos en el grafo), pero 602 no entraron por el cap de 3000 nodos.',
    }),
    'Estas mirando "Mutuos": el canvas muestra 319 nodos, pero el grafo total cargado tiene 3.000 / 3.000. El cap aplica sobre ese total, no sobre la capa visible.',
  )
})

test('returns null when the visible layer already matches the full graph', () => {
  assert.equal(
    buildExpansionVisibilityHint({
      activeLayer: 'mutuals',
      totalGraphNodeCount: 319,
      visibleNodeCount: 319,
      maxGraphNodes: 3000,
      capReached: true,
      expansionMessage:
        '1308 follows descubiertos desde cache local (457 nodos nuevos en el grafo), pero 602 no entraron por el cap de 3000 nodos.',
    }),
    null,
  )
})

test('returns null when the message is unrelated to the node cap', () => {
  assert.equal(
    buildExpansionVisibilityHint({
      activeLayer: 'mutuals',
      totalGraphNodeCount: 900,
      visibleNodeCount: 319,
      maxGraphNodes: 3000,
      capReached: false,
      expansionMessage: 'Nodo 5edabf5a... ya fue expandido.',
    }),
    null,
  )
})
