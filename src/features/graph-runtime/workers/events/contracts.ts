import type { WorkerActionMap, WorkerDiagnostic } from '@/features/graph-runtime/workers/shared/protocol'

export interface SerializedContactListEvent {
  id: string
  pubkey: string
  kind: number
  createdAt: number
  tags: string[][]
}

export interface ParseContactListRequest {
  event: SerializedContactListEvent
  maxFollowTags?: number
}

export interface DiscoveredGraphNode {
  pubkey: string
}

export interface DiscoveredGraphLink {
  sourcePubkey: string
  targetPubkey: string
}

export interface ParseContactListResult {
  nodes: DiscoveredGraphNode[]
  links: DiscoveredGraphLink[]
  followPubkeys: string[]
  relayHints: string[]
  diagnostics: WorkerDiagnostic[]
}

export interface ZapReceiptInput {
  id: string
  kind: number
  createdAt: number
  tags: string[][]
}

export interface DecodeZapsRequest {
  events: ZapReceiptInput[]
}

export interface ZapEdge {
  eventId: string
  fromPubkey: string
  toPubkey: string
  sats: number
  createdAt: number
}

export interface DecodeZapsResult {
  zapEdges: ZapEdge[]
  skippedReceipts: WorkerDiagnostic[]
}

export interface EventsWorkerActionMap extends WorkerActionMap {
  PARSE_CONTACT_LIST: {
    request: ParseContactListRequest
    response: ParseContactListResult
  }
  DECODE_ZAPS: {
    request: DecodeZapsRequest
    response: DecodeZapsResult
  }
}
