import type { DeviceTier } from '@/features/graph-v2/renderer/avatar/types'

interface NavigatorLike {
  hardwareConcurrency?: number
  deviceMemory?: number
  connection?: { effectiveType?: string; saveData?: boolean }
  userAgent?: string
}

export interface DetectDeviceTierInput {
  navigator?: NavigatorLike
}

export const detectDeviceTier = ({
  navigator = typeof globalThis !== 'undefined' ? (globalThis.navigator as NavigatorLike) : undefined,
}: DetectDeviceTierInput = {}): DeviceTier => {
  if (!navigator) {
    return 'mid'
  }

  const cores = navigator.hardwareConcurrency ?? 8
  const memory = navigator.deviceMemory ?? 8
  const effectiveType = navigator.connection?.effectiveType ?? '4g'
  const saveData = navigator.connection?.saveData === true
  if (saveData || effectiveType === '2g' || effectiveType === 'slow-2g') {
    return 'low'
  }
  if (cores <= 4 || memory <= 4) {
    return 'low'
  }
  if (cores <= 6 && memory <= 6) {
    // Treat 6-core/6GB devices fairly without explicit mobile checks
    // We already covered <=4 above.
  }
  if (cores <= 8 || memory <= 8) {
    return 'mid'
  }
  return 'high'
}
