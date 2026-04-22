import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildLiveZapTargetBatches,
  MAX_ZAP_FILTER_PUBKEYS,
} from './useLiveZapFeed'

test('splits live zap targets into relay-sized batches', () => {
  const pubkeys = Array.from({ length: MAX_ZAP_FILTER_PUBKEYS + 2 }, (_, index) =>
    `pubkey-${index}`,
  )

  const batches = buildLiveZapTargetBatches(pubkeys.join(','))

  assert.equal(batches.length, 2)
  assert.equal(batches[0]?.length, MAX_ZAP_FILTER_PUBKEYS)
  assert.deepEqual(batches[1], ['pubkey-256', 'pubkey-257'])
})

test('keeps empty signatures subscription-free', () => {
  assert.deepEqual(buildLiveZapTargetBatches(''), [])
})
