import { readFileSync } from 'fs'

const raw = readFileSync(process.argv[2], 'utf8')
const data = JSON.parse(raw)

const root = data.dataForRoots[0]

// Build fiber name map from snapshots
const fiberNames = new Map()
for (const snapshot of root.snapshots) {
  if (Array.isArray(snapshot)) {
    for (const entry of snapshot) {
      if (entry && entry.id && entry.displayName) {
        fiberNames.set(entry.id, entry.displayName)
      }
    }
  }
}

console.log('=== COMPONENT NAMES ===')
for (const [id, name] of [...fiberNames.entries()].sort((a,b) => a - b)) {
  console.log(`  fiber-${id}: ${name}`)
}

// Now re-analyze with names
console.log('\n=== TOP COMPONENTS BY TOTAL RENDER TIME ===')
const fiberRenderCounts = new Map()
const fiberRenderTimes = new Map()
for (const commit of root.commitData) {
  if (commit.fiberActualDurations) {
    for (const [fiberId, duration] of commit.fiberActualDurations) {
      fiberRenderCounts.set(fiberId, (fiberRenderCounts.get(fiberId) ?? 0) + 1)
      fiberRenderTimes.set(fiberId, (fiberRenderTimes.get(fiberId) ?? 0) + duration)
    }
  }
}

const sortedByTime = [...fiberRenderTimes.entries()].sort((a, b) => b[1] - a[1])
sortedByTime.slice(0, 25).forEach(([id, totalTime], i) => {
  const count = fiberRenderCounts.get(id) ?? 0
  const name = fiberNames.get(id) ?? `<unknown>`
  console.log(`  ${i+1}. [${name}] (fiber-${id}): ${totalTime.toFixed(1)}ms total, ${count} renders, avg ${(totalTime/count).toFixed(2)}ms`)
})

console.log('\n=== TOP COMPONENTS BY RENDER COUNT ===')
const sortedByCount = [...fiberRenderCounts.entries()].sort((a, b) => b[1] - a[1])
sortedByCount.slice(0, 25).forEach(([id, count], i) => {
  const totalTime = fiberRenderTimes.get(id) ?? 0
  const name = fiberNames.get(id) ?? `<unknown>`
  console.log(`  ${i+1}. [${name}] (fiber-${id}): ${count} renders, ${totalTime.toFixed(1)}ms total, avg ${(totalTime/count).toFixed(2)}ms`)
})

// Commit timeline analysis
console.log('\n=== COMMIT TIMELINE (slowest commits) ===')
const commits = root.commitData
  .map((c, i) => ({ index: i, ...c }))
  .sort((a, b) => b.duration - a.duration)

commits.slice(0, 15).forEach((c, i) => {
  const fibers = (c.fiberActualDurations || [])
    .filter(([_id, dur]) => dur > 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([id, dur]) => `${fiberNames.get(id) || 'unknown'}:${dur.toFixed(1)}ms`)
    .join(', ')
  console.log(`  ${i+1}. Commit #${c.index} at ${c.timestamp?.toFixed(0)}ms: ${c.duration.toFixed(1)}ms [${fibers}]`)
})

// Check for re-render patterns
console.log('\n=== RE-RENDER PATTERN ANALYSIS ===')
const hotFibers = sortedByCount.filter(([_id, count]) => count > 50)
for (const [id, count] of hotFibers) {
  const name = fiberNames.get(id) ?? `<unknown>`
  const totalTime = fiberRenderTimes.get(id) ?? 0
  
  // Check render intervals
  const renderTimestamps = []
  for (const commit of root.commitData) {
    if (commit.fiberActualDurations) {
      const found = commit.fiberActualDurations.find(([fid]) => fid === id)
      if (found) {
        renderTimestamps.push(commit.timestamp)
      }
    }
  }
  
  if (renderTimestamps.length >= 2) {
    const intervals = []
    for (let i = 1; i < renderTimestamps.length; i++) {
      intervals.push(renderTimestamps[i] - renderTimestamps[i-1])
    }
    const avgInterval = intervals.reduce((a,b) => a+b, 0) / intervals.length
    const minInterval = Math.min(...intervals)
    console.log(`  [${name}]: ${count} renders in ${(renderTimestamps[renderTimestamps.length-1] - renderTimestamps[0]).toFixed(0)}ms span`)
    console.log(`    avg interval: ${avgInterval.toFixed(1)}ms, min interval: ${minInterval.toFixed(1)}ms`)
    console.log(`    total cost: ${totalTime.toFixed(1)}ms, avg cost: ${(totalTime/count).toFixed(2)}ms`)
  }
}
