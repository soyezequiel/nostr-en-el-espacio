type HumanTerminalLevel = 'ok' | 'aviso' | 'error' | 'detalle'

type HumanTerminalFieldValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Error
  | readonly string[]
  | readonly number[]

export type HumanTerminalFields = Record<string, HumanTerminalFieldValue>

export interface HumanTerminalLogEntry {
  level: HumanTerminalLevel
  area: string
  message: string
  fields?: HumanTerminalFields
}

const LEVEL_LABELS: Record<HumanTerminalLevel, string> = {
  ok: 'OK',
  aviso: 'AVISO',
  error: 'ERROR',
  detalle: 'DETALLE',
}

const LEVEL_TO_CONSOLE: Record<HumanTerminalLevel, 'info' | 'warn' | 'error'> = {
  ok: 'info',
  aviso: 'warn',
  error: 'error',
  detalle: 'info',
}

const padRight = (value: string, size: number) =>
  value.length >= size ? value : `${value}${' '.repeat(size - value.length)}`

const formatTime = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')

  return `${hours}:${minutes}:${seconds}`
}

export const summarizeHumanTerminalError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim()
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim()
  }

  return 'sin_detalle'
}

const formatFieldValue = (value: HumanTerminalFieldValue): string => {
  if (value instanceof Error) {
    return summarizeHumanTerminalError(value)
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(',') : 'vacio'
  }

  if (typeof value === 'boolean') {
    return value ? 'si' : 'no'
  }

  if (value === null || typeof value === 'undefined') {
    return 'sin_dato'
  }

  return String(value).replace(/\s+/g, '_')
}

export function formatHumanTerminalLog(
  entry: HumanTerminalLogEntry,
  date = new Date(),
): string {
  const level = LEVEL_LABELS[entry.level]
  const fields = Object.entries(entry.fields ?? {})
    .filter(([, value]) => typeof value !== 'undefined')
    .map(([key, value]) => `${key}=${formatFieldValue(value)}`)
    .join(' ')

  return [
    formatTime(date),
    padRight(level, 7),
    padRight(entry.area, 14),
    padRight(entry.message, 34),
    fields,
  ]
    .filter((part) => part.length > 0)
    .join(' ')
    .trimEnd()
}

export function writeHumanTerminalLog(entry: HumanTerminalLogEntry): void {
  console[LEVEL_TO_CONSOLE[entry.level]](formatHumanTerminalLog(entry))
}

export function logTerminalOk(
  area: string,
  message: string,
  fields?: HumanTerminalFields,
): void {
  writeHumanTerminalLog({ level: 'ok', area, message, fields })
}

export function logTerminalWarning(
  area: string,
  message: string,
  fields?: HumanTerminalFields,
): void {
  writeHumanTerminalLog({ level: 'aviso', area, message, fields })
}

export function logTerminalError(
  area: string,
  message: string,
  fields?: HumanTerminalFields,
): void {
  writeHumanTerminalLog({ level: 'error', area, message, fields })
}

export function logTerminalDetail(
  area: string,
  message: string,
  fields?: HumanTerminalFields,
): void {
  writeHumanTerminalLog({ level: 'detalle', area, message, fields })
}
