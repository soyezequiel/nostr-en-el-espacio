import assert from 'node:assert/strict'
import test from 'node:test'

import { getZoomResponsiveNodeSizeFactor } from './visibleGeometry'

test('keeps node size unchanged at close and default zoom levels', () => {
  assert.equal(
    getZoomResponsiveNodeSizeFactor({ nodeSizeFactor: 0.88, zoom: 1 }),
    0.88,
  )
  assert.equal(
    getZoomResponsiveNodeSizeFactor({ nodeSizeFactor: 0.88, zoom: 3 }),
    0.88,
  )
})

test('shrinks nodes smoothly as the user zooms far out', () => {
  const midOverviewFactor = getZoomResponsiveNodeSizeFactor({
    nodeSizeFactor: 0.88,
    zoom: 0,
  })
  const farOverviewFactor = getZoomResponsiveNodeSizeFactor({
    nodeSizeFactor: 0.88,
    zoom: -2,
  })

  assert.ok(midOverviewFactor < 0.88)
  assert.ok(farOverviewFactor < midOverviewFactor)
  assert.ok(farOverviewFactor > 0)
})

