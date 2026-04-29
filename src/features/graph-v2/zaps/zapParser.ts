// Lightweight NIP-57 zap receipt parser for the /labs/sigma real-time feed.
// Mirrors the decoding rules from the worker-based pipeline in
// src/features/graph-runtime/workers/events/handlers.ts (parseAmountTagToSats,
// parseBolt11ToSats, parseZapDescription) without the persistence/diagnostics
// machinery, since here we only need a best-effort visual trigger.

const BOLT11_AMOUNT_RE = /^ln(?:bc|tb|bcrt)(\d+)?([munp]?)(?=1)/i

function findTag(tags: readonly (readonly string[])[], name: string): string | undefined {
  for (const tag of tags) {
    if (tag[0] === name && typeof tag[1] === 'string') {
      return tag[1]
    }
  }
  return undefined
}

function parseAmountTagToSats(tag: string | undefined): number | null {
  if (!tag) return null
  const millisats = Number.parseInt(tag, 10)
  if (!Number.isFinite(millisats) || millisats <= 0) return null
  return Math.floor(millisats / 1_000)
}

function parseBolt11ToSats(invoice: string | undefined): number | null {
  if (!invoice) return null
  const match = BOLT11_AMOUNT_RE.exec(invoice)
  if (!match) return null
  const [, amountDigits, unit = ''] = match
  if (!amountDigits) return null

  const amount = BigInt(amountDigits)
  const millisatsByUnit: Record<string, bigint> = {
    '': 100_000_000_000n,
    m: 100_000_000n,
    u: 100_000n,
    n: 100n,
  }

  if (unit === 'p') {
    return Number(amount / 10n / 1_000n)
  }

  const multiplier = millisatsByUnit[unit]
  if (multiplier === undefined) return null
  return Number((amount * multiplier) / 1_000n)
}

export interface ParsedZap {
  eventId: string
  fromPubkey: string
  toPubkey: string
  sats: number
  createdAt: number
  // Id del evento original que recibio el zap (tag 'e' del recibo NIP-57).
  // Puede ser null cuando el zap apunta a un perfil y no a una nota concreta.
  zappedEventId: string | null
  // Comentario opcional incluido en la zap request (campo content del JSON
  // dentro del tag description). null si no hay texto util.
  comment: string | null
}

export interface RawZapReceiptEvent {
  id: string
  kind: number
  tags: readonly (readonly string[])[]
  created_at: number
}

export function parseZapReceiptEvent(event: RawZapReceiptEvent): ParsedZap | null {
  if (event.kind !== 9735) return null

  const toPubkeyRaw = findTag(event.tags, 'p')
  if (!toPubkeyRaw) return null

  const description = findTag(event.tags, 'description')
  if (!description) return null

  let senderPubkey: string | undefined
  let comment: string | null = null
  try {
    const parsed: unknown = JSON.parse(description)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'pubkey' in parsed &&
      typeof (parsed as { pubkey?: unknown }).pubkey === 'string'
    ) {
      senderPubkey = (parsed as { pubkey: string }).pubkey
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      'content' in parsed &&
      typeof (parsed as { content?: unknown }).content === 'string'
    ) {
      const trimmed = (parsed as { content: string }).content.trim()
      comment = trimmed.length > 0 ? trimmed : null
    }
  } catch {
    // Ignorar el error de parseo, intentaremos con el tag P
  }

  if (!senderPubkey) {
    senderPubkey = findTag(event.tags, 'P')
  }

  if (!senderPubkey) return null

  const sats =
    parseAmountTagToSats(findTag(event.tags, 'amount')) ??
    parseBolt11ToSats(findTag(event.tags, 'bolt11'))
  if (!sats || sats <= 0) return null

  const zappedEventIdRaw = findTag(event.tags, 'e')
  const zappedEventId =
    zappedEventIdRaw && /^[0-9a-f]{64}$/i.test(zappedEventIdRaw)
      ? zappedEventIdRaw.toLowerCase()
      : null

  return {
    eventId: event.id,
    fromPubkey: senderPubkey.toLowerCase(),
    toPubkey: toPubkeyRaw.toLowerCase(),
    sats,
    createdAt: event.created_at,
    zappedEventId,
    comment,
  }
}
