import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveNodeExpansionStreamCopy } from './GraphCanvas'
import type { NodeExpansionState } from '@/features/graph/app/store/types'

const createExpansion = (
  overrides: Partial<NodeExpansionState> = {},
  nodeLabel = 'Walker',
) => ({
  nodeLabel,
  state: {
    status: 'loading',
    message: `Trabajando sobre ${nodeLabel}`,
    phase: 'fetching-structure',
    step: 2,
    totalSteps: 5,
    startedAt: 1,
    updatedAt: 2,
    visibleStatus: 'loading',
    backgroundStatus: 'idle',
    visibleAppliedAt: null,
    enrichmentStatus: null,
    enrichmentProcessedBatches: null,
    enrichmentTotalBatches: null,
    enrichmentProcessedCandidates: null,
    enrichmentTotalCandidates: null,
    enrichmentNewInboundCount: null,
    ...overrides,
  } satisfies NodeExpansionState,
})

test('distinguishes visible expansion copy from background reciprocity copy', () => {
  const visible = resolveNodeExpansionStreamCopy({
    activeExpansion: createExpansion(),
    expansionMode: 'visible',
  })

  const background = resolveNodeExpansionStreamCopy({
    activeExpansion: createExpansion(
      {
        status: 'ready',
        phase: 'enriching-reciprocity',
        visibleStatus: 'ready',
        backgroundStatus: 'loading',
        enrichmentProcessedBatches: 3,
        enrichmentTotalBatches: 6,
        enrichmentProcessedCandidates: 12,
        enrichmentTotalCandidates: 24,
        enrichmentNewInboundCount: 4,
      },
      'Damus',
    ),
    expansionMode: 'background',
  })

  assert.equal(visible.label, 'Expandiendo nodo')
  assert.match(visible.detail, /Fase:/)
  assert.match(visible.meta, /Paso 2 de 5/)

  assert.equal(background.label, 'Enriqueciendo reciprocidad')
  assert.match(background.meta, /Batches 3\/6/)
  assert.match(background.meta, /Candidatos 12\/24/)
  assert.match(background.detail, /background/)
  assert.doesNotMatch(background.detail, /Fase:/)
})
