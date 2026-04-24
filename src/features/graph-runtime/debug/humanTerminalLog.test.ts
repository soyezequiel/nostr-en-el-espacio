import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatHumanTerminalLog,
  summarizeHumanTerminalError,
} from '@/features/graph-runtime/debug/humanTerminalLog'

test('formatHumanTerminalLog renders a Spanish human-readable line', () => {
  const line = formatHumanTerminalLog(
    {
      level: 'aviso',
      area: 'Relays',
      message: 'Cobertura parcial',
      fields: {
        cargados: '5/8',
        motivo: 'tiempo de espera',
        limite_ms: 8000,
        recuperable: true,
      },
    },
    new Date('2026-04-24T15:41:15Z'),
  )

  assert.match(line, /AVISO\s+Relays\s+Cobertura parcial/)
  assert.match(line, /cargados=5\/8/)
  assert.match(line, /motivo=tiempo_de_espera/)
  assert.match(line, /limite_ms=8000/)
  assert.match(line, /recuperable=si/)
})

test('summarizeHumanTerminalError keeps errors short for terminal output', () => {
  assert.equal(
    summarizeHumanTerminalError(new Error('Relay no respondio')),
    'Relay no respondio',
  )
  assert.equal(summarizeHumanTerminalError('  fallo externo  '), 'fallo externo')
  assert.equal(summarizeHumanTerminalError(null), 'sin_detalle')
})
