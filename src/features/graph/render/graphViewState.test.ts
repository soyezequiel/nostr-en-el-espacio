import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createFittedGraphViewState,
  createGraphFitSignature,
} from './graphViewState'

test('createGraphFitSignature invalidates cached framing when topology changes', () => {
  const globalSignature = createGraphFitSignature({
    topologySignature: 'graph:12n:24e:global-a',
    width: 1280,
    height: 720,
  })
  const expandedSignature = createGraphFitSignature({
    topologySignature: 'graph:18n:31e:global-b',
    width: 1280,
    height: 720,
  })

  assert.notEqual(globalSignature, expandedSignature)
})

test('createFittedGraphViewState centers the full graph bounds and zooms tighter for smaller global extents', () => {
  const broadViewState = createFittedGraphViewState({
    bounds: {
      minX: -18,
      maxX: 1212,
      minY: -18,
      maxY: 912,
    },
    width: 1280,
    height: 720,
  })
  const tighterViewState = createFittedGraphViewState({
    bounds: {
      minX: -18,
      maxX: 190,
      minY: -18,
      maxY: 45,
    },
    width: 1280,
    height: 720,
  })

  assert.deepEqual(broadViewState.target, [597, 447, 0])
  assert.ok(tighterViewState.zoom > broadViewState.zoom)
})
