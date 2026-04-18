import type { GraphNodeSource, RelayHealthStatus } from '@/features/graph-runtime/app/store/types'
import type { DiscoveredGraphAnalysisResult } from '@/features/graph-runtime/analysis/types'
import type { WorkerActionMap } from '@/features/graph-runtime/workers/shared/protocol'

export interface GraphLinkInput {
  sourcePubkey: string
  targetPubkey: string
}

export interface AnalyzeDiscoveredGraphNodeInput {
  pubkey: string
  source: GraphNodeSource
}

export interface AnalyzeDiscoveredGraphRequest {
  jobKind: 'ANALYZE_DISCOVERED_GRAPH'
  jobKey: string
  analysisKey: string
  nodes: AnalyzeDiscoveredGraphNodeInput[]
  links: Array<{
    source: string
    target: string
    relation: 'follow' | 'inbound' | 'zap'
  }>
  rootNodePubkey: string | null
  capReached: boolean
  isGraphStale: boolean
  relayHealth: Record<string, { status: RelayHealthStatus }>
}

export interface GraphWorkerJobMetadata {
  jobKind: 'ANALYZE_DISCOVERED_GRAPH'
  jobKey: string
}

export interface FindPathRequest {
  sourcePubkey: string
  targetPubkey: string
  adjacency: Record<string, string[]>
  algorithm?: 'bfs' | 'dijkstra'
}

export interface FindPathResult {
  path: string[] | null
  visitedCount: number
  algorithm: 'bfs' | 'dijkstra'
}

export interface CalcDegreesRequest {
  adjacency?: Record<string, string[]>
  links?: GraphLinkInput[]
}

export interface NodeDegree {
  inbound: number
  outbound: number
  total: number
}

export interface CalcDegreesResult {
  degrees: Record<string, NodeDegree>
}

export interface GraphWorkerActionMap extends WorkerActionMap {
  ANALYZE_DISCOVERED_GRAPH: {
    request: AnalyzeDiscoveredGraphRequest
    response: DiscoveredGraphAnalysisResult
  }
  FIND_PATH: {
    request: FindPathRequest
    response: FindPathResult
  }
  CALC_DEGREES: {
    request: CalcDegreesRequest
    response: CalcDegreesResult
  }
}
