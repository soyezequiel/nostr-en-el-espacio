const IPFS_GATEWAY_ORIGIN = 'https://ipfs.io'

const trimString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const buildIpfsGatewayUrl = (
  namespace: 'ipfs' | 'ipns',
  value: string,
): string | undefined => {
  const withoutProtocol = value.replace(/^ipfs:\/\//i, '').replace(/^ipns:\/\//i, '')
  const normalizedPath = withoutProtocol
    .replace(/^\/+/, '')
    .replace(new RegExp(`^${namespace}/+`, 'i'), '')

  if (normalizedPath.length === 0) {
    return undefined
  }

  return `${IPFS_GATEWAY_ORIGIN}/${namespace}/${normalizedPath}`
}

export function normalizeMediaUrl(value: unknown): string | undefined {
  const trimmed = trimString(value)
  if (!trimmed) {
    return undefined
  }

  if (/^data:image\//i.test(trimmed)) {
    return trimmed
  }

  if (/^ipfs:\/\//i.test(trimmed)) {
    return buildIpfsGatewayUrl('ipfs', trimmed)
  }

  if (/^ipns:\/\//i.test(trimmed)) {
    return buildIpfsGatewayUrl('ipns', trimmed)
  }

  const candidate = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed

  try {
    const url = new URL(candidate)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString()
    }
  } catch {
    return undefined
  }

  return undefined
}

export function getInitials(value: string | undefined, fallback = 'N'): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    return fallback
  }

  const [firstWord = ''] = trimmed.split(/\s+/)
  const firstLetter = firstWord[0]

  return (firstLetter ?? fallback).toUpperCase()
}
