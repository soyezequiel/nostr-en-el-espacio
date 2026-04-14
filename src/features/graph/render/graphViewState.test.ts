import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createFittedGraphViewState,
  createGraphFitSignature,
} from './graphViewState'

const bounds = {
  minX: -50,
  maxX: 50,
  minY: -40,
  maxY: 40,
}

test('fit signature changes when layout, bounds, viewport, or insets change', () => {
  const base = {
    layoutKey: 'multi-center-comparison:v1',
    bounds,
    width: 1280,
    height: 720,
    insets: { right: 280 },
  }

  const baseSignature = createGraphFitSignature(base)

  assert.notEqual(
    baseSignature,
    createGraphFitSignature({ ...base, layoutKey: 'multi-center-comparison:v2' }),
  )
  assert.notEqual(
    baseSignature,
    createGraphFitSignature({
      ...base,
      bounds: { ...bounds, maxX: 120 },
    }),
  )
  assert.notEqual(
    baseSignature,
    createGraphFitSignature({ ...base, width: 1366 }),
  )
  assert.notEqual(
    baseSignature,
    createGraphFitSignature({ ...base, insets: { right: 320 } }),
  )
})

test('fit state reserves right drawer space when computing the target', () => {
  const withoutInset = createFittedGraphViewState({
    bounds,
    width: 1280,
    height: 2000,
  })
  const withRightInset = createFittedGraphViewState({
    bounds,
    width: 1280,
    height: 2000,
    insets: { right: 280 },
  })

  assert.ok(withRightInset.target[0] > withoutInset.target[0])
  assert.ok(withRightInset.zoom < withoutInset.zoom)
})
