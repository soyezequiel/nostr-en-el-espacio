import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createSuppressedNodeClick,
  SIGMA_DRAG_CLICK_SUPPRESSION_WINDOW_MS,
  SIGMA_NODE_DRAG_THRESHOLD_PX,
  createPendingNodeDragGesture,
  shouldSuppressNodeClick,
  shouldStartNodeDrag,
} from '@/features/graph-v2/renderer/nodeDragGesture'

test('keeps a simple click below the drag threshold', () => {
  const gesture = createPendingNodeDragGesture('alice', { x: 120, y: 80 })

  assert.equal(
    shouldStartNodeDrag(gesture, {
      x: 120 + SIGMA_NODE_DRAG_THRESHOLD_PX - 1,
      y: 80,
    }),
    false,
  )
  assert.equal(
    shouldStartNodeDrag(gesture, {
      x: 120,
      y: 80 + SIGMA_NODE_DRAG_THRESHOLD_PX - 1,
    }),
    false,
  )
})

test('promotes the gesture to a drag once movement crosses the threshold', () => {
  const gesture = createPendingNodeDragGesture('alice', { x: 40, y: 24 })

  assert.equal(
    shouldStartNodeDrag(gesture, {
      x: 40 + SIGMA_NODE_DRAG_THRESHOLD_PX,
      y: 24,
    }),
    true,
  )
  assert.equal(
    shouldStartNodeDrag(gesture, {
      x: 40,
      y: 24 + SIGMA_NODE_DRAG_THRESHOLD_PX,
    }),
    true,
  )
})

test('suppresses the synthetic click emitted right after a drag ends', () => {
  const suppression = createSuppressedNodeClick('alice', 1_000)

  assert.equal(shouldSuppressNodeClick(suppression, 'alice', 1_100), true)
  assert.equal(
    shouldSuppressNodeClick(
      suppression,
      'alice',
      1_000 + SIGMA_DRAG_CLICK_SUPPRESSION_WINDOW_MS + 1,
    ),
    false,
  )
})

test('does not suppress a different node click after a drag', () => {
  const suppression = createSuppressedNodeClick('alice', 500)

  assert.equal(shouldSuppressNodeClick(suppression, 'bob', 550), false)
})
