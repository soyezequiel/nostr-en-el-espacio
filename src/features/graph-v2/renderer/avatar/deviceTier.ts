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
  const ua = navigator.userAgent ?? ''
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)

  if (saveData || effectiveType === '2g' || effectiveType === 'slow-2g') {
    return 'low'
  }
  if (cores <= 4 || memory <= 4) {
    return 'low'
  }
  if (isMobile && (cores <= 6 || memory <= 6)) {
    return 'low'
  }
  if (isMobile || cores <= 8 || memory <= 8) {
    return 'mid'
  }
  return 'high'
}
