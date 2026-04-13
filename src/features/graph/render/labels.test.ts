import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldShowGraphLabel } from './labels'
import type { GraphRenderLabel } from './types'

const createLabel = (
  overrides: Partial<GraphRenderLabel> = {},
): GraphRenderLabel => ({
  id: 'node-a:label',
  pubkey: 'node-a',
  text: 'Node A',
  position: [0, 0],
  radius: 12,
  isRoot: false,
  isSelected: false,
  ...overrides,
})

test('always shows comparison anchor labels even below zoom threshold', () => {
  const visible = shouldShowGraphLabel({
    label: createLabel({ isAnchor: true }),
    hoveredNodePubkey: null,
    zoomLevel: -1,
    labelPolicy: 'hover-selected-only',
  })

  assert.equal(visible, true)
})

test('still hides non-anchor labels when they are unfocused and zoomed out', () => {
  const visible = shouldShowGraphLabel({
    label: createLabel(),
    hoveredNodePubkey: null,
    zoomLevel: -1,
    labelPolicy: 'hover-selected-only',
  })

  assert.equal(visible, false)
})
