export type ConnectionColorMode = 'semantic' | 'calm' | 'mono'

export type ConnectionFocusStyle = 'soft' | 'balanced' | 'dramatic'

export type ConnectionVisualConfig = {
  opacity: number
  thicknessScale: number
  colorMode: ConnectionColorMode
  focusStyle: ConnectionFocusStyle
  mutualColor: string
}

export const DEFAULT_MUTUAL_CONNECTION_COLOR = '#050505'

export const DEFAULT_CONNECTION_VISUAL_CONFIG: ConnectionVisualConfig = {
  opacity: 0.58,
  thicknessScale: 0.55,
  colorMode: 'calm',
  focusStyle: 'balanced',
  mutualColor: DEFAULT_MUTUAL_CONNECTION_COLOR,
}

export const MIN_CONNECTION_OPACITY = 0.1
export const MAX_CONNECTION_OPACITY = 1
export const CONNECTION_OPACITY_STEP = 0.05
export const MIN_CONNECTION_THICKNESS_SCALE = 0.35
export const MAX_CONNECTION_THICKNESS_SCALE = 1.75
export const CONNECTION_THICKNESS_SCALE_STEP = 0.05

export const MUTUAL_CONNECTION_COLOR_PRESETS = [
  DEFAULT_MUTUAL_CONNECTION_COLOR,
  '#66f2ff',
  '#f7d154',
  '#ff7ab6',
  '#b48cff',
  '#ffffff',
] as const

const CONNECTION_COLOR_MODES = new Set<ConnectionColorMode>([
  'semantic',
  'calm',
  'mono',
])

const CONNECTION_FOCUS_STYLES = new Set<ConnectionFocusStyle>([
  'soft',
  'balanced',
  'dramatic',
])

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export const normalizeConnectionHexColor = (
  value: string | null | undefined,
  fallback: string = DEFAULT_MUTUAL_CONNECTION_COLOR,
) => {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed.toLowerCase() : fallback
}

export const clampConnectionOpacity = (value: number) =>
  Number.isFinite(value)
    ? clampNumber(value, MIN_CONNECTION_OPACITY, MAX_CONNECTION_OPACITY)
    : DEFAULT_CONNECTION_VISUAL_CONFIG.opacity

export const clampConnectionThicknessScale = (value: number) =>
  Number.isFinite(value)
    ? clampNumber(
        value,
        MIN_CONNECTION_THICKNESS_SCALE,
        MAX_CONNECTION_THICKNESS_SCALE,
      )
    : DEFAULT_CONNECTION_VISUAL_CONFIG.thicknessScale

export const normalizeConnectionVisualConfig = (
  value: Partial<ConnectionVisualConfig> | null | undefined,
): ConnectionVisualConfig => ({
  opacity: clampConnectionOpacity(
    value?.opacity ?? DEFAULT_CONNECTION_VISUAL_CONFIG.opacity,
  ),
  thicknessScale: clampConnectionThicknessScale(
    value?.thicknessScale ?? DEFAULT_CONNECTION_VISUAL_CONFIG.thicknessScale,
  ),
  colorMode: CONNECTION_COLOR_MODES.has(
    value?.colorMode as ConnectionColorMode,
  )
    ? (value?.colorMode as ConnectionColorMode)
    : DEFAULT_CONNECTION_VISUAL_CONFIG.colorMode,
  focusStyle: CONNECTION_FOCUS_STYLES.has(
    value?.focusStyle as ConnectionFocusStyle,
  )
    ? (value?.focusStyle as ConnectionFocusStyle)
    : DEFAULT_CONNECTION_VISUAL_CONFIG.focusStyle,
  mutualColor: normalizeConnectionHexColor(
    value?.mutualColor,
    DEFAULT_CONNECTION_VISUAL_CONFIG.mutualColor,
  ),
})
