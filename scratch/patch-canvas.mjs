import { readFileSync, writeFileSync } from 'fs'

const file = 'src/features/graph/components/GraphCanvas.tsx'
let content = readFileSync(file, 'utf8')

// Normalize line endings for matching
const normalize = s => s.replace(/\r\n/g, '\n')
const contentNorm = normalize(content)

const oldBlock = `  const relationshipControlLayer = resolveRelationshipControlLayer(
    activeLayer,
    connectionsSourceLayer,
  )
  const relationshipToggleState = getRelationshipToggleState(
    relationshipControlLayer,
  )
  const onlyOneRelationshipSideActive =
    relationshipToggleState.following !== relationshipToggleState.followers
  const canToggleOnlyNonReciprocal =
    isRelationshipLayer(relationshipControlLayer) &&
    (relationshipToggleState.following || relationshipToggleState.followers)`

const newBlock = `  const relationshipControlLayer = useMemo(
    () => resolveRelationshipControlLayer(activeLayer, connectionsSourceLayer),
    [activeLayer, connectionsSourceLayer],
  )
  const relationshipToggleState = useMemo(
    () => getRelationshipToggleState(relationshipControlLayer),
    [relationshipControlLayer],
  )
  const onlyOneRelationshipSideActive =
    relationshipToggleState.following !== relationshipToggleState.followers
  const canToggleOnlyNonReciprocal = useMemo(
    () =>
      isRelationshipLayer(relationshipControlLayer) &&
      (relationshipToggleState.following || relationshipToggleState.followers),
    [relationshipControlLayer, relationshipToggleState],
  )`

if (!contentNorm.includes(oldBlock)) {
  console.error('ERROR: old block not found in file')
  process.exit(1)
}

// Replace in the normalized content, then restore original line endings
const newNorm = contentNorm.replace(oldBlock, newBlock)
// Restore CRLF if original used it
const usesCRLF = content.includes('\r\n')
const result = usesCRLF ? newNorm.replace(/\n/g, '\r\n') : newNorm
writeFileSync(file, result, 'utf8')
console.log('REPLACED OK')
