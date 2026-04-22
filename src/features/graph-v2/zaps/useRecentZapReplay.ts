'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type NDK from '@nostr-dev-kit/ndk'
import type { NDKEvent, NDKSubscription } from '@nostr-dev-kit/ndk'

import { connectNDK } from '@/lib/nostr'
import type { ParsedZap } from '@/features/graph-v2/zaps/zapParser'
import { parseZapReceiptEvent } from '@/features/graph-v2/zaps/zapParser'
import { traceZapFlow } from '@/features/graph-runtime/debug/zapTrace'

export const RECENT_ZAP_REPLAY_LOOKBACK_SEC = 60 * 60

const RECENT_ZAP_REPLAY_TARGET_LIMIT = 1024
const RECENT_ZAP_REPLAY_BATCH_SIZE = 128
const RECENT_ZAP_REPLAY_MAX_EVENTS = 180
const RECENT_ZAP_REPLAY_FETCH_TIMEOUT_MS = 8_000
const RECENT_ZAP_REPLAY_MAX_CONCURRENCY = 2

type RecentZapReplayPhase = 'idle' | 'loading' | 'playing' | 'done' | 'error'

export interface RecentZapReplaySnapshot {
  phase: RecentZapReplayPhase
  message: string | null
  targetCount: number
  truncatedTargetCount: number
  fetchedCount: number
  playableCount: number
  playedCount: number
  droppedCount: number
}

const INITIAL_SNAPSHOT: RecentZapReplaySnapshot = {
  phase: 'idle',
  message: null,
  targetCount: 0,
  truncatedTargetCount: 0,
  fetchedCount: 0,
  playableCount: 0,
  playedCount: 0,
  droppedCount: 0,
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}

function normalizeTargets(pubkeys: readonly string[]): {
  targets: string[]
  truncatedTargetCount: number
} {
  const normalized = Array.from(
    new Set(
      pubkeys
        .map((pubkey) => pubkey.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort()

  return {
    targets: normalized.slice(0, RECENT_ZAP_REPLAY_TARGET_LIMIT),
    truncatedTargetCount: Math.max(0, normalized.length - RECENT_ZAP_REPLAY_TARGET_LIMIT),
  }
}

async function runWithConcurrencyLimit<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(concurrency, items.length))

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex]
        nextIndex += 1
        await worker(item)
      }
    }),
  )
}

async function collectZapReplayBatch({
  ndk,
  batch,
  since,
  until,
}: {
  ndk: NDK
  batch: readonly string[]
  since: number
  until: number
}): Promise<{ events: NDKEvent[]; timedOut: boolean }> {
  return new Promise((resolve) => {
    const eventsById = new Map<string, NDKEvent>()
    let settled = false
    let subscription: NDKSubscription | null = null

    const finish = (timedOut: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      subscription?.stop()
      resolve({ events: Array.from(eventsById.values()), timedOut })
    }

    const timeoutId = setTimeout(() => {
      finish(true)
    }, RECENT_ZAP_REPLAY_FETCH_TIMEOUT_MS)

    subscription = ndk.subscribe(
      {
        kinds: [9735],
        '#p': [...batch],
        since,
        until,
        limit: Math.min(RECENT_ZAP_REPLAY_MAX_EVENTS, Math.max(25, batch.length * 3)),
      },
      { closeOnEose: true },
    )
    subscription.on('event', (event: NDKEvent) => {
      eventsById.set(event.id, event)
    })
    subscription.on('eose', () => finish(false))
    subscription.on('close', () => finish(false))
  })
}

function toRawZapReceiptEvent(event: NDKEvent) {
  return {
    id: event.id,
    kind: event.kind ?? 0,
    tags: event.tags,
    created_at: event.created_at ?? 0,
  }
}

