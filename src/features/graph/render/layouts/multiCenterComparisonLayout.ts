import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from 'd3-force'

import type { GraphLink, GraphNode } from '@/features/graph/app/store/types'
import type {
  BuildGraphRenderModelInput,
  GraphComparisonAnchorSlot,
  GraphLayoutRole,
  GraphLayoutSnapshot,
} from '@/features/graph/render/types'

type ComparisonMembership = {
  role: GraphLayoutRole
  ownerAnchorPubkeys: string[]
  membershipSignature: string
  sharedCount: number
}

type ComparisonLayoutResult = {
  activeAnchorPubkeys: string[]
  overflowAnchorPubkeys: string[]
  memberships: Map<string, ComparisonMembership>
  positions: Map<string, [number, number]>
  snapshot: GraphLayoutSnapshot
}

type ComparisonLayoutNode = {
  id: string
  pubkey: string
  radius: number
  x: number
  y: number
  vx?: number
  vy?: number
  fx?: number
  fy?: number
  targetX: number
  targetY: number
  xStrength: number
  yStrength: number
}

type ComparisonLayoutLink = {
  source: string | ComparisonLayoutNode
  target: string | ComparisonLayoutNode
  strength: number
  distance: number
}

const ROOT_TARGET_Y = -250
const ANCHOR_TARGET_Y = -36
const SINGLE_ANCHOR_ROOT_TARGET_X = -228
const SINGLE_ANCHOR_ROOT_TARGET_Y = -188
const SINGLE_ANCHOR_ANCHOR_TARGET_Y = -18
const CONTEXT_TARGET_Y = 104
const EXCLUSIVE_TARGET_Y = 134
const SHARED_PAIR_TARGET_Y = 118
const SHARED_MULTI_TARGET_Y = 94
const SHARED_OFFSET_X = 82
const LOCAL_CLUSTER_X = 72
const LOCAL_CLUSTER_Y = 30
const SLOT_TEMPLATES: Record<number, number[]> = {
  1: [0],
  2: [-220, 220],
  3: [-300, 0, 300],
  4: [-390, -130, 130, 390],
  5: [-460, -230, 0, 230, 460],
  6: [-540, -324, -108, 108, 324, 540],
}

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const hashString = (value: string) => {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

const normalizeHash = (value: string) => hashString(value) / 0xffffffff

const createMembershipSignature = (ownerAnchorPubkeys: readonly string[]) =>
  ownerAnchorPubkeys.length > 0
    ? ownerAnchorPubkeys.join('|')
    : 'context'

const getAnchorSlots = (anchorCount: number) => {
  if (anchorCount <= 0) {
    return []
  }

  if (SLOT_TEMPLATES[anchorCount]) {
    return SLOT_TEMPLATES[anchorCount]
  }

  const step = clampNumber(180 - anchorCount * 4, 96, 180)
  const startX = -((anchorCount - 1) * step) / 2

  return Array.from({ length: anchorCount }, (_, index) => startX + index * step)
}

const selectComparisonAnchors = ({
  rootNodePubkey,
  expandedNodePubkeys,
  comparedNodePubkeys,
  activeComparisonAnchorPubkeys,
  comparisonAnchorOrder,
  maxActiveAnchors,
}: {
  rootNodePubkey: string | null
  expandedNodePubkeys: ReadonlySet<string>
  comparedNodePubkeys: ReadonlySet<string>
  activeComparisonAnchorPubkeys: readonly string[]
  comparisonAnchorOrder: readonly string[]
  maxActiveAnchors: number
}) => {
  const rootAnchorBudget = rootNodePubkey ? 1 : 0
  const nonRootAnchorBudget = Math.max(0, maxActiveAnchors - rootAnchorBudget)
  const expandedOrdered = Array.from(expandedNodePubkeys).filter(
    (pubkey) => pubkey !== rootNodePubkey,
  )
  const explicitAnchors = activeComparisonAnchorPubkeys.filter(
    (pubkey) =>
      pubkey !== rootNodePubkey &&
      expandedNodePubkeys.has(pubkey) &&
      comparedNodePubkeys.has(pubkey),
  )

  if (explicitAnchors.length >= 2) {
    return {
      activeAnchorPubkeys:
        rootNodePubkey !== null
          ? [rootNodePubkey, ...explicitAnchors.slice(0, nonRootAnchorBudget)]
          : explicitAnchors.slice(0, maxActiveAnchors),
      overflowAnchorPubkeys:
        rootNodePubkey !== null
          ? explicitAnchors.slice(nonRootAnchorBudget)
          : explicitAnchors.slice(maxActiveAnchors),
    }
  }
  if (explicitAnchors.length === 1) {
    return {
      activeAnchorPubkeys:
        rootNodePubkey !== null ? [rootNodePubkey, explicitAnchors[0]] : explicitAnchors,
      overflowAnchorPubkeys: [],
    }
  }

  const orderedCandidates = [
    ...comparisonAnchorOrder.filter(
      (pubkey) =>
        pubkey !== rootNodePubkey && expandedNodePubkeys.has(pubkey),
    ),
    ...expandedOrdered,
  ]
  const deduped = Array.from(new Set(orderedCandidates))
  const visibleAnchors =
    rootNodePubkey !== null
      ? deduped.slice(-nonRootAnchorBudget)
      : deduped.slice(-maxActiveAnchors)

  return {
    activeAnchorPubkeys:
      visibleAnchors.length >= 1
        ? rootNodePubkey !== null
          ? [rootNodePubkey, ...visibleAnchors]
          : visibleAnchors
        : [],
    overflowAnchorPubkeys:
      visibleAnchors.length >= 1
        ? deduped.slice(0, Math.max(0, deduped.length - visibleAnchors.length))
        : [],
  }
}

const compareNodesForBudget = (left: GraphNode, right: GraphNode) => {
  const leftDiscoveredAt = left.discoveredAt ?? Number.MAX_SAFE_INTEGER
  const rightDiscoveredAt = right.discoveredAt ?? Number.MAX_SAFE_INTEGER

  if (leftDiscoveredAt !== rightDiscoveredAt) {
    return leftDiscoveredAt - rightDiscoveredAt
  }

  return left.pubkey.localeCompare(right.pubkey)
}

const buildComparisonMemberships = ({
  nodes,
  visiblePubkeys,
  links,
  rootNodePubkey,
  activeAnchorPubkeys,
  maxComparisonTargets,
  maxTargetsPerSignature,
}: {
  nodes: BuildGraphRenderModelInput['nodes']
  visiblePubkeys: ReadonlySet<string>
  links: readonly GraphLink[]
  rootNodePubkey: string | null
  activeAnchorPubkeys: readonly string[]
  maxComparisonTargets: number
  maxTargetsPerSignature: number
}) => {
  const activeAnchorSet = new Set(activeAnchorPubkeys)
  const effectiveMaxTargetsPerSignature =
    activeAnchorPubkeys.length === 2
      ? maxComparisonTargets
      : maxTargetsPerSignature
  const ownerAnchorsByPubkey = new Map<string, Set<string>>()

  for (const link of links) {
    if (
      link.relation !== 'follow' ||
      !activeAnchorSet.has(link.source) ||
      !visiblePubkeys.has(link.target)
    ) {
      continue
    }

    const owners = ownerAnchorsByPubkey.get(link.target) ?? new Set<string>()
    owners.add(link.source)
    ownerAnchorsByPubkey.set(link.target, owners)
  }

  const groupedOwnedNodes = new Map<string, GraphNode[]>()

  ownerAnchorsByPubkey.forEach((owners, pubkey) => {
    const node = nodes[pubkey]
    if (!node) {
      return
    }

    const signature = createMembershipSignature(Array.from(owners).sort())
    const bucket = groupedOwnedNodes.get(signature) ?? []
    bucket.push(node)
    groupedOwnedNodes.set(signature, bucket)
  })

  const keptOwnedPubkeys = new Set<string>()
  const keptNodesByPriority = Array.from(groupedOwnedNodes.entries())
    .sort((left, right) => {
      const sharedCountDelta =
        right[0].split('|').length - left[0].split('|').length

      if (sharedCountDelta !== 0) {
        return sharedCountDelta
      }

      return left[0].localeCompare(right[0])
    })
    .flatMap(([, bucket]) => bucket.sort(compareNodesForBudget))

  for (const node of keptNodesByPriority) {
    if (keptOwnedPubkeys.size >= maxComparisonTargets) {
      break
    }

    const owners = Array.from(ownerAnchorsByPubkey.get(node.pubkey) ?? []).sort()
    const signature = createMembershipSignature(owners)
    const currentSignatureCount = Array.from(keptOwnedPubkeys).filter(
      (pubkey) =>
        createMembershipSignature(
          Array.from(ownerAnchorsByPubkey.get(pubkey) ?? []).sort(),
        ) === signature,
    ).length

    if (currentSignatureCount >= effectiveMaxTargetsPerSignature) {
      continue
    }

    keptOwnedPubkeys.add(node.pubkey)
  }

  const memberships = new Map<string, ComparisonMembership>()

  for (const pubkey of visiblePubkeys) {
    if (pubkey === rootNodePubkey) {
      memberships.set(pubkey, {
        role: 'root',
        ownerAnchorPubkeys: [],
        membershipSignature: 'root',
        sharedCount: 0,
      })
      continue
    }

    if (activeAnchorSet.has(pubkey)) {
      memberships.set(pubkey, {
        role: 'anchor',
        ownerAnchorPubkeys: [pubkey],
        membershipSignature: `anchor:${pubkey}`,
        sharedCount: 0,
      })
      continue
    }

    const owners = Array.from(ownerAnchorsByPubkey.get(pubkey) ?? []).sort()

    if (owners.length === 0 || !keptOwnedPubkeys.has(pubkey)) {
      memberships.set(pubkey, {
        role: 'target',
        ownerAnchorPubkeys: [],
        membershipSignature: 'context',
        sharedCount: 0,
      })
      continue
    }

    memberships.set(pubkey, {
      role: 'target',
      ownerAnchorPubkeys: owners,
      membershipSignature: createMembershipSignature(owners),
      sharedCount: owners.length,
    })
  }

  return memberships
}

const getSignatureLocalOffset = ({
  pubkey,
  signature,
  index,
}: {
  pubkey: string
  signature: string
  index: number
}) => {
  const hash = normalizeHash(`${signature}:${pubkey}`)
  const row = Math.floor(index / 4)
  const col = index % 4
  const offsetX = (col - 1.5) * LOCAL_CLUSTER_X + (hash - 0.5) * 18
  const offsetY = row * LOCAL_CLUSTER_Y + (hash - 0.5) * 14

  return {
    offsetX,
    offsetY,
  }
}

const getSingleAnchorGridRowCapacity = (row: number) => 10 + row * 4

const getSingleAnchorOwnedPosition = ({
  pubkey,
  index,
  anchorX,
  anchorY,
}: {
  pubkey: string
  index: number
  anchorX: number
  anchorY: number
}) => {
  let row = 0
  let remainingIndex = index

  while (remainingIndex >= getSingleAnchorGridRowCapacity(row)) {
    remainingIndex -= getSingleAnchorGridRowCapacity(row)
    row += 1
  }

  const rowCapacity = getSingleAnchorGridRowCapacity(row)
  const normalizedIndex =
    rowCapacity <= 1 ? 0.5 : remainingIndex / Math.max(1, rowCapacity - 1)
  const hash = normalizeHash(`${pubkey}:single-anchor-owned-grid`)
  const halfSpan = (rowCapacity - 1) / 2
  const columnOffset = remainingIndex - halfSpan

  return {
    x: anchorX + columnOffset * 74 + (hash - 0.5) * 12,
    y: anchorY + 164 + row * 58 + Math.abs(columnOffset) * 6 + (hash - 0.5) * 10,
    normalizedIndex,
  }
}

const getSingleAnchorContextPosition = ({
  pubkey,
  index,
  rootX,
  rootY,
}: {
  pubkey: string
  index: number
  rootX: number
  rootY: number
}) => {
  const row = Math.floor(index / 6)
  const column = index % 6
  const hash = normalizeHash(`${pubkey}:single-anchor-context-bank`)

  return {
    x: rootX - 150 - row * 64 + (hash - 0.5) * 14,
    y: rootY + column * 52 + (hash - 0.5) * 12,
  }
}

const getBucketGridPosition = ({
  pubkey,
  index,
  centerX,
  startY,
  columns,
  columnSpacing,
  rowSpacing,
  rowJitter = 14,
}: {
  pubkey: string
  index: number
  centerX: number
  startY: number
  columns: number
  columnSpacing: number
  rowSpacing: number
  rowJitter?: number
}) => {
  const row = Math.floor(index / columns)
  const column = index % columns
  const hash = normalizeHash(`${pubkey}:bucket-grid`)
  const halfSpan = (columns - 1) / 2
  const columnOffset = column - halfSpan

  return {
    x: centerX + columnOffset * columnSpacing + (hash - 0.5) * 16,
    y:
      startY +
      row * rowSpacing +
      Math.abs(columnOffset) * 6 +
      (hash - 0.5) * rowJitter,
  }
}

const buildTwoAnchorPartitionPositions = ({
  visiblePubkeys,
  memberships,
  activeAnchorPubkeys,
  anchorSlots,
}: {
  visiblePubkeys: ReadonlySet<string>
  memberships: Map<string, ComparisonMembership>
  activeAnchorPubkeys: readonly string[]
  anchorSlots: ReadonlyMap<string, GraphComparisonAnchorSlot>
}) => {
  const positions = new Map<string, [number, number]>()
  const [leftAnchorPubkey, rightAnchorPubkey] = activeAnchorPubkeys
  const leftAnchorPosition = anchorSlots.get(leftAnchorPubkey)?.position ?? [-220, ANCHOR_TARGET_Y]
  const rightAnchorPosition = anchorSlots.get(rightAnchorPubkey)?.position ?? [220, ANCHOR_TARGET_Y]
  const centerX = (leftAnchorPosition[0] + rightAnchorPosition[0]) / 2

  positions.set(leftAnchorPubkey, leftAnchorPosition)
  positions.set(rightAnchorPubkey, rightAnchorPosition)

  const leftExclusivePubkeys: string[] = []
  const rightExclusivePubkeys: string[] = []
  const sharedPubkeys: string[] = []
  const contextPubkeys: string[] = []

  Array.from(visiblePubkeys)
    .filter((pubkey) => pubkey !== leftAnchorPubkey && pubkey !== rightAnchorPubkey)
    .sort()
    .forEach((pubkey) => {
      const membership = memberships.get(pubkey)
      const owners = membership?.ownerAnchorPubkeys ?? []

      if (owners.length === 0) {
        contextPubkeys.push(pubkey)
        return
      }

      if (owners.length >= 2) {
        sharedPubkeys.push(pubkey)
        return
      }

      if (owners[0] === leftAnchorPubkey) {
        leftExclusivePubkeys.push(pubkey)
        return
      }

      rightExclusivePubkeys.push(pubkey)
    })

  leftExclusivePubkeys.forEach((pubkey, index) => {
    const position = getBucketGridPosition({
      pubkey,
      index,
      centerX: leftAnchorPosition[0] - 108,
      startY: leftAnchorPosition[1] + 116,
      columns: 5,
      columnSpacing: 54,
      rowSpacing: 54,
    })
    positions.set(pubkey, [position.x, position.y])
  })

  sharedPubkeys.forEach((pubkey, index) => {
    const position = getBucketGridPosition({
      pubkey,
      index,
      centerX,
      startY: Math.min(leftAnchorPosition[1], rightAnchorPosition[1]) + 74,
      columns: 4,
      columnSpacing: 48,
      rowSpacing: 48,
      rowJitter: 10,
    })
    positions.set(pubkey, [position.x, position.y])
  })

  rightExclusivePubkeys.forEach((pubkey, index) => {
    const position = getBucketGridPosition({
      pubkey,
      index,
      centerX: rightAnchorPosition[0] + 108,
      startY: rightAnchorPosition[1] + 116,
      columns: 5,
      columnSpacing: 54,
      rowSpacing: 54,
    })
    positions.set(pubkey, [position.x, position.y])
  })

  contextPubkeys.forEach((pubkey, index) => {
    const position = getBucketGridPosition({
      pubkey,
      index,
      centerX,
      startY: Math.max(leftAnchorPosition[1], rightAnchorPosition[1]) + 244,
      columns: 6,
      columnSpacing: 44,
      rowSpacing: 40,
      rowJitter: 8,
    })
    positions.set(pubkey, [position.x, position.y])
  })

  return positions
}

const buildSeedPositions = ({
  nodes,
  visiblePubkeys,
  memberships,
  rootNodePubkey,
  activeAnchorPubkeys,
}: {
  nodes: BuildGraphRenderModelInput['nodes']
  visiblePubkeys: ReadonlySet<string>
  memberships: Map<string, ComparisonMembership>
  rootNodePubkey: string | null
  activeAnchorPubkeys: readonly string[]
}) => {
  const positions = new Map<string, [number, number]>()
  const anchorSlots = new Map<string, GraphComparisonAnchorSlot>()
  const slotXs = getAnchorSlots(activeAnchorPubkeys.length)
  const isSingleAnchorMode = activeAnchorPubkeys.length === 1
  const resolvedAnchorTargetY = isSingleAnchorMode
    ? SINGLE_ANCHOR_ANCHOR_TARGET_Y
    : ANCHOR_TARGET_Y

  activeAnchorPubkeys.forEach((pubkey, index) => {
    const position: [number, number] = [
      slotXs[index] ?? 0,
      resolvedAnchorTargetY,
    ]
    positions.set(pubkey, position)
    anchorSlots.set(pubkey, {
      pubkey,
      slotIndex: index,
      position,
    })
  })

  if (rootNodePubkey && !anchorSlots.has(rootNodePubkey)) {
    positions.set(
      rootNodePubkey,
      isSingleAnchorMode
        ? [SINGLE_ANCHOR_ROOT_TARGET_X, SINGLE_ANCHOR_ROOT_TARGET_Y]
        : [0, ROOT_TARGET_Y],
    )
  }

  const orderedBySignature = new Map<string, string[]>()
  Array.from(visiblePubkeys)
    .filter(
      (pubkey) =>
        pubkey !== rootNodePubkey && !activeAnchorPubkeys.includes(pubkey),
    )
    .sort((leftPubkey, rightPubkey) =>
      compareNodesForBudget(nodes[leftPubkey], nodes[rightPubkey]),
    )
    .forEach((pubkey) => {
      const signature = memberships.get(pubkey)?.membershipSignature ?? 'context'
      const bucket = orderedBySignature.get(signature) ?? []
      bucket.push(pubkey)
      orderedBySignature.set(signature, bucket)
    })

  orderedBySignature.forEach((pubkeys, signature) => {
    pubkeys.forEach((pubkey, index) => {
      const membership = memberships.get(pubkey)
      const { offsetX, offsetY } = getSignatureLocalOffset({
        pubkey,
        signature,
        index,
      })
      const singleAnchorPubkey = activeAnchorPubkeys[0] ?? null
      const singleAnchorPosition =
        singleAnchorPubkey !== null
          ? anchorSlots.get(singleAnchorPubkey)?.position ?? [0, resolvedAnchorTargetY]
          : [0, resolvedAnchorTargetY]
      const rootPosition =
        rootNodePubkey !== null
          ? positions.get(rootNodePubkey) ??
            [SINGLE_ANCHOR_ROOT_TARGET_X, SINGLE_ANCHOR_ROOT_TARGET_Y]
          : [SINGLE_ANCHOR_ROOT_TARGET_X, SINGLE_ANCHOR_ROOT_TARGET_Y]

      if (!membership || membership.sharedCount === 0) {
        if (isSingleAnchorMode) {
          const contextPosition = getSingleAnchorContextPosition({
            pubkey,
            index,
            rootX: rootPosition[0],
            rootY: rootPosition[1],
          })
          positions.set(pubkey, [contextPosition.x, contextPosition.y])
        } else {
          const contextHash = normalizeHash(pubkey)
          positions.set(pubkey, [
            (contextHash - 0.5) * 360 + offsetX * 0.45,
            CONTEXT_TARGET_Y + offsetY,
          ])
        }
        return
      }

      const ownerPositions = membership.ownerAnchorPubkeys
        .map((ownerPubkey) => anchorSlots.get(ownerPubkey)?.position)
        .filter((position): position is [number, number] => Boolean(position))

      const barycenterX =
        ownerPositions.reduce((sum, position) => sum + position[0], 0) /
        Math.max(1, ownerPositions.length)

      if (membership.sharedCount === 1) {
        if (isSingleAnchorMode) {
          const ownerPosition = ownerPositions[0] ?? singleAnchorPosition
          const ownedPosition = getSingleAnchorOwnedPosition({
            pubkey,
            index,
            anchorX: ownerPosition[0],
            anchorY: ownerPosition[1],
          })

          positions.set(pubkey, [ownedPosition.x, ownedPosition.y])
          return
        }

        positions.set(pubkey, [
          barycenterX + offsetX * (isSingleAnchorMode ? 1.25 : 1),
          (isSingleAnchorMode ? 120 : EXCLUSIVE_TARGET_Y) + offsetY,
        ])
        return
      }

      if (membership.sharedCount === 2) {
        const pairHash = normalizeHash(`${signature}:${pubkey}:pair`)
        positions.set(pubkey, [
          barycenterX + offsetX * 0.4 + (pairHash - 0.5) * SHARED_OFFSET_X,
          SHARED_PAIR_TARGET_Y + offsetY * 0.7,
        ])
        return
      }

      const sharedYOffset = Math.max(
        0,
        (activeAnchorPubkeys.length - membership.sharedCount) * 18,
      )
      positions.set(pubkey, [
        barycenterX + offsetX * 0.3,
        SHARED_MULTI_TARGET_Y + sharedYOffset + offsetY * 0.6,
      ])
    })
  })

  return {
    seedPositions: positions,
    anchorSlots,
  }
}

const createComparisonLinks = ({
  visiblePubkeys,
  links,
  rootNodePubkey,
  activeAnchorPubkeys,
  isSingleAnchorMode,
}: {
  visiblePubkeys: ReadonlySet<string>
  links: readonly GraphLink[]
  rootNodePubkey: string | null
  activeAnchorPubkeys: readonly string[]
  isSingleAnchorMode: boolean
}) => {
  const activeAnchorSet = new Set(activeAnchorPubkeys)
  const comparisonLinks: ComparisonLayoutLink[] = []

  for (const link of links) {
    if (link.relation !== 'follow') {
      continue
    }

    if (
      activeAnchorSet.has(link.source) &&
      visiblePubkeys.has(link.target)
    ) {
      if (isSingleAnchorMode) {
        continue
      }

      comparisonLinks.push({
        source: link.source,
        target: link.target,
        strength: 0.06,
        distance: 120,
      })
      continue
    }

    if (
      rootNodePubkey &&
      link.source === rootNodePubkey &&
      activeAnchorSet.has(link.target)
    ) {
      comparisonLinks.push({
        source: link.source,
        target: link.target,
        strength: 0.02,
        distance: 180,
      })
    }
  }

  return comparisonLinks
}

export const runMultiCenterComparisonLayout = ({
  nodes,
  visiblePubkeys,
  links,
  rootNodePubkey,
  expandedNodePubkeys,
  comparedNodePubkeys,
  activeComparisonAnchorPubkeys,
  comparisonAnchorOrder,
  comparisonLayoutBudgets,
  previousPositions,
  previousLayoutSnapshot,
  radiiByPubkey,
  ticks,
}: {
  nodes: BuildGraphRenderModelInput['nodes']
  visiblePubkeys: ReadonlySet<string>
  links: readonly GraphLink[]
  rootNodePubkey: string | null
  expandedNodePubkeys: ReadonlySet<string>
  comparedNodePubkeys: ReadonlySet<string>
  activeComparisonAnchorPubkeys: readonly string[]
  comparisonAnchorOrder: readonly string[]
  comparisonLayoutBudgets: NonNullable<
    BuildGraphRenderModelInput['comparisonLayoutBudgets']
  >
  previousPositions?: ReadonlyMap<string, [number, number]>
  previousLayoutSnapshot?: GraphLayoutSnapshot | null
  radiiByPubkey: ReadonlyMap<string, number>
  ticks: number
}): ComparisonLayoutResult | null => {
  const { activeAnchorPubkeys, overflowAnchorPubkeys } = selectComparisonAnchors({
    rootNodePubkey,
    expandedNodePubkeys,
    comparedNodePubkeys,
    activeComparisonAnchorPubkeys,
    comparisonAnchorOrder,
    maxActiveAnchors: comparisonLayoutBudgets.maxActiveAnchors,
  })

  if (
    activeAnchorPubkeys.length < 1 ||
    (rootNodePubkey !== null &&
      activeAnchorPubkeys.length === 1 &&
      activeAnchorPubkeys[0] === rootNodePubkey)
  ) {
    return null
  }
  const isSingleAnchorMode = activeAnchorPubkeys.length === 1

  const memberships = buildComparisonMemberships({
    nodes,
    visiblePubkeys,
    links,
    rootNodePubkey,
    activeAnchorPubkeys,
    maxComparisonTargets: comparisonLayoutBudgets.maxComparisonTargets,
    maxTargetsPerSignature: comparisonLayoutBudgets.maxTargetsPerSignature,
  })
  const { seedPositions, anchorSlots } = buildSeedPositions({
    nodes,
    visiblePubkeys,
    memberships,
    rootNodePubkey,
    activeAnchorPubkeys,
  })
  const previousComparisonSnapshot =
    previousLayoutSnapshot?.comparison?.mode === 'multi-center-comparison'
      ? previousLayoutSnapshot.comparison
      : null

  const layoutNodes: ComparisonLayoutNode[] = Array.from(visiblePubkeys)
    .map((pubkey) => {
      const membership = memberships.get(pubkey) ?? {
        role: 'target' as const,
        ownerAnchorPubkeys: [],
        membershipSignature: 'context',
        sharedCount: 0,
      }
      const previousSignature =
        previousComparisonSnapshot?.membershipSignatureByPubkey?.[pubkey] ?? null
      const previousPosition = previousPositions?.get(pubkey)
      const seedPosition =
        seedPositions.get(pubkey) ??
        previousPosition ?? [0, CONTEXT_TARGET_Y]
      const startPosition =
        previousPosition && previousSignature === membership.membershipSignature
          ? previousPosition
          : seedPosition
      const anchorSlot = anchorSlots.get(pubkey)

      if (membership.role === 'root') {
        const rootTarget =
          seedPositions.get(pubkey) ?? [0, ROOT_TARGET_Y]
        return {
          id: pubkey,
          pubkey,
          radius: radiiByPubkey.get(pubkey) ?? 16,
          x: rootTarget[0],
          y: rootTarget[1],
          fx: rootTarget[0],
          fy: rootTarget[1],
          targetX: rootTarget[0],
          targetY: rootTarget[1],
          xStrength: 1,
          yStrength: 1,
        }
      }

      if (membership.role === 'anchor' && anchorSlot) {
        return {
          id: pubkey,
          pubkey,
          radius: radiiByPubkey.get(pubkey) ?? 16,
          x: startPosition[0],
          y: startPosition[1],
          fx: anchorSlot.position[0],
          fy: anchorSlot.position[1],
          targetX: anchorSlot.position[0],
          targetY: anchorSlot.position[1],
          xStrength: 1,
          yStrength: 1,
        }
      }

      const isStableMembership =
        previousSignature !== null &&
        previousSignature === membership.membershipSignature

      return {
        id: pubkey,
        pubkey,
        radius: radiiByPubkey.get(pubkey) ?? 12,
        x: startPosition[0],
        y: startPosition[1],
        targetX: seedPosition[0],
        targetY: seedPosition[1],
        xStrength: isSingleAnchorMode
          ? isStableMembership
            ? 0.44
            : 0.32
          : isStableMembership
            ? 0.26
            : 0.14,
        yStrength: isSingleAnchorMode
          ? isStableMembership
            ? 0.52
            : 0.38
          : isStableMembership
            ? 0.32
            : 0.18,
      }
    })

  const nodeByPubkey = new Map(layoutNodes.map((node) => [node.pubkey, node]))
  const layoutLinks = createComparisonLinks({
    visiblePubkeys,
    links,
    rootNodePubkey,
    activeAnchorPubkeys,
    isSingleAnchorMode,
  }).filter(
    (link) =>
      nodeByPubkey.has(link.source as string) &&
      nodeByPubkey.has(link.target as string),
  )

  if (activeAnchorPubkeys.length === 2) {
    const positions = buildTwoAnchorPartitionPositions({
      visiblePubkeys,
      memberships,
      activeAnchorPubkeys,
      anchorSlots,
    })

    return {
      activeAnchorPubkeys,
      overflowAnchorPubkeys,
      memberships,
      positions,
      snapshot: {
        mode: 'multi-center-comparison',
        comparison: {
          mode: 'multi-center-comparison',
          activeAnchorPubkeys: [...activeAnchorPubkeys],
          comparisonAnchorOrder: [...comparisonAnchorOrder],
          overflowAnchorPubkeys: [...overflowAnchorPubkeys],
          membershipSignatureByPubkey: Object.fromEntries(
            Array.from(memberships.entries()).map(([pubkey, membership]) => [
              pubkey,
              membership.membershipSignature,
            ]),
          ),
          anchorSlots: Object.fromEntries(
            Array.from(anchorSlots.entries()).map(([pubkey, slot]) => [
              pubkey,
              slot,
            ]),
          ),
        },
      },
    }
  }

  if (isSingleAnchorMode) {
    const positions = new Map<string, [number, number]>(
      layoutNodes.map((node) => [node.pubkey, [node.targetX, node.targetY]]),
    )

    return {
      activeAnchorPubkeys,
      overflowAnchorPubkeys,
      memberships,
      positions,
      snapshot: {
        mode: 'multi-center-comparison',
        comparison: {
          mode: 'multi-center-comparison',
          activeAnchorPubkeys: [...activeAnchorPubkeys],
          comparisonAnchorOrder: [...comparisonAnchorOrder],
          overflowAnchorPubkeys: [...overflowAnchorPubkeys],
          membershipSignatureByPubkey: Object.fromEntries(
            Array.from(memberships.entries()).map(([pubkey, membership]) => [
              pubkey,
              membership.membershipSignature,
            ]),
          ),
          anchorSlots: Object.fromEntries(
            Array.from(anchorSlots.entries()).map(([pubkey, slot]) => [
              pubkey,
              slot,
            ]),
          ),
        },
      },
    }
  }

  const simulation = forceSimulation(layoutNodes)
    .alpha(0.95)
    .alphaDecay(0.16)
    .velocityDecay(isSingleAnchorMode ? 0.44 : 0.36)
    .force(
      'many-body',
      forceManyBody<ComparisonLayoutNode>()
        .strength(isSingleAnchorMode ? -16 : -34)
        .distanceMax(isSingleAnchorMode ? 280 : 520),
    )
    .force(
      'collision',
      forceCollide<ComparisonLayoutNode>()
        .radius((node) => node.radius + (isSingleAnchorMode ? 20 : 18))
        .strength(0.95)
        .iterations(3),
    )
    .force(
      'target-x',
      forceX<ComparisonLayoutNode>((node) => node.targetX).strength(
        (node) => node.xStrength,
      ),
    )
    .force(
      'target-y',
      forceY<ComparisonLayoutNode>((node) => node.targetY).strength(
        (node) => node.yStrength,
      ),
    )
    .force(
      'links',
      forceLink<ComparisonLayoutNode, ComparisonLayoutLink>(layoutLinks)
        .id((node) => node.id)
        .strength((link) => link.strength)
        .distance((link) => link.distance),
    )
    .stop()

  for (let tick = 0; tick < ticks; tick += 1) {
    simulation.tick()
  }

  simulation.stop()

  const positions = new Map<string, [number, number]>(
    layoutNodes.map((node) => [node.pubkey, [node.x, node.y]]),
  )

  return {
    activeAnchorPubkeys,
    overflowAnchorPubkeys,
    memberships,
    positions,
    snapshot: {
      mode: 'multi-center-comparison',
      comparison: {
        mode: 'multi-center-comparison',
        activeAnchorPubkeys: [...activeAnchorPubkeys],
        comparisonAnchorOrder: [...comparisonAnchorOrder],
        overflowAnchorPubkeys: [...overflowAnchorPubkeys],
        membershipSignatureByPubkey: Object.fromEntries(
          Array.from(memberships.entries()).map(([pubkey, membership]) => [
            pubkey,
            membership.membershipSignature,
          ]),
        ),
        anchorSlots: Object.fromEntries(
          Array.from(anchorSlots.entries()).map(([pubkey, slot]) => [
            pubkey,
            slot,
          ]),
        ),
      },
    },
  }
}
