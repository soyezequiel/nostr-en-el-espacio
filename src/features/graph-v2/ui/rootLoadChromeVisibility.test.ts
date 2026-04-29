import assert from 'node:assert/strict'
import test from 'node:test'

import type { RootLoadState } from '@/features/graph-runtime/app/store/types'
import { getRootLoadChromeVisibility } from '@/features/graph-v2/ui/rootLoadChromeVisibility'

const createRootLoad = (overrides: Partial<RootLoadState> = {}): RootLoadState => ({
  status: 'idle',
  message: null,
  loadedFrom: 'none',
  visibleLinkProgress: null,
  ...overrides,
})

test('hides both root load chrome surfaces when both flags are disabled', () => {
  const visibility = getRootLoadChromeVisibility({
    hasRoot: true,
    isRootLoadScreenOpen: true,
    isRootSheetOpen: false,
    rootLoad: createRootLoad({ status: 'loading' }),
    rootPubkey: 'root',
    sceneNodeCount: 0,
    rootLoadHudEnabled: false,
  })

  assert.deepEqual(visibility, {
    showOverlay: true,
    showHud: false,
  })
})

test('shows the root load overlay while loading even if the hud flag is disabled', () => {
  const visibility = getRootLoadChromeVisibility({
    hasRoot: true,
    isRootLoadScreenOpen: true,
    isRootSheetOpen: false,
    rootLoad: createRootLoad({ status: 'loading' }),
    rootPubkey: 'root',
    sceneNodeCount: 0,
    rootLoadHudEnabled: false,
  })

  assert.deepEqual(visibility, {
    showOverlay: true,
    showHud: false,
  })
})

test('shows only the root load hud when only its flag is enabled', () => {
  const visibility = getRootLoadChromeVisibility({
    hasRoot: true,
    isRootLoadScreenOpen: false,
    isRootSheetOpen: false,
    rootLoad: createRootLoad({
      status: 'partial',
      visibleLinkProgress: {
        visibleLinkCount: 12,
        contactListEventCount: 2,
        inboundCandidateEventCount: 3,
        lastRelayUrl: null,
        updatedAt: 1,
        following: {
          status: 'complete',
          loadedCount: 4,
          totalCount: 4,
          isTotalKnown: true,
        },
        followers: {
          status: 'loading',
          loadedCount: 8,
          totalCount: 16,
          isTotalKnown: true,
        },
        inboundDiscovery: null,
      },
    }),
    rootPubkey: 'root',
    sceneNodeCount: 12,
    rootLoadHudEnabled: true,
  })

  assert.deepEqual(visibility, {
    showOverlay: false,
    showHud: true,
  })
})

test('shows both root load chrome surfaces when both flags are enabled in their respective states', () => {
  const loadingVisibility = getRootLoadChromeVisibility({
    hasRoot: true,
    isRootLoadScreenOpen: true,
    isRootSheetOpen: false,
    rootLoad: createRootLoad({ status: 'loading' }),
    rootPubkey: 'root',
    sceneNodeCount: 0,
    rootLoadHudEnabled: true,
  })
  const partialVisibility = getRootLoadChromeVisibility({
    hasRoot: true,
    isRootLoadScreenOpen: false,
    isRootSheetOpen: false,
    rootLoad: createRootLoad({
      status: 'partial',
      visibleLinkProgress: {
        visibleLinkCount: 12,
        contactListEventCount: 2,
        inboundCandidateEventCount: 3,
        lastRelayUrl: null,
        updatedAt: 1,
        following: {
          status: 'complete',
          loadedCount: 4,
          totalCount: 4,
          isTotalKnown: true,
        },
        followers: {
          status: 'loading',
          loadedCount: 8,
          totalCount: 16,
          isTotalKnown: true,
        },
        inboundDiscovery: null,
      },
    }),
    rootPubkey: 'root',
    sceneNodeCount: 12,
    rootLoadHudEnabled: true,
  })

  assert.deepEqual(loadingVisibility, {
    showOverlay: true,
    showHud: false,
  })
  assert.deepEqual(partialVisibility, {
    showOverlay: false,
    showHud: true,
  })
})
