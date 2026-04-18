import assert from 'node:assert/strict'
import test from 'node:test'

import { detectDeviceTier } from '@/features/graph-v2/renderer/avatar/deviceTier'

test('detectDeviceTier returns low when save-data is on', () => {
  const tier = detectDeviceTier({
    navigator: {
      hardwareConcurrency: 16,
      deviceMemory: 16,
      connection: { effectiveType: '4g', saveData: true },
      userAgent: 'Desktop',
    },
  })
  assert.equal(tier, 'low')
})

test('detectDeviceTier returns low on 2g connection', () => {
  const tier = detectDeviceTier({
    navigator: {
      hardwareConcurrency: 8,
      deviceMemory: 8,
      connection: { effectiveType: '2g' },
      userAgent: 'Desktop',
    },
  })
  assert.equal(tier, 'low')
})

test('detectDeviceTier returns low on low-end device', () => {
  const tier = detectDeviceTier({
    navigator: {
      hardwareConcurrency: 4,
      deviceMemory: 3,
      userAgent: 'Android Mobile',
    },
  })
  assert.equal(tier, 'low')
})

test('detectDeviceTier returns mid on average mobile', () => {
  const tier = detectDeviceTier({
    navigator: {
      hardwareConcurrency: 8,
      deviceMemory: 8,
      userAgent: 'iPhone Mobile',
    },
  })
  assert.equal(tier, 'mid')
})

test('detectDeviceTier returns high on powerful desktop', () => {
  const tier = detectDeviceTier({
    navigator: {
      hardwareConcurrency: 16,
      deviceMemory: 32,
      userAgent: 'Desktop Chrome',
    },
  })
  assert.equal(tier, 'high')
})

test('detectDeviceTier returns mid when navigator is undefined', () => {
  const tier = detectDeviceTier({ navigator: undefined })
  assert.equal(tier, 'mid')
})
