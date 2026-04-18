import type { ExportJobStatus } from '@/features/graph-runtime/app/store/types'

type ExportAction =
  | 'start'
  | 'freeze-done'
  | 'authored-done'
  | 'inbound-done'
  | 'package'
  | 'complete'
  | 'partial'
  | 'fail'
  | 'reset'

const TRANSITIONS: Record<
  ExportJobStatus,
  Partial<Record<ExportAction, ExportJobStatus>>
> = {
  idle: { start: 'freezing-snapshot' },
  'freezing-snapshot': { 'freeze-done': 'running-authored', fail: 'failed' },
  'running-authored': { 'authored-done': 'running-inbound', fail: 'failed' },
  'running-inbound': { 'inbound-done': 'packaging', fail: 'failed' },
  packaging: { complete: 'completed', partial: 'partial', fail: 'failed' },
  partial: { reset: 'idle' },
  completed: { reset: 'idle' },
  failed: { reset: 'idle' },
}

export function transitionExportJob(
  current: ExportJobStatus,
  action: ExportAction,
): ExportJobStatus | null {
  return TRANSITIONS[current]?.[action] ?? null
}
