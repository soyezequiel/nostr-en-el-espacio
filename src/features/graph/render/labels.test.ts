import assert from 'node:assert/strict'
import test from 'node:test'

import {
  selectDeclutteredGraphLabels,
  shouldShowGraphLabel,
} from './labels'
import type { GraphViewState } from './graphViewState'
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

test('declutters overlapping labels while keeping prioritized graph labels visible', () => {
  const labels: GraphRenderLabel[] = [
    createLabel({
      id: 'selected',
      pubkey: 'selected',
      text: 'Selected',
      position: [0, 0],
      isSelected: true,
    }),
    createLabel({
      id: 'selected-colliding',
      pubkey: 'selected-colliding',
      text: 'Selected Collision',
      position: [18, 0],
    }),
    createLabel({
      id: 'hovered',
      pubkey: 'hovered',
      text: 'Hovered',
      position: [220, 0],
    }),
    createLabel({
      id: 'hovered-colliding',
      pubkey: 'hovered-colliding',
      text: 'Hovered Collision',
      position: [238, 0],
    }),
    createLabel({
      id: 'root',
      pubkey: 'root',
      text: 'Root',
      position: [440, 0],
      isRoot: true,
    }),
    createLabel({
      id: 'root-colliding',
      pubkey: 'root-colliding',
      text: 'Root Collision',
      position: [458, 0],
    }),
    createLabel({
      id: 'anchor',
      pubkey: 'anchor',
      text: 'Anchor',
      position: [660, 0],
      isAnchor: true,
    }),
    createLabel({
      id: 'anchor-colliding',
      pubkey: 'anchor-colliding',
      text: 'Anchor Collision',
      position: [678, 0],
    }),
    createLabel({
      id: 'aggregate',
      pubkey: 'aggregate',
      text: 'Aggregate',
      position: [880, 0],
      isAggregate: true,
    }),
    createLabel({
      id: 'aggregate-colliding',
      pubkey: 'aggregate-colliding',
      text: 'Aggregate Collision',
      position: [898, 0],
    }),
  ]
  const viewState: GraphViewState = {
    target: [0, 0, 0],
    zoom: 0,
    minZoom: -10,
    maxZoom: 10,
  }
  const nodeScreenRadii = new Map<string, number>(
    labels.map((label) => [label.pubkey, 14]),
  )

  const decluttered = selectDeclutteredGraphLabels({
    labels,
    hoveredNodePubkey: 'hovered',
    zoomLevel: 0,
    labelPolicy: 'hover-selected-only',
    viewState,
    width: 1280,
    height: 720,
    nodeScreenRadii,
  })

  assert.deepEqual(
    decluttered.map((label) => label.pubkey),
    ['selected', 'hovered', 'root', 'anchor', 'aggregate'],
  )
})
