import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const source = () =>
  readFileSync(
    join(process.cwd(), 'src/features/graph-v2/ui/GraphAppV2.tsx'),
    'utf8',
  )

test('root changes clear all replay activity surfaces', () => {
  const graphAppSource = source()

  assert.match(
    graphAppSource,
    /setZapActivityLog\(\[\]\)[\s\S]*setGraphEventActivityLog\(\[\]\)/,
  )
  assert.match(graphAppSource, /setSelectedZapDetailId\(null\)/)
  assert.match(graphAppSource, /setSelectedGraphEventDetailId\(null\)/)
  assert.match(graphAppSource, /setSelectedZapOffGraphIdentity\(null\)/)
})

test('stale activity callbacks are gated by the active root', () => {
  const graphAppSource = source()

  assert.doesNotMatch(
    graphAppSource,
    /useRef\(sceneState\.rootPubkey\)/,
  )
  assert.match(graphAppSource, /activityRootPubkeyRef\.current = pubkey/)
  assert.match(
    graphAppSource,
    /activityRootPubkeyRef\.current !== sceneState\.rootPubkey/,
  )
})
