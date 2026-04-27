import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveZapOverlayCssPosition } from '@/features/graph-v2/ui/zapOverlayPosition'

test('zap overlay uses Sigma viewport coordinates as CSS pixels', () => {
  const adapter = {
    getViewportPosition: (pubkey: string) =>
      pubkey === 'alice' ? { x: 240, y: 160 } : null,
  }

  assert.deepEqual(resolveZapOverlayCssPosition(adapter, 'alice'), {
    x: 240,
    y: 160,
  })
  assert.equal(resolveZapOverlayCssPosition(adapter, 'unknown'), null)
})