export function useRecentZapReplay({
  enabled,
  visiblePubkeys,
  replayKey,
  onZap,
}: {
  enabled: boolean
  visiblePubkeys: readonly string[]
  replayKey: number
  onZap: (zap: ParsedZap) => boolean
}): RecentZapReplaySnapshot {
  const onZapRef = useRef(onZap)
  useEffect(() => {
    onZapRef.current = onZap
  }, [onZap])

  const targetInfo = useMemo(
    () => normalizeTargets(visiblePubkeys),
    [visiblePubkeys],
  )
  const targetSignature = useMemo(
    () => targetInfo.targets.join(','),
    [targetInfo.targets],
  )
  const [snapshot, setSnapshot] =
    useState<RecentZapReplaySnapshot>(INITIAL_SNAPSHOT)

  useEffect(() => {
    if (!enabled) {
      return
    }

    const targets = targetSignature ? targetSignature.split(',') : []
    if (targets.length === 0) {
      return
    }

    let disposed = false
    let replayTimer: ReturnType<typeof setTimeout> | null = null

    const clearReplayTimer = () => {
      if (replayTimer !== null) {
        clearTimeout(replayTimer)
        replayTimer = null
      }
    }

    const replay = (zaps: readonly ParsedZap[]) => {
      if (disposed) return
      if (zaps.length === 0) {
        setSnapshot((current) => ({
          ...current,
          phase: 'done',
          message: 'No hubo zaps reproducibles en la ultima hora para estos nodos.',
        }))
        return
      }

      const intervalMs = Math.max(140, Math.min(550, Math.floor(12_000 / zaps.length)))
      let playedCount = 0
      let droppedCount = 0

      setSnapshot((current) => ({
        ...current,
        phase: 'playing',
        message: `Reproduciendo ${zaps.length} zaps de la ultima hora...`,
        playableCount: zaps.length,
        playedCount: 0,
        droppedCount: 0,
      }))

      const playNext = (index: number) => {
        if (disposed) return
        const zap = zaps[index]
        if (onZapRef.current(zap)) {
          playedCount += 1
        } else {
          droppedCount += 1
        }

        setSnapshot((current) => ({
          ...current,
          playedCount,
          droppedCount,
        }))

        if (index + 1 >= zaps.length) {
          setSnapshot((current) => ({
            ...current,
            phase: 'done',
            message: `Replay terminado: ${playedCount} zaps visibles, ${droppedCount} descartados porque no se pudieron dibujar en la escena.`,
          }))
          return
        }

        replayTimer = setTimeout(() => playNext(index + 1), intervalMs)
      }

      playNext(0)
    }

    void (async () => {
      const until = Math.floor(Date.now() / 1_000)
      const since = until - RECENT_ZAP_REPLAY_LOOKBACK_SEC
      const batches = chunk(targets, RECENT_ZAP_REPLAY_BATCH_SIZE)
      const eventsById = new Map<string, NDKEvent>()
      let timedOutBatchCount = 0

      setSnapshot({
        phase: 'loading',
        message: `Buscando zaps de la ultima hora para ${targets.length} nodos visibles...`,
        targetCount: targets.length,
        truncatedTargetCount: targetInfo.truncatedTargetCount,
        fetchedCount: 0,
        playableCount: 0,
        playedCount: 0,
        droppedCount: 0,
      })

      traceZapFlow('recentZapReplay.fetchStarted', {
        targetCount: targets.length,
        truncatedTargetCount: targetInfo.truncatedTargetCount,
        batchCount: batches.length,
        since,
        until,
      })

      try {
        const ndk = await connectNDK()
        await runWithConcurrencyLimit(
          batches,
          RECENT_ZAP_REPLAY_MAX_CONCURRENCY,
          async (batch) => {
            if (disposed) return
            const batchResult = await collectZapReplayBatch({
              ndk,
              batch,
              since,
              until,
            })
            if (disposed) return
            if (batchResult.timedOut) {
              timedOutBatchCount += 1
            }
            for (const event of batchResult.events) {
              eventsById.set(event.id, event)
            }
            setSnapshot((current) => ({
              ...current,
              message:
                timedOutBatchCount > 0
                  ? `Buscando zaps de la ultima hora... ${timedOutBatchCount} batches cerraron por timeout parcial.`
                  : current.message,
              fetchedCount: eventsById.size,
            }))
          },
        )

        if (disposed) return

        const parsed = Array.from(eventsById.values())
          .map((event) => parseZapReceiptEvent(toRawZapReceiptEvent(event)))
          .filter((zap): zap is ParsedZap => zap !== null)
          .filter((zap) => zap.createdAt >= since && zap.createdAt <= until)
          .sort((left, right) => {
            if (left.createdAt !== right.createdAt) {
              return left.createdAt - right.createdAt
            }
            return left.eventId.localeCompare(right.eventId)
          })
        const replayZaps = parsed.slice(-RECENT_ZAP_REPLAY_MAX_EVENTS)

        traceZapFlow('recentZapReplay.fetchFinished', {
          fetchedCount: eventsById.size,
          parsedCount: parsed.length,
          replayCount: replayZaps.length,
          timedOutBatchCount,
        })

        setSnapshot((current) => ({
          ...current,
          fetchedCount: eventsById.size,
          playableCount: replayZaps.length,
          message:
            parsed.length > replayZaps.length
              ? `Encontrados ${parsed.length} zaps; mostrando los ${replayZaps.length} mas recientes.`
              : timedOutBatchCount > 0
                ? `Encontrados ${replayZaps.length} zaps reproducibles con ${timedOutBatchCount} timeout parcial.`
                : `Encontrados ${replayZaps.length} zaps reproducibles.`,
        }))
        replay(replayZaps)
      } catch (error) {
        if (disposed) return
        const message =
          error instanceof Error
            ? `No se pudo consultar zaps de la ultima hora: ${error.message}`
            : 'No se pudo consultar zaps de la ultima hora.'
        traceZapFlow('recentZapReplay.fetchFailed', { message })
        setSnapshot((current) => ({
          ...current,
          phase: 'error',
          message,
        }))
      }
    })()

    return () => {
      disposed = true
      clearReplayTimer()
    }
  }, [
    enabled,
    replayKey,
    targetInfo.truncatedTargetCount,
    targetSignature,
  ])

  if (!enabled) {
    return INITIAL_SNAPSHOT
  }

  if (targetInfo.targets.length === 0) {
    return {
      ...INITIAL_SNAPSHOT,
      message: 'Esperando nodos visibles para reproducir zaps de la ultima hora.',
    }
  }

  return snapshot
}
