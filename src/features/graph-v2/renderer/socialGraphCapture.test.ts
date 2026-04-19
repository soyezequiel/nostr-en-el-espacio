import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractLoadErrorReason,
  isCanvasImageSourceExportSafe,
  selectSocialCaptureAvatarNodes,
  type SocialGraphCaptureNode,
} from '@/features/graph-v2/renderer/socialGraphCapture'
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
