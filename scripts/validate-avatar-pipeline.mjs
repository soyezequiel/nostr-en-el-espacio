import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'

import { chromium } from 'playwright'

const DEFAULT_ROOT =
  'npub18m76awca3y37hkvuneavuw6pjj4525fw90necxmadrvjg0sdy6qsngq955'
const DEFAULT_PORT = 3200
const DEFAULT_SAMPLE_INTERVAL_MS = 100
const DEFAULT_SETTLE_MS = 1500
const DEFAULT_TIMEOUT_MS = 45000
const DEFAULT_VIEWPORT = { width: 1440, height: 900 }
const PROBE_WINDOW_KEY = '__NOSTR_AVATAR_PIPELINE_PROBE__'

function parseArgs(argv) {
  const options = {
    headless: true,
    output: null,
    port: DEFAULT_PORT,
    root: DEFAULT_ROOT,
    sampleIntervalMs: DEFAULT_SAMPLE_INTERVAL_MS,
    serverUrl: null,
    settleMs: DEFAULT_SETTLE_MS,
    skipBuild: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--output') {
      options.output = argv[index + 1] ?? null
      index += 1
      continue
    }

    if (arg === '--port') {
      options.port = Number(argv[index + 1] ?? DEFAULT_PORT)
      index += 1
      continue
    }

    if (arg === '--root') {
      options.root = argv[index + 1] ?? DEFAULT_ROOT
      index += 1
      continue
    }

    if (arg === '--sample-interval-ms') {
      options.sampleIntervalMs = Number(
        argv[index + 1] ?? DEFAULT_SAMPLE_INTERVAL_MS,
      )
      index += 1
      continue
    }

    if (arg === '--server-url') {
      options.serverUrl = argv[index + 1] ?? null
      index += 1
      continue
    }

    if (arg === '--settle-ms') {
      options.settleMs = Number(argv[index + 1] ?? DEFAULT_SETTLE_MS)
      index += 1
      continue
    }

    if (arg === '--timeout-ms') {
      options.timeoutMs = Number(argv[index + 1] ?? DEFAULT_TIMEOUT_MS)
      index += 1
      continue
    }

    if (arg === '--skip-build') {
      options.skipBuild = true
      continue
    }

    if (arg === '--headed') {
      options.headless = false
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!Number.isFinite(options.port) || options.port <= 0) {
    throw new Error('The --port value must be a positive number.')
  }

  for (const [label, value] of [
    ['sample interval', options.sampleIntervalMs],
    ['settle window', options.settleMs],
    ['timeout', options.timeoutMs],
  ]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`The ${label} value must be a positive number.`)
    }
  }

  return options
}

function resolveNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function spawnWithFallback(command, args, options) {
  try {
    return spawn(command, args, options)
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'EINVAL'
    ) {
      throw new Error(
        'This shell does not allow the validator to spawn child processes. Start the production server separately and rerun with --server-url http://127.0.0.1:<port>.',
      )
    }

    throw error
  }
}

function spawnCommand(command, args, { cwd, label }) {
  const child = spawnWithFallback(command, args, {
    cwd,
    env: process.env,
    stdio: 'pipe',
  })

  child.stdout?.on('data', (chunk) => {
    process.stdout.write(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk)
  })

  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${label} exited with code ${code ?? 'unknown'}.`))
    })
  })
}

async function waitForServerReady(baseUrl, timeoutMs, managedServerProcess) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (
      managedServerProcess &&
      managedServerProcess.exitCode !== null &&
      managedServerProcess.exitCode !== 0
    ) {
      throw new Error(
        `The managed next start process exited with code ${managedServerProcess.exitCode}.`,
      )
    }

    try {
      const response = await fetch(baseUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(2000),
      })
      if (response.ok || response.status === 307 || response.status === 308) {
        return
      }
    } catch {
      // Keep polling until the timeout expires.
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for ${baseUrl} to become ready.`)
}

function isSettledSnapshot(snapshot) {
  return (
    snapshot.rootLoadStatus !== 'loading' &&
    snapshot.visibleNodes > 0 &&
    snapshot.runtimeReadyVisibleNodes > 0 &&
    snapshot.paintedVisibleNodes > 0 &&
    snapshot.visibleQueuedRequests === 0 &&
    snapshot.visibleInFlightRequests === 0 &&
    snapshot.iconLayerPendingVisibleNodes === 0 &&
    snapshot.runtimePaintGap === 0
  )
}

function hasAvatarPipelineActivity(snapshot) {
  return (
    snapshot.visibleNodes > 0 ||
    snapshot.visibleQueuedRequests > 0 ||
    snapshot.visibleInFlightRequests > 0 ||
    snapshot.runtimeReadyVisibleNodes > 0 ||
    snapshot.paintedVisibleNodes > 0 ||
    snapshot.iconLayerPendingVisibleNodes > 0
  )
}

function findFirstOffset(samples, measurementStartedAt, predicate) {
  const match = samples.find(predicate)
  return match ? roundMs(match.sampledAt - measurementStartedAt) : null
}

function roundMs(value) {
  return Number(value.toFixed(1))
}

