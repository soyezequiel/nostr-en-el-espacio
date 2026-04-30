import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveStoredHudStatsEnabled,
  serializeHudStatsEnabled,
} from '@/features/graph-v2/ui/hudStatsPreference'

test('hud stats default to hidden in development when there is no stored value', () => {
  assert.equal(resolveStoredHudStatsEnabled(null), false)
})

test('hud stats default to hidden in production when there is no stored value', () => {
  assert.equal(resolveStoredHudStatsEnabled(null), false)
})

test('hud stats honor a stored enabled value', () => {
  assert.equal(resolveStoredHudStatsEnabled('1'), true)
  assert.equal(serializeHudStatsEnabled(true), '1')
})

test('hud stats honor a stored disabled value', () => {
  assert.equal(resolveStoredHudStatsEnabled('0'), false)
  assert.equal(serializeHudStatsEnabled(false), '0')
})
