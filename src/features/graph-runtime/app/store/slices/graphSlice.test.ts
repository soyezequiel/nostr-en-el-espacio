import assert from 'node:assert/strict'
import test from 'node:test'

import { createStore } from 'zustand/vanilla'
import type { GraphSlice } from '@/features/graph-runtime/app/store/types'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createGraphSlice } = require('./graphSlice.ts')

const createStoreForGraphSlice = () =>
  createStore<GraphSlice>()((...args) => ({
    ...createGraphSlice(...args),
  }))

test('upsertNodes ignores undefined patch fields for existing nodes', () => {
  const store = createStoreForGraphSlice()

  store.getState().upsertNodes([
    {
      pubkey: 'alice',
      label: 'Alice',
      picture: 'https://cdn.example.com/alice.jpg',
      about: 'Original profile',
      nip05: 'alice@example.com',
      lud16: 'alice@getalby.com',
      profileEventId: 'evt-1',
      profileFetchedAt: 1_000,
      profileSource: 'relay',
      profileState: 'ready',
      keywordHits: 0,
      discoveredAt: 1,
      source: 'follow',
    },
  ])

  store.getState().upsertNodes([
    {
      pubkey: 'alice',
      label: undefined,
      picture: undefined,
      about: 'Updated profile',
      nip05: undefined,
      lud16: undefined,
      profileEventId: 'evt-2',
      profileFetchedAt: 2_000,
      profileSource: 'relay',
      profileState: 'ready',
      keywordHits: 1,
      discoveredAt: 1,
      source: 'follow',
    },
  ])

  const node = store.getState().nodes.alice

  assert.equal(node.label, 'Alice')
  assert.equal(node.picture, 'https://cdn.example.com/alice.jpg')
  assert.equal(node.nip05, 'alice@example.com')
  assert.equal(node.lud16, 'alice@getalby.com')
  assert.equal(node.about, 'Updated profile')
  assert.equal(node.profileEventId, 'evt-2')
})

test('upsertNodes still allows explicit null profile field clears', () => {
  const store = createStoreForGraphSlice()

  store.getState().upsertNodes([
    {
      pubkey: 'alice',
      label: 'Alice',
      picture: 'https://cdn.example.com/alice.jpg',
      about: 'Original profile',
      nip05: 'alice@example.com',
      lud16: 'alice@getalby.com',
      profileEventId: 'evt-1',
      profileFetchedAt: 1_000,
      profileSource: 'relay',
      profileState: 'ready',
      keywordHits: 0,
      discoveredAt: 1,
      source: 'follow',
    },
  ])

  store.getState().upsertNodes([
    {
      pubkey: 'alice',
      label: null as unknown as string,
      picture: null,
      about: null,
      nip05: null,
      lud16: null,
      profileEventId: null,
      profileFetchedAt: null,
      profileSource: null,
      profileState: 'missing',
      keywordHits: 0,
      discoveredAt: 1,
      source: 'follow',
    },
  ])

  const node = store.getState().nodes.alice

  assert.equal(node.label, null)
  assert.equal(node.picture, null)
  assert.equal(node.about, null)
  assert.equal(node.nip05, null)
  assert.equal(node.lud16, null)
  assert.equal(node.profileEventId, null)
})