function roundRatio(value) {
  return value === null ? null : Number(value.toFixed(4))
}

function summariseRun({
  measurementStartedAt,
  samples,
  settledAt,
  timeoutHit,
}) {
  const finalSnapshot = samples.at(-1)
  if (!finalSnapshot) {
    throw new Error('No avatar probe samples were captured.')
  }

  const maxVisibleQueuedRequests = Math.max(
    ...samples.map((sample) => sample.visibleQueuedRequests),
  )
  const maxVisibleInFlightRequests = Math.max(
    ...samples.map((sample) => sample.visibleInFlightRequests),
  )
  const maxHydrationBacklog = Math.max(
    ...samples.map((sample) => sample.hydrationBacklog),
  )
  const maxProxyFallbackSources = Math.max(
    ...samples.map((sample) => sample.proxyFallbackSources),
  )
  const maxRuntimePaintGap = Math.max(
    ...samples.map((sample) => sample.runtimePaintGap),
  )
  const maxCriticalVisibleBaseQueuedRequests = Math.max(
    ...samples.map((sample) => sample.queuedCriticalVisibleBaseRequests),
  )
  const maxCriticalVisibleBaseInFlightRequests = Math.max(
    ...samples.map((sample) => sample.inFlightCriticalVisibleBaseRequests),
  )

  return {
    timeToFirstVisibleScreenMs: findFirstOffset(
      samples,
      measurementStartedAt,
      (sample) => sample.visibleScreenNodes > 0,
    ),
    timeToFirstVisibleRequestMs: findFirstOffset(
      samples,
      measurementStartedAt,
      (sample) => sample.visibleNodes > 0,
    ),
    timeToFirstRuntimeReadyMs: findFirstOffset(
      samples,
      measurementStartedAt,
      (sample) => sample.runtimeReadyVisibleNodes > 0,
    ),
    timeToFirstPaintedMs: findFirstOffset(
      samples,
      measurementStartedAt,
      (sample) => sample.paintedVisibleNodes > 0,
    ),
    timeTo50PctPaintedMs: findFirstOffset(
      samples,
      measurementStartedAt,
      (sample) => (sample.visiblePaintCoverage ?? 0) >= 0.5,
    ),
    timeTo90PctPaintedMs: findFirstOffset(
      samples,
      measurementStartedAt,
      (sample) => (sample.visiblePaintCoverage ?? 0) >= 0.9,
    ),
    settledAtMs:
      settledAt === null ? null : roundMs(settledAt - measurementStartedAt),
    peakVisibleQueuedRequests: maxVisibleQueuedRequests,
    peakVisibleInFlightRequests: maxVisibleInFlightRequests,
    peakCriticalVisibleBaseQueuedRequests: maxCriticalVisibleBaseQueuedRequests,
    peakCriticalVisibleBaseInFlightRequests:
      maxCriticalVisibleBaseInFlightRequests,
    peakRuntimeReadyVisibleNodes: Math.max(
      ...samples.map((sample) => sample.runtimeReadyVisibleNodes),
    ),
    peakPaintedVisibleNodes: Math.max(
      ...samples.map((sample) => sample.paintedVisibleNodes),
    ),
    maxHydrationBacklog,
    maxProxyFallbackSources,
    maxRuntimePaintGap,
    finalVisibleScreenNodes: finalSnapshot.visibleScreenNodes,
    finalRuntimeReadyVisibleNodes: finalSnapshot.runtimeReadyVisibleNodes,
    finalPaintedVisibleNodes: finalSnapshot.paintedVisibleNodes,
    finalVisibleQueuedRequests: finalSnapshot.visibleQueuedRequests,
    finalVisibleInFlightRequests: finalSnapshot.visibleInFlightRequests,
    finalHydrationBacklog: finalSnapshot.hydrationBacklog,
    finalProxyFallbackSources: finalSnapshot.proxyFallbackSources,
    finalRuntimePaintGap: finalSnapshot.runtimePaintGap,
    finalPaintCoverage: roundRatio(finalSnapshot.visiblePaintCoverage),
    timedOutBeforeSettled: timeoutHit && settledAt === null,
  }
}

