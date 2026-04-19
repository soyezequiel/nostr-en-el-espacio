import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSocialCaptureDebugFilename,
  buildSocialCaptureDebugPayload,
  isSocialCaptureDebugDownloadEnabled,
} from '@/features/graph-v2/ui/socialCaptureDebug'

test('social capture debug sidecar is enabled only in development', () => {
  assert.equal(isSocialCaptureDebugDownloadEnabled('development'), true)
  assert.equal(isSocialCaptureDebugDownloadEnabled('production'), false)
  assert.equal(isSocialCaptureDebugDownloadEnabled('test'), false)
  assert.equal(isSocialCaptureDebugDownloadEnabled(undefined), false)
})

test('social capture debug filename follows PNG export stamp', () => {
  assert.equal(
    buildSocialCaptureDebugFilename('wide', '2026-04-19T19-49-03-000Z'),
    'sigma-graph-wide-2026-04-19T19-49-03-000Z.debug.json',
  )
})

test('social capture debug payload separates load, cache, and draw counts', () => {
  const payload = buildSocialCaptureDebugPayload({
    generatedAt: '2026-04-19T19:49:03.000Z',
    format: 'wide',
    formatLabel: 'Wide 3840x2160',
    pngFileName: 'sigma-graph-wide-2026-04-19T19-49-03-000Z.png',
    progress: {
      loaded: 207,
      total: 208,
      failed: 1,
      missing: 24,
      drawn: 207,
      fallbackWithPhoto: 1,
      attempted: 210,
      retried: 2,
      timedOut: false,
      topFailureReason: 'http_404',
      topFailureHost: 'pbs.twimg.com',
      topFailureHostReason: 'http_404 @ pbs.twimg.com',
      failureReasons: {
        http_404: 1,
        timeout: 3,
      },
      failureHosts: {
        'pbs.twimg.com': 1,
        'blossom.example': 3,
      },
      failureHostReasons: {
        'timeout @ blossom.example': 3,
        'http_404 @ pbs.twimg.com': 1,
      },
      failureSamples: {
        'http_404 @ pbs.twimg.com': [
          'https://pbs.twimg.com/profile_images/dead_400x400.jpg',
        ],
      },
      drawFallbackReasons: {
        cache_miss: 1,
      },
      drawFallbackHosts: {
        'pbs.twimg.com': 1,
      },
      drawFallbackSamples: {
        'cache_miss @ pbs.twimg.com': [
          'https://pbs.twimg.com/profile_images/evicted_400x400.jpg',
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
      search: '?testMode=1',
    },
  })

  assert.equal(payload.counts.visibleNodes, 232)
  assert.equal(payload.counts.nodesWithPictureUrl, 208)
  assert.equal(payload.counts.loadedBitmaps, 207)
  assert.equal(payload.counts.drawnPhotos, 207)
  assert.equal(payload.counts.drawFallbacksWithPicture, 1)
  assert.equal(payload.counts.failedLoads, 1)
  assert.deepEqual(Object.keys(payload.failures.byReason), [
    'timeout',
    'http_404',
  ])
  assert.deepEqual(
    payload.failures.samples['http_404 @ pbs.twimg.com'],
    ['https://pbs.twimg.com/profile_images/dead_400x400.jpg'],
  )
  assert.deepEqual(payload.drawFallbacks.byReason, {
    cache_miss: 1,
  })
  assert.deepEqual(
    payload.drawFallbacks.samples['cache_miss @ pbs.twimg.com'],
    ['https://pbs.twimg.com/profile_images/evicted_400x400.jpg'],
  )
})
