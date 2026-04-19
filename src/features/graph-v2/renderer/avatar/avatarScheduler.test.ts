import assert from 'node:assert/strict'
import test from 'node:test'

import { AvatarBitmapCache } from '@/features/graph-v2/renderer/avatar/avatarBitmapCache'
import { AvatarScheduler } from '@/features/graph-v2/renderer/avatar/avatarScheduler'
import type { AvatarBudget } from '@/features/graph-v2/renderer/avatar/types'

const installDocumentStub = () => {
  const originalDocument = globalThis.document
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () =>
        ({
          width: 0,
          height: 0,
          getContext: () => ({
            save: () => undefined,
            beginPath: () => undefined,
            arc: () => undefined,
            closePath: () => undefined,
            clip: () => undefined,
            createRadialGradient: () => ({
              addColorStop: () => undefined,
            }),
            createLinearGradient: () => ({
              addColorStop: () => undefined,
            }),
            fillRect: () => undefined,
            fill: () => undefined,
            stroke: () => undefined,
            strokeText: () => undefined,
            fillText: () => undefined,
            restore: () => undefined,
          }),
        }) as unknown as HTMLCanvasElement,
    },
  })
  return () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    })
  }
}

const budget: AvatarBudget = {
  sizeThreshold: 12,
  zoomThreshold: 2,
  concurrency: 1,
  maxBucket: 128,
  lruCap: 16,
  maxAvatarDrawsPerFrame: 10,
  maxImageDrawsPerFrame: 10,
  drawAvatars: true,
}

test('urgent avatars preempt lower-priority inflight loads', () => {
  const restoreDocument = installDocumentStub()
  const loadCalls: Array<{ url: string; signal: AbortSignal }> = []
  const loader = {
    isBlocked: () => false,
    block: () => undefined,
    load: (url: string, _bucket: number, signal: AbortSignal) => {
      loadCalls.push({ url, signal })
      return new Promise(() => undefined)
    },
  }

  try {
    const scheduler = new AvatarScheduler({
      cache: new AvatarBitmapCache(16),
      loader: loader as never,
    })

    scheduler.reconcile(
      [
        {
          pubkey: 'regular',
          urlKey: 'regular::https://example.com/regular.png',
          url: 'https://example.com/regular.png',
          bucket: 64,
          priority: 30,
          monogram: { label: 'Regular', color: '#7dd3a7' },
        },
      ],
      budget,
    )

    scheduler.prime(
      [
        {
          pubkey: 'selected',
          urlKey: 'selected::https://example.com/selected.png',
          url: 'https://example.com/selected.png',
          bucket: 64,
          priority: 2,
          urgent: true,
          monogram: { label: 'Selected', color: '#7dd3a7' },
        },
      ],
      budget,
    )

    assert.equal(loadCalls.length, 2)
    assert.equal(loadCalls[0]?.url, 'https://example.com/regular.png')
    assert.equal(loadCalls[0]?.signal.aborted, true)
    assert.equal(loadCalls[1]?.url, 'https://example.com/selected.png')
    assert.equal(loadCalls[1]?.signal.aborted, false)
    assert.equal(scheduler.inflightSize(), 1)
    scheduler.dispose()
  } finally {
    restoreDocument()
  }
})

test('urgent avatars retry failed blocked loads instead of staying on monogram', () => {
  const restoreDocument = installDocumentStub()
  const urlKey = 'selected::https://example.com/selected.png'
  const loadCalls: Array<{ url: string; signal: AbortSignal }> = []
  let blocked = true
  const loader = {
    isBlocked: () => blocked,
    block: () => {
      blocked = true
    },
    unblock: () => {
      blocked = false
    },
    load: (url: string, _bucket: number, signal: AbortSignal) => {
      loadCalls.push({ url, signal })
      return new Promise(() => undefined)
    },
  }

  try {
    const cache = new AvatarBitmapCache(16)
    const monogram = cache.getMonogram('selected', {
      label: 'Selected',
      color: '#7dd3a7',
    })
    cache.markFailed(urlKey, monogram)

    const scheduler = new AvatarScheduler({
      cache,
      loader: loader as never,
    })

    scheduler.reconcile(
      [
        {
          pubkey: 'selected',
          urlKey,
          url: 'https://example.com/selected.png',
          bucket: 64,
          priority: 2,
          urgent: true,
          monogram: { label: 'Selected', color: '#7dd3a7' },
        },
      ],
      budget,
    )

    assert.equal(blocked, false)
    assert.equal(loadCalls.length, 1)
    assert.equal(loadCalls[0]?.url, 'https://example.com/selected.png')
    assert.equal(scheduler.inflightSize(), 1)
    scheduler.dispose()
  } finally {
    restoreDocument()
  }
})