function printSummary(result) {
  const { environment, measurement, summary } = result
  console.log('')
  console.log('Avatar pipeline validation')
  console.log(`- Server: ${environment.baseUrl}`)
  console.log(`- Managed prod server: ${environment.managedServer ? 'yes' : 'no'}`)
  console.log(
    `- Viewport: ${measurement.viewport.width}x${measurement.viewport.height}`,
  )
  console.log(`- Root: ${measurement.root}`)
  console.log(`- Samples: ${measurement.sampleCount}`)
  console.log(
    `- First visible avatar request: ${summary.timeToFirstVisibleRequestMs ?? 'n/a'} ms`,
  )
  console.log(
    `- First runtime-ready visible: ${summary.timeToFirstRuntimeReadyMs ?? 'n/a'} ms`,
  )
  console.log(
    `- First painted visible: ${summary.timeToFirstPaintedMs ?? 'n/a'} ms`,
  )
  console.log(`- 50% painted coverage: ${summary.timeTo50PctPaintedMs ?? 'n/a'} ms`)
  console.log(`- 90% painted coverage: ${summary.timeTo90PctPaintedMs ?? 'n/a'} ms`)
  console.log(`- Settled: ${summary.settledAtMs ?? 'n/a'} ms`)
  console.log(
    `- Peak visible queue/in-flight: ${summary.peakVisibleQueuedRequests}/${summary.peakVisibleInFlightRequests}`,
  )
  console.log(
    `- Peak critical base queue/in-flight: ${summary.peakCriticalVisibleBaseQueuedRequests}/${summary.peakCriticalVisibleBaseInFlightRequests}`,
  )
  console.log(
    `- Peak proxy fallback sources: ${summary.maxProxyFallbackSources}`,
  )
  console.log(`- Peak hydration backlog: ${summary.maxHydrationBacklog}`)
  console.log(`- Peak runtime->paint gap: ${summary.maxRuntimePaintGap}`)
  console.log(
    `- Final painted coverage: ${summary.finalPaintedVisibleNodes}/${summary.finalVisibleScreenNodes} (${summary.finalPaintCoverage ?? 'n/a'})`,
  )
}

async function writeOutput(outputPath, result) {
  const absolutePath = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(process.cwd(), outputPath)

  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(`- Wrote JSON report: ${absolutePath}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const cwd = process.cwd()
  const managedServer = options.serverUrl === null
  const baseUrl = options.serverUrl ?? `http://127.0.0.1:${options.port}`
  const npmCommand = resolveNpmCommand()
  let managedServerProcess = null
  let browser = null

  try {
    if (managedServer) {
      if (!options.skipBuild) {
        await spawnCommand(npmCommand, ['run', 'build'], {
          cwd,
          label: 'npm run build',
        })
      }

      managedServerProcess = spawnWithFallback(
        npmCommand,
        [
          'run',
          'start',
          '--',
          '--hostname',
          '127.0.0.1',
          '--port',
          String(options.port),
        ],
        {
          cwd,
          env: process.env,
          stdio: 'pipe',
        },
      )

      managedServerProcess.stdout?.on('data', (chunk) => {
        process.stdout.write(chunk)
      })
      managedServerProcess.stderr?.on('data', (chunk) => {
        process.stderr.write(chunk)
      })
    }

    await waitForServerReady(baseUrl, options.timeoutMs, managedServerProcess)

    browser = await chromium.launch({ headless: options.headless })
    const context = await browser.newContext({
      viewport: DEFAULT_VIEWPORT,
    })
    const page = await context.newPage()

    await page.goto(`${baseUrl}/?avatarProbe=1`, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs,
    })
    await page.locator('#root-pointer-input').waitFor({
      state: 'visible',
      timeout: options.timeoutMs,
    })

    await page.locator('#root-pointer-input').fill(options.root)
    const measurementStartedAt = await page.evaluate(() => performance.now())

    let settledSinceWallClock = null
    let settledAt = null
    let hasSeenPipelineActivity = false
    let lastSampledAt = -1
    const samples = []
    const deadline = Date.now() + options.timeoutMs

    while (Date.now() < deadline) {
      const latest = await page.evaluate((probeWindowKey) => {
        return window[probeWindowKey]?.latest ?? null
      }, PROBE_WINDOW_KEY)

      if (latest && latest.sampledAt >= measurementStartedAt) {
        if (latest.sampledAt !== lastSampledAt) {
          samples.push(latest)
          lastSampledAt = latest.sampledAt
        }

        if (hasAvatarPipelineActivity(latest)) {
          hasSeenPipelineActivity = true
        }

        if (hasSeenPipelineActivity && isSettledSnapshot(latest)) {
          settledSinceWallClock ??= Date.now()
          if (Date.now() - settledSinceWallClock >= options.settleMs) {
            settledAt = latest.sampledAt
            break
          }
        } else {
          settledSinceWallClock = null
        }
      }

      await page.waitForTimeout(options.sampleIntervalMs)
    }

    const timeoutHit = settledAt === null
    if (samples.length === 0) {
      throw new Error(
        'The avatar probe did not emit any samples. Open the page with ?avatarProbe=1 or check for runtime errors.',
      )
    }

    const result = {
      generatedAt: new Date().toISOString(),
      workflowVersion: 1,
      environment: {
        baseUrl,
        managedServer,
        nodeEnv: 'production-like',
      },
      measurement: {
        root: options.root,
        viewport: DEFAULT_VIEWPORT,
        sampleIntervalMs: options.sampleIntervalMs,
        settleMs: options.settleMs,
        timeoutMs: options.timeoutMs,
        sampleCount: samples.length,
      },
      summary: summariseRun({
        measurementStartedAt,
        samples,
        settledAt,
        timeoutHit,
      }),
      finalSnapshot: samples.at(-1),
      samples,
    }

    printSummary(result)

    if (options.output) {
      await writeOutput(options.output, result)
    }

    await context.close()
  } finally {
    await browser?.close()

    if (managedServerProcess && managedServerProcess.exitCode === null) {
      managedServerProcess.kill()
    }
  }
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Unknown avatar validation error.'
  console.error(message)
  process.exitCode = 1
})
