import assert from 'node:assert/strict'
import test from 'node:test'

import { AvatarLoader } from '@/features/graph-v2/renderer/avatar/avatarLoader'

const makeLoader = (nowRef: { t: number }) =>
  new AvatarLoader({
    fetchImpl: (async () => {
      throw new Error('not used in these tests')
    }) as unknown as typeof fetch,
    createImageBitmapImpl: (async () => {
      throw new Error('not used')
    }) as unknown as typeof createImageBitmap,
    now: () => nowRef.t,
  })

test('AvatarLoader.isBlocked is false by default', () => {
  const nowRef = { t: 1000 }
  const loader = makeLoader(nowRef)
  assert.equal(loader.isBlocked('u'), false)
})

test('AvatarLoader.block marks key as blocked until TTL expires', () => {
  const nowRef = { t: 1000 }
  const loader = makeLoader(nowRef)
  loader.block('u', 500)
  assert.equal(loader.isBlocked('u'), true)
  nowRef.t = 1499
  assert.equal(loader.isBlocked('u'), true)
  nowRef.t = 1501
  assert.equal(loader.isBlocked('u'), false)
})

test('AvatarLoader.unblock removes block', () => {
  const nowRef = { t: 1000 }
  const loader = makeLoader(nowRef)
  loader.block('u', 10000)
  loader.unblock('u')
  assert.equal(loader.isBlocked('u'), false)
})

test('AvatarLoader.load rejects unsafe URL', async () => {
  const loader = makeLoader({ t: 0 })
  await assert.rejects(
    () => loader.load('javascript:alert(1)', 64, new AbortController().signal),
    /unsafe_url/,
  )
})
