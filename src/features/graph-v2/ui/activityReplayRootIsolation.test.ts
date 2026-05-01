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

test('activity replay runtime is not mounted by the visible activities panel', () => {
  const graphAppSource = source()

  assert.match(graphAppSource, /usePersistentActivityReplayController\({/)
  assert.match(
    graphAppSource,
    /const renderActivitiesContent = \(\) => \(\s*<SigmaActivityPanelV3 \{\.\.\.activityPanelProps\} \/>\s*\)/,
  )
  assert.doesNotMatch(graphAppSource, /const activityPanelContent = useMemo/)
  assert.doesNotMatch(graphAppSource, /<SigmaActivityReplayController/)
})

test('recent replay completion returns activity mode to live', () => {
  const graphAppSource = source()

  assert.match(graphAppSource, /onRecentReplayComplete: \(\) => void/)
  assert.match(graphAppSource, /RECENT_REPLAY_RETURN_TO_LIVE_DELAY_MS = 1_500/)
  assert.match(
    graphAppSource,
    /const handleRecentReplayComplete = useCallback\(\(\) => \{[\s\S]*setZapFeedMode\('live'\)[\s\S]*setRecentZapReplayPlaybackPaused\(false\)[\s\S]*setActivityOverlayPaused\(false\)/,
  )
})
