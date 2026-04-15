import { readFileSync, writeFileSync } from 'fs'

const file = 'src/features/graph/components/GraphCanvas.tsx'
let content = readFileSync(file, 'utf8')
const normalize = s => s.replace(/\r\n/g, '\n')
const contentNorm = normalize(content)

const oldBlock = `  const rootFollowCount = useMemo(
    () =>
      rootNodePubkey === null
        ? 0
        : links.filter(
            (link) =>
              link.source === rootNodePubkey && link.relation === 'follow',
          ).length,
    [links, rootNodePubkey],
  )
  const rootInboundCount = useMemo(
    () =>
      rootNodePubkey === null
        ? 0
        : new Set(
            inboundLinks
              .filter(
                (link) =>
                  link.target === rootNodePubkey && link.relation === 'inbound',
              )
              .map((link) => link.source),
          ).size,
    [inboundLinks, rootNodePubkey],
  )`

const newBlock = `  const rootFollowCount = useMemo(
    () =>
      rootNodePubkey === null
        ? 0
        : appStore.getState().adjacency[rootNodePubkey]?.length ?? 0,
    [graphRevision, rootNodePubkey],
  )
  const rootInboundCount = useMemo(
    () =>
      rootNodePubkey === null
        ? 0
        : appStore.getState().inboundAdjacency[rootNodePubkey]?.length ?? 0,
    [inboundGraphRevision, rootNodePubkey],
  )`

if (!contentNorm.includes(oldBlock)) {
  console.error('ERROR: old block not found in file')
  process.exit(1)
}

const newNorm = contentNorm.replace(oldBlock, newBlock)
const usesCRLF = content.includes('\r\n')
const result = usesCRLF ? newNorm.replace(/\n/g, '\r\n') : newNorm
writeFileSync(file, result, 'utf8')
console.log('REPLACED OK - root counts O(N) to O(1)')
