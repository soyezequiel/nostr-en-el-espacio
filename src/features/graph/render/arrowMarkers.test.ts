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

test('uses one directional marker at the end of a one-way edge', () => {
  const markers = buildArrowMarkerData({
    segments: [createSegment({ progressStart: 0.8, progressEnd: 1 })],
    arrowType: 'triangle',
  })

  assert.deepEqual(markers.map((marker) => marker.arrowIcon), ['triangle'])
})

test('deduplicates redundant one-way segments into a single end marker', () => {
  const markers = buildArrowMarkerData({
    segments: [
      createSegment({
        id: 'a-b:follow',
        progressStart: 0.75,
        progressEnd: 0.875,
      }),
      createSegment({
        id: 'a-b:follow',
        progressStart: 0.9,
        progressEnd: 1,
      }),
    ],
    arrowType: 'arrow',
  })

  assert.equal(markers.length, 1)
  assert.equal(markers[0].arrowIcon, 'chevron')
  assert.equal(markers[0].target, 'b')
})

test('uses a single bidirectional marker for reciprocal pairs without relying on isBidirectional', () => {
  const markers = buildArrowMarkerData({
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
      createSegment({
        id: 'pair:a:b:mutual',
        relation: 'mutual',
        isBidirectional: true,
        progressStart: 0.875,
        progressEnd: 1,
      }),
      createSegment({
        id: 'pair:a:b:mutual',
        relation: 'mutual',
        isBidirectional: true,
        progressStart: 0.125,
        progressEnd: 0.25,
      }),
    ],
    arrowType: 'arrow',
  })

  assert.equal(markers.length, 1)
  assert.equal(markers[0].arrowIcon, 'chevron-bidirectional')
  assert.equal(markers[0].id, 'pair:a:b:mutual')
  assert.equal(markers[0].relation, 'mutual')
  assert.equal(markers[0].isBidirectional, true)
  assert.equal(markers[0].progressStart, 0.375)
  assert.equal(markers[0].progressEnd, 0.5)
})
