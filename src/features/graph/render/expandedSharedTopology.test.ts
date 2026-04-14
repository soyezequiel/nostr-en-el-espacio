import assert from 'node:assert/strict'
import test from 'node:test'

// `tsx --test` executes this suite in CJS mode for this repo, so require keeps
// the export shape stable even though the implementation file uses ESM syntax.
/* eslint-disable @typescript-eslint/no-require-imports */
const { buildExpandedSharedTopology } = require('./expandedSharedTopology.ts')
const baselineTestUtils = require('./graphRenderBaselineTestUtils.ts')
/* eslint-enable @typescript-eslint/no-require-imports */

const {
  createExpandedSharedTopologyFromFixture,
  createFiveExpandersSharedHubsFixture,
  createSyntheticExpandedIntersectionFixture,
  createThreeExpandersPartialOverlapFixture,
  createTwoExpandersStrongOverlapFixture,
} = baselineTestUtils

const createPairKey = (left: string, right: string) =>
  [left, right].sort((a, b) => a.localeCompare(b)).join('<->')

test('buildExpandedSharedTopology matches the baseline overlap fixtures for 2 and 3 expanded nodes', async (suite) => {
  const fixtures = [
    createTwoExpandersStrongOverlapFixture(),
    createThreeExpandersPartialOverlapFixture(),
  ]

  for (const fixture of fixtures) {
    await suite.test(fixture.name, () => {
      const topology = buildExpandedSharedTopology({
        links: fixture.links,
        expandedNodePubkeys: fixture.expandedNodePubkeys,
      })

      assert.deepEqual(
        topology,
        createExpandedSharedTopologyFromFixture(fixture),
      )
    })
  }
})

test('buildExpandedSharedTopology derives pair overlap strengths across five expanded hubs', () => {
  const fixture = createFiveExpandersSharedHubsFixture()
  const topology = buildExpandedSharedTopology({
    links: fixture.links,
    expandedNodePubkeys: fixture.expandedNodePubkeys,
  })
  const [uno, dos, tres, cuatro] = fixture.expanderPubkeys
  const unoTres = topology.overlapStrengthByExpandedPair.get(createPairKey(uno, tres))
  const dosCuatro = topology.overlapStrengthByExpandedPair.get(createPairKey(dos, cuatro))
  const unoCuatro = topology.overlapStrengthByExpandedPair.get(createPairKey(uno, cuatro))

  assert.ok(unoTres)
  assert.ok(dosCuatro)
  assert.ok(unoCuatro)
  assert.equal(unoTres.sharedTargetCount, 2)
  assert.deepEqual(unoTres.sharedTargets, ['shared-central-hub', 'shared-south-hub'])
  assert.equal(dosCuatro.sharedTargetCount, 2)
  assert.deepEqual(dosCuatro.sharedTargets, ['shared-central-hub', 'shared-north-hub'])
  assert.equal(unoCuatro.sharedTargetCount, 1)
  assert.deepEqual(unoCuatro.sharedTargets, ['shared-central-hub'])
})

test('buildExpandedSharedTopology keeps explicit zero-overlap pairs when n expanded nodes do not share targets', () => {
  const fixture = createSyntheticExpandedIntersectionFixture({
    expandedCount: 5,
    sharedHubCount: 0,
    pairwiseSharedTargetsPerAdjacentPair: 0,
    uniqueTargetsPerExpander: 2,
    inboundNoisePerExpander: 0,
  })
  const topology = buildExpandedSharedTopology({
    links: fixture.links,
    expandedNodePubkeys: fixture.expandedNodePubkeys,
  })
  const expectedTopology = createExpandedSharedTopologyFromFixture(fixture)

  assert.deepEqual(topology, expectedTopology)
  assert.equal(topology.overlapStrengthByExpandedPair.size, 10)

  for (const overlap of topology.overlapStrengthByExpandedPair.values()) {
    assert.equal(overlap.sharedTargetCount, 0)
    assert.deepEqual(overlap.sharedTargets, [])
    assert.equal(overlap.jaccard, 0)
    assert.equal(overlap.overlapCoefficient, 0)
  }
})
