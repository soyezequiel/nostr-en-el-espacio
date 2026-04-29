import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveStoredRootLoadChromeEnabled,
  serializeRootLoadChromeEnabled,
} from '@/features/graph-v2/ui/rootLoadChromePreference'

test('root load chrome defaults to the provided fallback when there is no stored value', () => {
  assert.equal(resolveStoredRootLoadChromeEnabled(null), false)
  assert.equal(resolveStoredRootLoadChromeEnabled(null, true), true)
})

test('root load chrome honors a stored enabled value', () => {
  assert.equal(resolveStoredRootLoadChromeEnabled('1'), true)
  assert.equal(serializeRootLoadChromeEnabled(true), '1')
})

test('root load chrome honors a stored disabled value', () => {
  assert.equal(resolveStoredRootLoadChromeEnabled('0'), false)
  assert.equal(serializeRootLoadChromeEnabled(false), '0')
})
