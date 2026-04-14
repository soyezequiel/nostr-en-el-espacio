import type { BuildGraphRenderModelInput } from './types'

export type ExpandedPairOverlapStrength = {
  expandedPair: readonly [string, string]
  sharedTargetCount: number
  sharedTargets: readonly string[]
  leftTargetCount: number
  rightTargetCount: number
  unionTargetCount: number
  jaccard: number
  overlapCoefficient: number
}

export type ExpandedSharedTopology = {
  sharedByExpandedCount: ReadonlyMap<string, number>
  expandedSourcesByTarget: ReadonlyMap<string, readonly string[]>
  sharedTargetSetsByExpanded: ReadonlyMap<string, ReadonlySet<string>>
  overlapStrengthByExpandedPair: ReadonlyMap<string, ExpandedPairOverlapStrength>
}

const comparePubkeys = (left: string, right: string) =>
  left.localeCompare(right)

const createExpandedPairKey = (left: string, right: string) =>
  left.localeCompare(right) <= 0 ? `${left}<->${right}` : `${right}<->${left}`

export const buildExpandedSharedTopology = ({
  links,
  expandedNodePubkeys,
}: Pick<BuildGraphRenderModelInput, 'expandedNodePubkeys' | 'links'>): ExpandedSharedTopology => {
  const sortedExpandedPubkeys = Array.from(expandedNodePubkeys).sort(comparePubkeys)
  const targetSetsByExpanded = new Map<string, Set<string>>(
    sortedExpandedPubkeys.map((pubkey) => [pubkey, new Set<string>()]),
  )
  const mutableSourcesByTarget = new Map<string, Set<string>>()

  for (const link of links) {
    if (
      link.relation !== 'follow' ||
      !expandedNodePubkeys.has(link.source) ||
      link.source === link.target
    ) {
      continue
    }

    const targetsForSource = targetSetsByExpanded.get(link.source)

    if (!targetsForSource || targetsForSource.has(link.target)) {
      continue
    }

    targetsForSource.add(link.target)

    const currentSources = mutableSourcesByTarget.get(link.target)

    if (currentSources) {
      currentSources.add(link.source)
      continue
    }

    mutableSourcesByTarget.set(link.target, new Set([link.source]))
  }

  const expandedSourcesByTarget = new Map<string, readonly string[]>(
    Array.from(mutableSourcesByTarget.entries())
      .sort(([leftTarget], [rightTarget]) => comparePubkeys(leftTarget, rightTarget))
      .map(([target, sources]) => [target, Array.from(sources).sort(comparePubkeys)]),
  )

  const sharedByExpandedCount = new Map<string, number>(
    Array.from(expandedSourcesByTarget.entries()).map(([target, sources]) => [
      target,
      sources.length,
    ]),
  )

  const mutableSharedTargetSetsByExpanded = new Map<string, Set<string>>(
    sortedExpandedPubkeys.map((pubkey) => [pubkey, new Set<string>()]),
  )
  const mutableSharedTargetsByPair = new Map<string, Set<string>>()

  for (let leftIndex = 0; leftIndex < sortedExpandedPubkeys.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < sortedExpandedPubkeys.length;
      rightIndex += 1
    ) {
      mutableSharedTargetsByPair.set(
        createExpandedPairKey(
          sortedExpandedPubkeys[leftIndex],
          sortedExpandedPubkeys[rightIndex],
        ),
        new Set<string>(),
      )
    }
  }

  for (const [target, sources] of Array.from(expandedSourcesByTarget.entries())) {
    if (sources.length < 2) {
      continue
    }

    for (const expander of sources) {
      mutableSharedTargetSetsByExpanded.get(expander)?.add(target)
    }

    for (let leftIndex = 0; leftIndex < sources.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < sources.length;
        rightIndex += 1
      ) {
        mutableSharedTargetsByPair
          .get(createExpandedPairKey(sources[leftIndex], sources[rightIndex]))
          ?.add(target)
      }
    }
  }

  const sharedTargetSetsByExpanded = new Map<string, ReadonlySet<string>>(
    sortedExpandedPubkeys.map((pubkey) => [
      pubkey,
      new Set(
        Array.from(mutableSharedTargetSetsByExpanded.get(pubkey) ?? []).sort(comparePubkeys),
      ),
    ]),
  )

  const overlapStrengthByExpandedPair = new Map<string, ExpandedPairOverlapStrength>()

  for (let leftIndex = 0; leftIndex < sortedExpandedPubkeys.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < sortedExpandedPubkeys.length;
      rightIndex += 1
    ) {
      const leftPubkey = sortedExpandedPubkeys[leftIndex]
      const rightPubkey = sortedExpandedPubkeys[rightIndex]
      const key = createExpandedPairKey(leftPubkey, rightPubkey)
      const sharedTargets = Array.from(
        mutableSharedTargetsByPair.get(key) ?? [],
      ).sort(comparePubkeys)
      const sharedTargetCount = sharedTargets.length
      const leftTargetCount = targetSetsByExpanded.get(leftPubkey)?.size ?? 0
      const rightTargetCount = targetSetsByExpanded.get(rightPubkey)?.size ?? 0
      const unionTargetCount =
        leftTargetCount + rightTargetCount - sharedTargetCount
      const overlapDenominator = Math.min(leftTargetCount, rightTargetCount)

      overlapStrengthByExpandedPair.set(key, {
        expandedPair: [leftPubkey, rightPubkey],
        sharedTargetCount,
        sharedTargets,
        leftTargetCount,
        rightTargetCount,
        unionTargetCount,
        jaccard:
          unionTargetCount > 0 ? sharedTargetCount / unionTargetCount : 0,
        overlapCoefficient:
          overlapDenominator > 0 ? sharedTargetCount / overlapDenominator : 0,
      })
    }
  }

  return {
    sharedByExpandedCount,
    expandedSourcesByTarget,
    sharedTargetSetsByExpanded,
    overlapStrengthByExpandedPair,
  }
}
