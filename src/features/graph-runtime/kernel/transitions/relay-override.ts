import type { RelayOverrideStatus } from '@/features/graph-runtime/app/store/types'

type RelayOverrideAction =
  | 'edit'
  | 'validate'
  | 'apply'
  | 'applied'
  | 'revertible'
  | 'invalid'
  | 'revert'
  | 'reset'

const TRANSITIONS: Record<
  RelayOverrideStatus,
  Partial<Record<RelayOverrideAction, RelayOverrideStatus>>
> = {
  idle: { edit: 'editing', apply: 'applying', applied: 'applied' },
  editing: { validate: 'validating', reset: 'idle' },
  validating: { apply: 'applying', invalid: 'invalid', reset: 'idle' },
  applying: { applied: 'applied', revertible: 'revertible', invalid: 'invalid' },
  applied: { edit: 'editing', apply: 'applying', reset: 'idle' },
  revertible: { revert: 'applying', edit: 'editing', reset: 'idle' },
  invalid: { edit: 'editing', reset: 'idle' },
}

export function transitionRelayOverride(
  current: RelayOverrideStatus,
  action: RelayOverrideAction,
): RelayOverrideStatus | null {
  return TRANSITIONS[current]?.[action] ?? null
}
