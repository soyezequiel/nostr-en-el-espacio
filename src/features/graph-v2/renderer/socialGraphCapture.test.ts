import assert from 'node:assert/strict'
import test from 'node:test'

import {
  captureSocialGraphImage,
  extractLoadErrorReason,
  isCanvasImageSourceExportSafe,
  resolveSocialCaptureCacheCap,
  selectSocialCaptureAvatarNodes,
  type SocialGraphCaptureNode,
} from '@/features/graph-v2/renderer/socialGraphCapture'
import { AvatarBitmapCache } from '@/features/graph-v2/renderer/avatar/avatarBitmapCache'
import type { RenderNodeAttributes } from '@/features/graph-v2/renderer/graphologyProjectionStore'

const node = (
  pubkey: string,
  attrs: Partial<RenderNodeAttributes>,
  degree: number,
): SocialGraphCaptureNode => ({
  pubkey,
  degree,
  attrs: {
    x: 0,
    y: 0,
    size: 10,
    color: '#7dd3a7',
    focusState: 'idle',
    label: pubkey,
    hidden: false,
    highlighted: false,
    forceLabel: false,
    fixed: false,
    pictureUrl: `https://example.com/${pubkey}.png`,
    isDimmed: false,
    isSelected: false,
    isNeighbor: false,
    isRoot: false,
    isPinned: false,
    zIndex: 0,
    ...attrs,
  },
})

test('social capture avatar priority starts with root, selection and pins', () => {
  const selected = selectSocialCaptureAvatarNodes([
    node('hub', {}, 120),
    node('selected', { isSelected: true }, 4),
    node('root', { isRoot: true }, 1),
    node('pinned', { isPinned: true }, 2),
  ])

  assert.deepEqual(
    selected.map((item) => item.pubkey),
    ['root', 'selected', 'pinned', 'hub'],
  )
})

test('social capture skips unsafe and hidden avatar URLs', () => {
  const selected = selectSocialCaptureAvatarNodes([
    node('ok', {}, 1),
    node('hidden', { hidden: true }, 99),
    node('unsafe', { pictureUrl: 'javascript:alert(1)' }, 100),
  ])

  assert.deepEqual(selected.map((item) => item.pubkey), ['ok'])
})

test('social capture rejects canvas sources that would taint PNG export', () => {
  const restoreDocument = installDocumentStub({
    getImageData: () => {
      throw new DOMException('tainted', 'SecurityError')
    },
  })

  try {
    assert.equal(
      isCanvasImageSourceExportSafe({} as CanvasImageSource),
      false,
    )
  } finally {
    restoreDocument()
  }
})

test('extractLoadErrorReason recovers reason, name, or message', () => {
  assert.equal(extractLoadErrorReason(undefined), 'avatar_fetch_failed')
  assert.equal(
    extractLoadErrorReason({ reason: 'http_502' }),
    'http_502',
  )
  assert.equal(
    extractLoadErrorReason(new DOMException('x', 'AbortError')),
    'aborted',
  )
  assert.equal(
    extractLoadErrorReason(new Error('timeout')),
    'timeout',
  )
})

test('social capture accepts origin-clean canvas sources for PNG export', () => {
  const restoreDocument = installDocumentStub({
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  })

  try {
    assert.equal(
      isCanvasImageSourceExportSafe({} as CanvasImageSource),
      true,
    )
  } finally {
    restoreDocument()
  }
})

test('social capture expands cache cap enough to retain loaded avatars until draw', () => {
  assert.equal(
    resolveSocialCaptureCacheCap({
      currentCap: 64,
      currentSize: 64,
      avatarNodeCount: 208,
    }),
    272,
  )
  assert.equal(
    resolveSocialCaptureCacheCap({
      currentCap: 512,
      currentSize: 12,
      avatarNodeCount: 80,
    }),
    512,
  )
})

test('social capture emits draw fallback diagnostics only after drawing', async () => {
  const restoreDocument = installCaptureDocumentStub()
  const progress: Array<{
    phase: string
    drawFallbackReasons?: Record<string, number>
  }> = []

  try {
    const blob = await captureSocialGraphImage({
      nodes: [],
      edges: [],
      cache: new AvatarBitmapCache(16),
      loader: {
        load: async () => {
          throw new Error('unexpected_load')
        },
      } as never,
      rootPubkey: null,
      options: {
        onProgress: (next) => progress.push(next),
      },
    })

    assert.equal(blob.type, 'image/png')
    assert.deepEqual(
      progress.map((next) => next.phase),
      ['preparing', 'loading-avatars', 'generating-image', 'completed'],
    )
    assert.equal(
      progress.find((next) => next.phase === 'generating-image')
        ?.drawFallbackReasons,
      undefined,
    )
    assert.deepEqual(
      progress.find((next) => next.phase === 'completed')
        ?.drawFallbackReasons,
      {},
    )
  } finally {
    restoreDocument()
  }
})

const installDocumentStub = ({
  getImageData,
}: {
  getImageData: () => unknown
}) => {
  const originalDocument = globalThis.document
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: () => undefined,
          getImageData,
        }),
      }),
    },
  })

  return () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    })
  }
}

const installCaptureDocumentStub = () => {
  const originalDocument = globalThis.document
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    arc: () => undefined,
    clip: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    fillRect: () => undefined,
    fillText: () => undefined,
    drawImage: () => undefined,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    measureText: (text: string) => ({ width: text.length * 8 }),
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (callback: (blob: Blob | null) => void) => {
      callback(new Blob(['png'], { type: 'image/png' }))
    },
  }
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => canvas,
    },
  })

  return () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    })
  }
}
