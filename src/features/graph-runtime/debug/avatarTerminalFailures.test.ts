import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearTerminalAvatarFailure,
  getTerminalAvatarFailure,
  getTerminalAvatarFailureForPicture,
  isTerminalAvatarFailureReason,
  rememberTerminalAvatarFailure,
} from '@/features/graph-runtime/debug/avatarTerminalFailures'

test('terminal avatar reasons classify hard failures correctly', () => {
  assert.equal(isTerminalAvatarFailureReason('http_404'), true)
  assert.equal(isTerminalAvatarFailureReason('http_403'), true)
  assert.equal(isTerminalAvatarFailureReason('decode_failed'), true)
  assert.equal(isTerminalAvatarFailureReason('timeout'), false)
  assert.equal(isTerminalAvatarFailureReason('image_load_failed'), false)
})

test('terminal avatar failures can be resolved from pubkey and picture', () => {
  const urlKey = 'alice::https://images.example/alice.png'

  try {
    rememberTerminalAvatarFailure({
      urlKey,
      pubkey: 'alice',
      url: 'https://images.example/alice.png',
      reason: 'http_404',
      at: 1_000,
    })

    assert.equal(getTerminalAvatarFailure(urlKey)?.reason, 'http_404')
    assert.equal(
      getTerminalAvatarFailureForPicture(
        'alice',
        'https://images.example/alice.png',
      )?.reason,
      'http_404',
    )
  } finally {
    clearTerminalAvatarFailure(urlKey)
  }
})
