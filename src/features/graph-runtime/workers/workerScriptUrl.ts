const EVENTS_WORKER_SCRIPT_PATH = '/workers/events.worker.js'
const GRAPH_WORKER_SCRIPT_PATH = '/workers/graph.worker.js'
const VERIFY_WORKER_SCRIPT_PATH = '/workers/verify.worker.js'

const WORKER_BUILD_ID = process.env.NEXT_PUBLIC_GRAPH_WORKER_BUILD_ID?.trim() ?? ''

export function buildWorkerScriptUrl(
  workerScriptPath: string,
  buildId = WORKER_BUILD_ID,
): string {
  if (!buildId) {
    return workerScriptPath
  }

  const separator = workerScriptPath.includes('?') ? '&' : '?'
  return `${workerScriptPath}${separator}v=${encodeURIComponent(buildId)}`
}

export const getEventsWorkerScriptUrl = () =>
  buildWorkerScriptUrl(EVENTS_WORKER_SCRIPT_PATH)

export const getGraphWorkerScriptUrl = () =>
  buildWorkerScriptUrl(GRAPH_WORKER_SCRIPT_PATH)

export const getVerifyWorkerScriptUrl = () =>
  buildWorkerScriptUrl(VERIFY_WORKER_SCRIPT_PATH)
