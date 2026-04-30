const ENABLED_VALUE = '1'
const DISABLED_VALUE = '0'

export function resolveStoredHudStatsEnabled(storedValue: string | null): boolean {
  if (storedValue === ENABLED_VALUE) {
    return true
  }

  if (storedValue === DISABLED_VALUE) {
    return false
  }

  return false
}

export function serializeHudStatsEnabled(enabled: boolean): '1' | '0' {
  return enabled ? ENABLED_VALUE : DISABLED_VALUE
}
