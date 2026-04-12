import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGraphSceneGeometry } from './graphSceneGeometry'
import type { GraphRenderEdge } from './types'

const createEdge = (
  overrides: Partial<GraphRenderEdge> = {},
): GraphRenderEdge => ({
  id: 'a-b:follow',
  source: 'a',
  target: 'b',
  relation: 'follow',
  weight: 0,
  sourcePosition: [0, 0],
  targetPosition: [100, 0],
  sourceRadius: 12,
  targetRadius: 12,
  isPriority: false,
  targetSharedByExpandedCount: 5,
  ...overrides,
})

test('collapses reciprocal follow edges into one canonical mutual visual edge', () => {
  const geometry = buildGraphSceneGeometry([
    createEdge({ id: 'a-b:follow', source: 'a', target: 'b', relation: 'follow' }),
    createEdge({ id: 'b-a:follow', source: 'b', target: 'a', relation: 'follow' }),
  ])

  assert.ok(geometry.segments.length > 0)
  assert.ok(
    geometry.segments.every(
      (segment) =>
        segment.id === 'pair:a:b:mutual' &&
        segment.relation === 'mutual' &&
        segment.isBidirectional === true &&
        segment.source === 'a' &&
        segment.target === 'b',
    ),
  )
})

test('collapses mixed reciprocal relations into one canonical mutual visual edge', () => {
  const geometry = buildGraphSceneGeometry([
    createEdge({ id: 'a-b:follow', source: 'a', target: 'b', relation: 'follow' }),
    createEdge({
      id: 'b-a:zap',
      source: 'b',
      target: 'a',
      relation: 'zap',
      weight: 21,
    }),
  ])

  assert.ok(geometry.segments.length > 0)
  assert.ok(
    geometry.segments.every(
      (segment) =>
        segment.id === 'pair:a:b:mutual' &&
        segment.relation === 'mutual' &&
        segment.isBidirectional === true &&
        segment.source === 'a' &&
        segment.target === 'b',
    ),
  )
  assert.equal(
    geometry.segments.some((segment) => segment.id === 'b-a:zap'),
    false,
  )
})

test('collapses reciprocal zap edges into one canonical mutual visual edge', () => {
  const geometry = buildGraphSceneGeometry([
    createEdge({
      id: 'a-b:zap',
      source: 'a',
      target: 'b',
      relation: 'zap',
      weight: 8,
    }),
    createEdge({
      id: 'b-a:zap',
      source: 'b',
      target: 'a',
      relation: 'zap',
      weight: 21,
    }),
  ])

  assert.ok(geometry.segments.length > 0)
  assert.ok(
    geometry.segments.every(
      (segment) =>
        segment.id === 'pair:a:b:mutual' &&
        segment.relation === 'mutual' &&
        segment.isBidirectional === true,
    ),
  )
})

test('deduplicates same-direction edges to one visual edge per direction', () => {
  const geometry = buildGraphSceneGeometry([
    createEdge({
      id: 'a-b:zap',
      source: 'a',
      target: 'b',
      relation: 'zap',
      weight: 10,
    }),
    createEdge({
      id: 'a-b:follow',
      source: 'a',
      target: 'b',
      relation: 'follow',
      weight: 0,
    }),
  ])

  assert.ok(geometry.segments.length > 0)
  assert.ok(
    geometry.segments.every(
      (segment) =>
        segment.id === 'a-b:follow' &&
        segment.relation === 'follow' &&
        segment.isBidirectional === false &&
        segment.source === 'a' &&
        segment.target === 'b',
    ),
  )
})
