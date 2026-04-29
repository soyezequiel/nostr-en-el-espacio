const ENABLED_VALUE = '1'
const DISABLED_VALUE = '0'

export function resolveStoredRootLoadChromeEnabled(
  storedValue: string | null,
  defaultValue = false,
): boolean {
  if (storedValue === ENABLED_VALUE) {
    return true
  }

  if (storedValue === DISABLED_VALUE) {
    return false
  }

  return defaultValue
}

export function serializeRootLoadChromeEnabled(
  enabled: boolean,
): '1' | '0' {
  return enabled ? ENABLED_VALUE : DISABLED_VALUE
}
