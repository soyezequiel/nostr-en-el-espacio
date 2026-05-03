import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAvatarRuntimeDebugFilename,
  buildAvatarRuntimeDebugPayload,
  isAvatarRuntimeDebugDownloadEnabled,
} from '@/features/graph-v2/ui/avatarRuntimeDebug'

test('avatar runtime debug sidecar is enabled only in development', () => {
  assert.equal(isAvatarRuntimeDebugDownloadEnabled('development'), true)
  assert.equal(isAvatarRuntimeDebugDownloadEnabled('production'), false)
  assert.equal(isAvatarRuntimeDebugDownloadEnabled('test'), false)
  assert.equal(isAvatarRuntimeDebugDownloadEnabled(undefined), false)
})

test('avatar runtime debug filename follows the export stamp', () => {
  assert.equal(
    buildAvatarRuntimeDebugFilename('2026-04-19T20-38-16-000Z'),
    'sigma-avatar-runtime-2026-04-19T20-38-16-000Z.debug.json',
  )
})

test('avatar runtime debug payload separates draw, cache, scheduler, and blocked reasons', () => {
  const payload = buildAvatarRuntimeDebugPayload({
    generatedAt: '2026-04-19T20:38:16.000Z',
    debugFileName: 'sigma-avatar-runtime-2026-04-19T20-38-16-000Z.debug.json',
    state: {
      rootPubkey: 'root',
      selectedNodePubkey: 'selected',
      viewport: { width: 1440, height: 900 },
      camera: { x: 0, y: 0, ratio: 1.25, angle: 0 },
      physicsRunning: true,
      motionActive: false,
      hideAvatarsOnMove: false,
      runtimeOptions: {
        sizeThreshold: 15,
        zoomThreshold: 2.1,
        hoverRevealRadiusPx: 72,
        hoverRevealMaxNodes: 24,
        showZoomedOutMonograms: true,
        showMonogramBackgrounds: false,
        showMonogramText: false,
        hideImagesOnFastNodes: false,
        fastNodeVelocityThreshold: 240,
        allowZoomedOutImages: true,
        showAllVisibleImages: true,
        maxInteractiveBucket: 256,
      },
      perfBudget: null,
      cache: {
        capacity: 256,
        size: 3,
        totalBytes: 4096,
        monogramCount: 8,
        byState: {
          loading: 1,
          ready: 1,
          failed: 1,
        },
        entries: [
          {
            urlKey: 'alice::https://example.com/alice.png',
            state: 'ready',
            bucket: 128,
            startedAt: null,
            readyAt: 10,
            failedAt: null,
            expiresAt: null,
            bytes: 1024,
            reason: null,
          },
          {
            urlKey: 'bob::https://example.com/bob.png',
            state: 'failed',
            bucket: null,
            startedAt: null,
            readyAt: null,
            failedAt: 11,
            expiresAt: 50,
            bytes: null,
            reason: 'http_404',
          },
          {
            urlKey: 'carol::https://example.com/carol.png',
            state: 'loading',
            bucket: 64,
            startedAt: 12,
            readyAt: null,
            failedAt: null,
            expiresAt: null,
            bytes: null,
            reason: null,
          },
        ],
        recentEvents: [
          {
            at: 9,
            type: 'mark_ready',
            urlKey: 'alice::https://example.com/alice.png',
            previousState: null,
            nextState: 'ready',
            previousBucket: null,
            nextBucket: 128,
            reason: null,
            clearedEntries: null,
            clearedReadyEntries: null,
          },
          {
            at: 10,
            type: 'mark_loading',
            urlKey: 'alice::https://example.com/alice.png',
            previousState: 'ready',
            nextState: 'loading',
            previousBucket: 128,
            nextBucket: 256,
            reason: null,
            clearedEntries: null,
            clearedReadyEntries: null,
          },
          {
            at: 11,
            type: 'mark_failed',
            urlKey: 'bob::https://example.com/bob.png',
            previousState: 'loading',
            nextState: 'failed',
            previousBucket: 64,
            nextBucket: null,
            reason: 'http_404',
            clearedEntries: null,
            clearedReadyEntries: null,
          },
          {
            at: 12,
            type: 'clear',
            urlKey: null,
            previousState: null,
            nextState: null,
            previousBucket: null,
            nextBucket: null,
            reason: null,
            clearedEntries: 3,
            clearedReadyEntries: 1,
          },
        ],
      },
      loader: {
        blockedCount: 2,
        blocked: [
          {
            urlKey: 'bob::https://example.com/bob.png',
            expiresAt: 200,
            ttlMsRemaining: 5000,
            reason: 'http_404',
          },
          {
            urlKey: 'dave::https://example.com/dave.png',
            expiresAt: 180,
            ttlMsRemaining: 4000,
            reason: 'timeout',
          },
        ],
        recentAttempts: [
          {
            path: 'direct',
            stage: 'primary',
            policy: 'direct-first',
            startedAt: 100,
            responseReadyAt: 150,
            decodeReadyAt: 180,
            completedAt: 180,
            durationMs: 80,
            result: 'ready',
            reason: null,
            bytes: 4096,
            host: 'example.com',
            pubkey: 'alice',
            urlKey: 'alice::https://example.com/alice.png',
          },
        ],
      },
      scheduler: {
        inflightCount: 1,
        inflight: [],
        urgentRetries: [],
        recentEvents: [],
      },
      overlay: {
        generatedAtMs: 123,
        cameraRatio: 1.25,
        moving: false,
        globalMotionActive: false,
        resolvedBudget: {
          sizeThreshold: 15,
          zoomThreshold: 2.1,
          maxAvatarDrawsPerFrame: 280,
          maxImageDrawsPerFrame: 120,
          lruCap: 256,
          visualConcurrency: 1,
          effectiveLoadConcurrency: 6,
          concurrency: 1,
          maxBucket: 256,
          maxInteractiveBucket: 256,
          showAllVisibleImages: true,
          allowZoomedOutImages: true,
          showZoomedOutMonograms: true,
          hideImagesOnFastNodes: false,
          fastNodeVelocityThreshold: 240,
        },
        counts: {
          visibleNodes: 12,
          nodesWithPictureUrl: 10,
          nodesWithSafePictureUrl: 9,
          selectedForImage: 9,
          loadCandidates: 7,
          pendingCacheMiss: 3,
          pendingCandidates: 4,
          blockedCandidates: 1,
          inflightCandidates: 1,
          drawnImages: 6,
          monogramDraws: 6,
          withPictureMonogramDraws: 3,
        },
        byDisableReason: {
          not_selected_for_image: 2,
        },
        byLoadSkipReason: {
          cache_warmup: 1,
          unsafe_url: 1,
        } as Record<string, number>,
        byDrawFallbackReason: {
          http_404: 1,
          cache_loading: 2,
        },
        byCacheState: {
          ready: 6,
          failed: 1,
          loading: 2,
        },
        nodes: [
          {
            pubkey: 'alice',
            label: 'Alice',
            url: 'https://example.com/alice.png',
            host: 'example.com',
            urlKey: 'alice::https://example.com/alice.png',
            radiusPx: 24,
            priority: 1,
            selectedForImage: true,
            isPersistentAvatar: false,
            zoomedOutMonogram: false,
            monogramOnly: false,
            fastMoving: false,
            globalMotionActive: false,
            disableImageReason: null,
            drawResult: 'image',
            drawFallbackReason: null,
            loadDecision: 'candidate',
            loadSkipReason: null,
            cacheState: 'ready',
            cacheFailureReason: null,
            blocked: false,
            blockReason: null,
            inflight: false,
            requestedBucket: 128,
            hasPictureUrl: true,
            hasSafePictureUrl: true,
            candidateSinceMs: 100,
            firstImageDrawAtMs: 220,
            lastImageDrawAtMs: 240,
            imageDrawCount: 2,
          },
        ],
      },
    },
    profileWarmup: {
      pubkeys: [],
      viewportPubkeyCount: 1,
      scenePubkeyCount: 1,
      orderedPubkeyCount: 1,
      eligibleCount: 0,
      skipped: { missingNode: 0, alreadyUsable: 1, inflight: 0, cooldown: 0 },
      generatedAtMs: 250,
      selectedSamples: [],
      attemptedCount: 1,
      inflightCount: 0,
      profileStates: { idle: 0, loading: 0, readyUsable: 1, readyEmpty: 0, missing: 0, unknown: 0 },
      viewportProfileStates: { idle: 0, loading: 0, readyUsable: 1, readyEmpty: 0, missing: 0, unknown: 0 },
      latency: {
        inflightOldestAgeMs: null,
        completedCount: 1,
        inflightCount: 0,
        relayCompletedCount: 1,
        p50RelayMs: 40,
        p95RelayMs: 40,
        attempts: [
          {
            pubkey: 'alice',
            pubkeyShort: 'alice',
            attemptedAtMs: 80,
            ageMs: 170,
            completedAtMs: 120,
            durationMs: 40,
            source: 'relay',
            status: 'ready',
            hasPicture: true,
            profileState: 'ready',
          },
        ],
      },
    },
    browser: {
      userAgent: 'unit-test',
      language: 'es-AR',
      devicePixelRatio: 2,
      viewport: {
        width: 1440,
        height: 900,
      },
    },
    location: {
      pathname: '/labs/sigma',
      search: '?debug=1',
    },
  })

  assert.equal(payload.counts.visibleNodes, 12)
  assert.equal(payload.schemaVersion, 3)
  assert.equal(payload.counts.drawnImages, 6)
  assert.equal(payload.counts.cacheFailed, 1)
  assert.equal(payload.counts.loaderBlocked, 2)
  assert.equal(payload.counts.visualConcurrency, 1)
  assert.equal(payload.counts.effectiveLoadConcurrency, 6)
  assert.equal(payload.counts.pendingCacheMiss, 3)
  assert.equal(payload.counts.pendingCandidates, 4)
  assert.equal(payload.counts.blockedCandidates, 1)
  assert.equal(payload.counts.inflightCandidates, 1)
  assert.deepEqual(Object.keys(payload.reasons.drawFallback), [
    'cache_loading',
    'http_404',
  ])
  assert.deepEqual(payload.reasons.cacheFailures, {
    http_404: 1,
  })
  assert.deepEqual(payload.reasons.blockedReasons, {
    http_404: 1,
    timeout: 1,
  })
  assert.equal(payload.transitions.readyLossCount, 1)
  assert.equal(payload.latency.profileWarmup?.relayCompletedCount, 1)
  assert.equal(payload.latency.loaderRecentAttempts[0]?.path, 'direct')
  assert.equal(payload.latency.visiblePaints[0]?.firstImageDrawAtMs, 220)
  assert.deepEqual(payload.transitions.readyLossSummary, {
    'mark_loading:none': 1,
  })
  assert.equal(payload.transitions.recentReadyLosses[0]?.previousState, 'ready')
  assert.equal(payload.transitions.recentReadyLosses[0]?.nextState, 'loading')
})
