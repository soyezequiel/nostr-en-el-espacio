import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const SMALLER_IS_BETTER = [
  'timeToFirstVisibleRequestMs',
  'timeToFirstRuntimeReadyMs',
  'timeToFirstPaintedMs',
  'timeTo50PctPaintedMs',
  'timeTo90PctPaintedMs',
  'settledAtMs',
  'peakVisibleQueuedRequests',
  'peakVisibleInFlightRequests',
  'peakCriticalVisibleBaseQueuedRequests',
  'peakCriticalVisibleBaseInFlightRequests',
  'maxHydrationBacklog',
  'maxProxyFallbackSources',
  'maxRuntimePaintGap',
]

const LARGER_IS_BETTER = ['finalPaintCoverage', 'peakPaintedVisibleNodes']

function formatValue(value) {
  return value === null || value === undefined ? 'n/a' : String(value)
}

function parseMaybeNumber(value) {
  return typeof value === 'number' ? value : null
}

function formatDelta(before, after) {
  if (before === null || after === null) {
    return 'n/a'
  }

  const delta = Number((after - before).toFixed(4))
  return delta > 0 ? `+${delta}` : String(delta)
}

function verdict(metric, before, after) {
  if (before === null || after === null) {
    return 'n/a'
  }

  if (SMALLER_IS_BETTER.includes(metric)) {
    if (after < before) {
      return 'improved'
    }
    if (after > before) {
      return 'regressed'
    }
    return 'flat'
  }

  if (LARGER_IS_BETTER.includes(metric)) {
    if (after > before) {
      return 'improved'
    }
    if (after < before) {
      return 'regressed'
    }
    return 'flat'
  }

  return 'context'
}

async function readJson(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath)
  const raw = await readFile(absolutePath, 'utf8')
  return JSON.parse(raw)
}

async function main() {
  const [beforePath, afterPath] = process.argv.slice(2)
  if (!beforePath || !afterPath) {
    throw new Error(
      'Usage: node scripts/compare-avatar-pipeline.mjs <before.json> <after.json>',
    )
  }

  const [before, after] = await Promise.all([
    readJson(beforePath),
    readJson(afterPath),
  ])

  const metrics = [
    'timeToFirstVisibleRequestMs',
    'timeToFirstRuntimeReadyMs',
    'timeToFirstPaintedMs',
    'timeTo50PctPaintedMs',
    'timeTo90PctPaintedMs',
    'settledAtMs',
    'peakVisibleQueuedRequests',
    'peakVisibleInFlightRequests',
    'peakCriticalVisibleBaseQueuedRequests',
    'peakCriticalVisibleBaseInFlightRequests',
    'maxHydrationBacklog',
    'maxProxyFallbackSources',
    'maxRuntimePaintGap',
    'finalPaintCoverage',
    'finalVisibleScreenNodes',
    'finalPaintedVisibleNodes',
  ]

  console.log('')
  console.log('Avatar pipeline comparison')
  console.log(`- Before: ${beforePath}`)
  console.log(`- After: ${afterPath}`)

  for (const metric of metrics) {
    const beforeValue = parseMaybeNumber(before.summary?.[metric])
    const afterValue = parseMaybeNumber(after.summary?.[metric])
    console.log(
      `- ${metric}: ${formatValue(beforeValue)} -> ${formatValue(afterValue)} (${formatDelta(beforeValue, afterValue)}; ${verdict(metric, beforeValue, afterValue)})`,
    )
  }

  console.log(
    `- timedOutBeforeSettled: ${before.summary?.timedOutBeforeSettled} -> ${after.summary?.timedOutBeforeSettled}`,
  )
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Unknown avatar comparison error.'
  console.error(message)
  process.exitCode = 1
})
