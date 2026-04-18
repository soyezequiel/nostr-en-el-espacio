'use client'

import { useEffect, useMemo, useRef } from 'react'
import type NDK from '@nostr-dev-kit/ndk'
import type { NDKEvent, NDKSubscription } from '@nostr-dev-kit/ndk'

import { connectNDK } from '@/lib/nostr'
import { parseZapReceiptEvent, type ParsedZap } from '@/features/graph-v2/zaps/zapParser'

// Subscribe to kind-9735 zap receipts targeting any of the visible pubkeys.
// We re-subscribe whenever the visible set changes; zap receipts arrive
// imperatively via onZap. The hook deduplicates by event id in a bounded LRU
// so a receipt fanned out from several relays only triggers one animation.

const SEEN_CACHE_LIMIT = 500
const MAX_ZAP_FILTER_PUBKEYS = 256
// Relay zap receipts often backfill aggressively; ignore anything older than
// this window so we only animate "live" zaps, not history.
const MAX_RECEIPT_AGE_MS = 120_000

export function useLiveZapFeed({
  visiblePubkeys,
  enabled,
  onZap,
}: {
  visiblePubkeys: readonly string[]
  enabled: boolean
  onZap: (zap: ParsedZap) => void
}): void {
  const onZapRef = useRef(onZap)
  useEffect(() => {
    onZapRef.current = onZap
  }, [onZap])

  // Stable signature of visible pubkeys so effect only re-fires on real change.
  // Dense graph layers can expose thousands of pubkeys; subscribing all of them
  // creates huge relay filters and makes layer switching pay network cleanup
  // costs. Skip live-zap animation once the scene is too broad.
  const signature = useMemo(() => {
    if (!enabled || visiblePubkeys.length > MAX_ZAP_FILTER_PUBKEYS) {
      return ''
    }

    return [...visiblePubkeys]
      .map((pubkey) => pubkey.toLowerCase())
      .sort()
      .join(',')
  }, [enabled, visiblePubkeys])

  useEffect(() => {
    if (!enabled) return
    const pubkeys = signature ? signature.split(',') : []
    if (pubkeys.length === 0) return

    let disposed = false
    let subscription: NDKSubscription | null = null
    const seen = new Set<string>()
    const seenOrder: string[] = []
    const startedAtMs = Date.now()

    const remember = (eventId: string): boolean => {
      if (seen.has(eventId)) return false
      seen.add(eventId)
      seenOrder.push(eventId)
      while (seenOrder.length > SEEN_CACHE_LIMIT) {
        const evicted = seenOrder.shift()
        if (evicted) seen.delete(evicted)
      }
      return true
    }

    void (async () => {
      let ndk: NDK
      try {
        ndk = await connectNDK()
      } catch {
        return
      }
      if (disposed) return

      subscription = ndk.subscribe(
        { kinds: [9735], '#p': pubkeys },
        { closeOnEose: false },
      )
      subscription.on('event', (event: NDKEvent) => {
        if (disposed) return
        if (!remember(event.id)) return

        const parsed = parseZapReceiptEvent({
          id: event.id,
          kind: event.kind ?? 0,
          tags: event.tags,
          created_at: event.created_at ?? 0,
        })
        if (!parsed) return

        const ageMs = Date.now() - parsed.createdAt * 1_000
        // Drop stale backfill but always let through zaps issued since we
        // started subscribing — those are genuinely live.
        if (ageMs > MAX_RECEIPT_AGE_MS && parsed.createdAt * 1_000 < startedAtMs) {
          return
        }

        onZapRef.current(parsed)
      })
    })()

    return () => {
      disposed = true
      subscription?.stop()
      subscription = null
    }
  }, [enabled, signature])
}
