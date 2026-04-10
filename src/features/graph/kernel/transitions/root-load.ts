import type { RootLoadStatus } from '@/features/graph/app/store/types'

type RootLoadAction =
  | 'start'
  | 'cache-hit'
  | 'live-ready'
  | 'live-partial'
  | 'live-empty'
  | 'error'
  | 'cancel'
  | 'reset'

const TRANSITIONS: Record<
  RootLoadStatus,
  Partial<Record<RootLoadAction, RootLoadStatus>>
> = {
  idle: { start: 'loading' },
  loading: {
    'cache-hit': 'partial',
    'live-ready': 'ready',
    'live-partial': 'partial',
    'live-empty': 'empty',
    error: 'error',
    cancel: 'idle',
  },
  partial: {
    'live-ready': 'ready',
    'live-partial': 'partial',
    error: 'error',
    cancel: 'partial',
    start: 'loading',
  },
  ready: { start: 'loading', reset: 'idle' },
  empty: { start: 'loading', reset: 'idle' },
  error: { start: 'loading', reset: 'idle' },
}

export function transitionRootLoad(
  current: RootLoadStatus,
  action: RootLoadAction,
): RootLoadStatus | null {
  return TRANSITIONS[current]?.[action] ?? null
}
