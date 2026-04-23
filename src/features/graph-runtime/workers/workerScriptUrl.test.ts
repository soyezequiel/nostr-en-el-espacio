import assert from 'node:assert/strict'
import test from 'node:test'

const { buildWorkerScriptUrl } = await import('./workerScriptUrl.ts')

test('buildWorkerScriptUrl leaves the worker path untouched when no build id is present', () => {
  assert.equal(buildWorkerScriptUrl('/workers/events.worker.js', ''), '/workers/events.worker.js')
})

test('buildWorkerScriptUrl appends a build id query param for plain worker paths', () => {
  assert.equal(
    buildWorkerScriptUrl('/workers/events.worker.js', 'build-123'),
    '/workers/events.worker.js?v=build-123',
  )
})

test('buildWorkerScriptUrl appends the build id with & when the path already has a query', () => {
  assert.equal(
    buildWorkerScriptUrl('/workers/events.worker.js?debug=1', 'build id'),
    '/workers/events.worker.js?debug=1&v=build%20id',
  )
})
