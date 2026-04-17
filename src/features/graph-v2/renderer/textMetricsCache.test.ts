import assert from 'node:assert/strict'
import test from 'node:test'

import { TextMetricsWidthCache } from '@/features/graph-v2/renderer/textMetricsCache'

const createCanvasContext = () => {
  let calls = 0
  const context = {
    font: '500 12px Inter',
    measureText: (label: string) => {
      calls += 1
      return { width: label.length * 10 }
    },
  } as unknown as CanvasRenderingContext2D

  return {
    context,
    getCalls: () => calls,
  }
}

test('caches text measurements by label and current font', () => {
  const cache = new TextMetricsWidthCache()
  const { context, getCalls } = createCanvasContext()

  assert.equal(cache.measureTextWidth(context, 'alice'), 50)
  assert.equal(cache.measureTextWidth(context, 'alice'), 50)
  assert.equal(getCalls(), 1)

  context.font = '700 12px Inter'

  assert.equal(cache.measureTextWidth(context, 'alice'), 50)
  assert.equal(getCalls(), 2)
})

test('evicts the least recently used measurement when bounded', () => {
  const cache = new TextMetricsWidthCache(2)
  const { context, getCalls } = createCanvasContext()

  cache.measureTextWidth(context, 'alice')
  cache.measureTextWidth(context, 'bob')
  cache.measureTextWidth(context, 'alice')
  cache.measureTextWidth(context, 'carol')
  cache.measureTextWidth(context, 'bob')

  assert.equal(getCalls(), 4)
  assert.equal(cache.size, 2)
})
