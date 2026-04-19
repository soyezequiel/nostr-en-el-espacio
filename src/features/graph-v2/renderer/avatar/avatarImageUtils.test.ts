import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveAvatarBucketForVisibleDiameter,
} from '@/features/graph-v2/renderer/avatar/avatarImageUtils'

test('resolves avatar LOD from final visible diameter', () => {
  assert.equal(resolveAvatarBucketForVisibleDiameter({ visibleDiameterPx: 8 }), 32)
  assert.equal(resolveAvatarBucketForVisibleDiameter({ visibleDiameterPx: 16 }), 32)
  assert.equal(resolveAvatarBucketForVisibleDiameter({ visibleDiameterPx: 17 }), 64)
  assert.equal(resolveAvatarBucketForVisibleDiameter({ visibleDiameterPx: 32 }), 64)
  assert.equal(resolveAvatarBucketForVisibleDiameter({ visibleDiameterPx: 33 }), 128)
  assert.equal(resolveAvatarBucketForVisibleDiameter({ visibleDiameterPx: 80 }), 128)
  assert.equal(resolveAvatarBucketForVisibleDiameter({ visibleDiameterPx: 81 }), 256)
  assert.equal(resolveAvatarBucketForVisibleDiameter({ visibleDiameterPx: 160 }), 256)
  assert.equal(resolveAvatarBucketForVisibleDiameter({ visibleDiameterPx: 161 }), 512)
  assert.equal(
    resolveAvatarBucketForVisibleDiameter({
      visibleDiameterPx: 321,
      maxBucket: 1024,
    }),
    1024,
  )
})

test('caps high quality buckets when the active budget does not allow them', () => {
  assert.equal(
    resolveAvatarBucketForVisibleDiameter({
      visibleDiameterPx: 220,
      maxBucket: 256,
    }),
    256,
  )
  assert.equal(
    resolveAvatarBucketForVisibleDiameter({
      visibleDiameterPx: 10,
      maxBucket: 512,
    }),
    32,
  )
})
