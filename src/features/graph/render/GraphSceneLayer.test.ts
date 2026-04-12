import assert from 'node:assert/strict'
import test from 'node:test'

import { buildArrowMarkerData } from './arrowMarkers'
import type { GraphEdgeSegment } from './graphSceneGeometry'

const createSegment = (
  overrides: Partial<GraphEdgeSegment> = {},
): GraphEdgeSegment => ({
  id: 'a-b:follow',
  source: 'a',
  target: 'b',
  sourcePosition: [0, 0],
  targetPosition: [10, 0],
  relation: 'follow',
  weight: 0,
  isPriority: false,
  targetSharedByExpandedCount: 0,
  progressStart: 0,
  progressEnd: 1,
  ...overrides,
})

test('uses a dedicated bidirectional marker for reciprocal segments', () => {
  const arrowData = buildArrowMarkerData({
    segments: [
      createSegment({
        id: 'pair:a:b:mutual',
        relation: 'mutual',
        isBidirectional: true,
        progressStart: 0.375,
        progressEnd: 0.5,
      }),
      createSegment({
        id: 'pair:a:b:mutual',
        relation: 'mutual',
        isBidirectional: true,
        progressStart: 0.5,
        progressEnd: 0.625,
      }),
    ],
    arrowType: 'triangle',
  })

  assert.equal(arrowData.length, 1)
  assert.equal(arrowData[0].arrowIcon, 'triangle-bidirectional')
})

test('keeps single-direction arrowheads for non-mutual segments', () => {
  const arrowData = buildArrowMarkerData({
    segments: [createSegment()],
    arrowType: 'arrow',
  })

  assert.equal(arrowData.length, 1)
  assert.equal(arrowData[0].arrowIcon, 'chevron')
})
