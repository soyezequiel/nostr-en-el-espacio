import assert from 'node:assert/strict'
import test from 'node:test'

import { createDragLocalFixture } from '@/features/graph-v2/testing/fixtures/dragLocalFixture'

test('creates a 40-node drag lab fixture with no pinned nodes by default', () => {
  const fixture = createDragLocalFixture()

  assert.equal(Object.keys(fixture.state.nodesByPubkey).length, 40)
  assert.equal(fixture.state.pinnedNodePubkeys.size, 0)
  assert.ok(fixture.state.nodesByPubkey[fixture.dragTargetPubkey])
  assert.ok(fixture.state.nodesByPubkey[fixture.pinnedNeighborPubkey])
})
