import assert from 'node:assert/strict'
import test from 'node:test'

import { GraphInteractionController } from '@/features/graph-v2/application/InteractionController'
import type { LegacyKernelBridge } from '@/features/graph-v2/bridge/LegacyKernelBridge'

test('selects and clears nodes through the bridge', () => {
  const selections: Array<string | null> = []
  const bridge = {
    selectNode: (pubkey: string | null) => {
      selections.push(pubkey)
    },
  } as unknown as LegacyKernelBridge
  const controller = new GraphInteractionController(bridge)

  controller.callbacks.onNodeClick('alice')
  controller.callbacks.onClearSelection()

  assert.deepEqual(selections, ['alice', null])
})
