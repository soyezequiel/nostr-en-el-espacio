import assert from 'node:assert/strict'
import test from 'node:test'

import { KIND_PARSER_SPECS } from './parsers'
import { buildLiveGraphEventFilters } from './useLiveGraphEventFeed'
import { buildRecentGraphEventReplayFilters } from './useRecentGraphEventReplay'

test('live filters include inbound and authored activity for reaction-style events', () => {
  const batch = ['alice', 'bob']
  const filters = buildLiveGraphEventFilters(KIND_PARSER_SPECS.like, batch, 123)

  assert.deepEqual(filters, [
    { kinds: [7], '#p': batch, since: 123 },
    { kinds: [7], authors: batch, since: 123 },
  ])
})

test('live filters keep saves scoped to visible authors', () => {
  const batch = ['alice']
  const filters = buildLiveGraphEventFilters(KIND_PARSER_SPECS.save, batch, 123)

  assert.deepEqual(filters, [
    { kinds: [10003, 30001], authors: batch, since: 123 },
  ])
})

test('recent replay filters mirror live inbound plus authored coverage', () => {
  const batch = ['alice', 'bob', 'carol']
  const filters = buildRecentGraphEventReplayFilters(
    KIND_PARSER_SPECS.quote,
    batch,
    10,
    20,
  )

  assert.deepEqual(filters, [
    { kinds: [1], '#p': batch, since: 10, until: 20, limit: 25 },
    { kinds: [1], authors: batch, since: 10, until: 20, limit: 25 },
  ])
})
