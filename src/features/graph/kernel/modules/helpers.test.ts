import assert from 'node:assert/strict'
import test from 'node:test'

import {
  planTargetedReciprocalFollowerEvidence,
  resolveAdaptiveReciprocalCandidateCap,
} from './helpers'

test('prioritizes visible graph pubkeys before the remaining reciprocal candidates', () => {
  const plan = planTargetedReciprocalFollowerEvidence({
    followPubkeys: ['c', 'a', 'd', 'b', 'e'],
    targetPubkey: 'root',
    existingGraphPubkeys: new Set(['a', 'b']),
    candidateCap: 3,
  })

  assert.deepEqual(plan.candidatePubkeys, ['a', 'b', 'c'])
  assert.equal(plan.totalAvailableCandidates, 5)
  assert.equal(plan.totalCandidates, 3)
  assert.equal(plan.capped, true)
})

test('scales reciprocal candidate cap down with tighter device and graph budgets', () => {
  const desktopCap = resolveAdaptiveReciprocalCandidateCap({
    currentNodeCount: 300,
    maxGraphNodes: 2200,
    effectiveGraphMaxNodes: 2200,
    devicePerformanceProfile: 'desktop',
  })
  const mobileCap = resolveAdaptiveReciprocalCandidateCap({
    currentNodeCount: 300,
    maxGraphNodes: 600,
    effectiveGraphMaxNodes: 600,
    devicePerformanceProfile: 'mobile',
  })
  const lowEndCap = resolveAdaptiveReciprocalCandidateCap({
    currentNodeCount: 220,
    maxGraphNodes: 250,
    effectiveGraphMaxNodes: 250,
    devicePerformanceProfile: 'low-end-mobile',
  })

  assert.ok(desktopCap > mobileCap)
  assert.ok(mobileCap >= lowEndCap)
  assert.ok(lowEndCap >= 48)
})
