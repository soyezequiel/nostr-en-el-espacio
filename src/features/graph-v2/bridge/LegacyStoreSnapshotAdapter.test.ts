import assert from 'node:assert/strict'
import test from 'node:test'

import { createAppStore } from '@/features/graph/app/store/createAppStore'
import { LegacyStoreSnapshotAdapter } from '@/features/graph-v2/bridge/LegacyStoreSnapshotAdapter'

test('keeps the scene signature stable for progress and relay health updates', () => {
  const store = createAppStore()
  const state = store.getState()
  state.setRelayUrls(['wss://relay.example'])
  state.setRootNodePubkey('root')
  state.upsertNodes([
    {
      pubkey: 'root',
      label: 'Root',
      keywordHits: 0,
      discoveredAt: 0,
      profileState: 'ready',
      source: 'root',
    },
    {
      pubkey: 'alice',
      label: 'Alice',
      keywordHits: 0,
      discoveredAt: 1,
      profileState: 'ready',
      source: 'follow',
    },
  ])
  state.upsertLinks([{ source: 'root', target: 'alice', relation: 'follow' }])

  const adapter = new LegacyStoreSnapshotAdapter()
  const first = adapter.adapt(store.getState())

  store.getState().setRootLoadState({
    message: 'Descubriendo links visibles...',
    visibleLinkProgress: {
      visibleLinkCount: 1,
      contactListEventCount: 1,
      inboundCandidateEventCount: 0,
      lastRelayUrl: 'wss://relay.example',
      updatedAt: 1,
      following: {
        status: 'partial',
        loadedCount: 1,
        totalCount: 1,
        isTotalKnown: true,
      },
      followers: {
        status: 'loading',
        loadedCount: 0,
        totalCount: null,
        isTotalKnown: false,
      },
    },
  })
  store.getState().updateRelayHealth('wss://relay.example', {
    status: 'connected',
    lastCheckedAt: 1,
  })
  const second = adapter.adapt(store.getState())

  assert.equal(second.sceneSignature, first.sceneSignature)
})
