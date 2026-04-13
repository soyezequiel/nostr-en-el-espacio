import type {
  DiscoveredGraphAnalysisConfidence,
  DiscoveredGraphAnalysisMode,
  DiscoveredGraphAnalysisState,
  DiscoveredGraphAnalysisStatus,
} from '@/features/graph/analysis/types'
import type {
  ComparisonLayoutBudgets,
  ConnectionsSourceLayer,
  GraphLayoutMode,
  GraphLink,
  GraphLinkRelation,
  GraphNode,
  GraphNodeSource,
  EffectiveGraphCaps,
  RootLoadStatus,
  UiLayer,
  ZapLayerEdge,
  RenderConfig,
} from '@/features/graph/app/store/types'

export type GraphRenderStatus =
  | 'empty'
  | 'rendering'
  | 'interactive'
  | 'degraded'

export type GraphRenderDegradedReason =
  | 'cap-reached'
  | 'edge-thinning'
  | 'labels-suppressed'
  | 'worker-error'

export type GraphRenderModelPhase = 'idle' | 'building' | 'ready' | 'error'

export type GraphLabelPolicy = 'hover-selected-only' | 'hover-selected-or-zoom'
export type GraphLayoutRole = 'root' | 'anchor' | 'target' | 'aggregate'

export interface GraphComparisonAnchorSlot {
  pubkey: string
  slotIndex: number
  position: [number, number]
}

export interface GraphComparisonLayoutSnapshot {
  mode: 'multi-center-comparison'
  activeAnchorPubkeys: string[]
  comparisonAnchorOrder: string[]
  overflowAnchorPubkeys: string[]
  membershipSignatureByPubkey: Record<string, string>
  anchorSlots: Record<string, GraphComparisonAnchorSlot>
}

export interface GraphLayoutSnapshot {
  mode: GraphLayoutMode
  comparison: GraphComparisonLayoutSnapshot | null
}

export interface GraphRenderNode {
  id: string
  pubkey: string
  displayLabel: string
  pictureUrl: string | null
  position: [number, number]
  radius: number
  visibleDegree: number
  keywordHits: number
  isRoot: boolean
  isExpanded: boolean
  isSelected: boolean
  isCommonFollow: boolean
  layoutRole: GraphLayoutRole
  ownerAnchorPubkeys: string[]
  membershipSignature: string
  sharedCount: number
  comparisonContextRole?:
    | 'root-follow-context'
    | 'root-follow-context-aggregate'
    | 'compare-secondary-context'
    | 'compare-secondary-context-aggregate'
    | 'compare-signature-aggregate'
  isAggregate?: boolean
  aggregateCount?: number | null
  source: GraphNodeSource
  discoveredAt: number | null
  sharedByExpandedCount: number
  fillColor?: [number, number, number, number]
  lineColor?: [number, number, number, number]
  bridgeHaloColor?: [number, number, number, number] | null
  analysisCommunityId?: string | null
  nearestNeighborWorldDist?: number
  isPathNode?: boolean
  isPathEndpoint?: boolean
  pathOrder?: number | null
}

export interface GraphRenderEdge {
  id: string
  source: string
  target: string
  relation: GraphLinkRelation
  weight: number
  sourcePosition: [number, number]
  targetPosition: [number, number]
  sourceRadius: number
  targetRadius: number
  isPriority: boolean
  targetSharedByExpandedCount: number
  comparisonRole?: 'root-follow-context' | 'root-follow-context-aggregate'
    | 'compare-signature-aggregate'
  isSynthetic?: boolean
  isPathEdge?: boolean
}

export interface GraphRenderLabel {
  id: string
  pubkey: string
  text: string
  position: [number, number]
  radius: number
  isRoot: boolean
  isAnchor?: boolean
  isAggregate?: boolean
  comparisonContextRole?:
    | 'root-follow-context'
    | 'root-follow-context-aggregate'
    | 'compare-secondary-context'
    | 'compare-secondary-context-aggregate'
    | 'compare-signature-aggregate'
  isSelected: boolean
}

export interface AccessibleNodeSummary {
  id: string
  pubkey: string
  displayLabel: string
  isRoot: boolean
  source: GraphNodeSource
}

export interface GraphBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface GraphRenderLodSummary {
  labelPolicy: GraphLabelPolicy
  labelsSuppressedByBudget: boolean
  edgesThinned: boolean
  thinnedEdgeCount: number
  candidateEdgeCount: number
  visibleEdgeCount: number
  visibleNodeCount: number
  degradedReasons: GraphRenderDegradedReason[]
}

export interface GraphRenderAnalysisLegendItem {
  id: string
  label: string
  nodeCount: number
  color: [number, number, number, number]
  isNeutral: boolean
}

export interface GraphRenderAnalysisOverlay {
  status: DiscoveredGraphAnalysisStatus
  isStale: boolean
  mode: DiscoveredGraphAnalysisMode | null
  confidence: DiscoveredGraphAnalysisConfidence | null
  badgeLabel: string | null
  summary: string | null
  detail: string | null
  legendItems: GraphRenderAnalysisLegendItem[]
}

export interface GraphRenderModel {
  nodes: GraphRenderNode[]
  edges: GraphRenderEdge[]
  labels: GraphRenderLabel[]
  accessibleNodes: AccessibleNodeSummary[]
  bounds: GraphBounds
  topologySignature: string
  layoutKey: string
  layoutMode: GraphLayoutMode
  layoutSnapshot: GraphLayoutSnapshot | null
  lod: GraphRenderLodSummary
  analysisOverlay: GraphRenderAnalysisOverlay
  activeLayer: UiLayer
  renderConfig: RenderConfig
}

export interface BuildGraphRenderModelInput {
  jobKey?: string
  nodes: Record<string, GraphNode>
  links: readonly GraphLink[]
  inboundLinks: readonly GraphLink[]
  /** Pre-derived cross-edges for the connections layer (from cached contact lists). */
  connectionsLinks: readonly GraphLink[]
  zapEdges: readonly ZapLayerEdge[]
  activeLayer: UiLayer
  connectionsSourceLayer: ConnectionsSourceLayer
  rootNodePubkey: string | null
  selectedNodePubkey: string | null
  expandedNodePubkeys: ReadonlySet<string>
  comparedNodePubkeys?: ReadonlySet<string>
  activeComparisonAnchorPubkeys?: readonly string[]
  expandedAggregateNodeIds?: readonly string[]
  comparisonAnchorOrder?: readonly string[]
  layoutMode?: GraphLayoutMode
  comparisonLayoutBudgets?: ComparisonLayoutBudgets
  pathfinding?: {
    status: 'idle' | 'computing' | 'found' | 'not-found' | 'error'
    path: string[] | null
  }
  graphAnalysis?: DiscoveredGraphAnalysisState
  effectiveGraphCaps: EffectiveGraphCaps
  renderConfig: RenderConfig
  previousPositions?: ReadonlyMap<string, [number, number]>
  previousLayoutKey?: string
  previousLayoutSnapshot?: GraphLayoutSnapshot | null
}

export interface GraphRenderState {
  status: GraphRenderStatus
  reasons: GraphRenderDegradedReason[]
}

export interface DeriveGraphRenderStateInput {
  model: GraphRenderModel
  hasViewport: boolean
  rootLoadStatus: RootLoadStatus
  capReached: boolean
  modelPhase: GraphRenderModelPhase
}
