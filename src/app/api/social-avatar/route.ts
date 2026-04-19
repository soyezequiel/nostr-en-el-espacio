import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export { buildSocialAvatarProxyUrl } from '@/features/graph-v2/renderer/socialAvatarProxy'

const MAX_AVATAR_BYTES = 12 * 1024 * 1024
const FETCH_TIMEOUT_MS = 12000
const MAX_REDIRECTS = 6
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const ALLOWED_CONTENT_TYPE_EXACT = new Set([
  'application/octet-stream',
  'binary/octet-stream',
  'application/binary',
  '',
])

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url)
  const target = requestUrl.searchParams.get('url')
  const validated = await validateSocialAvatarProxyUrl(target)
  if (!validated.ok) {
    return proxyErrorResponse(validated.reason, 400)
  }

  try {
    const upstream = await fetchAvatarWithRedirects(validated.url)
    const rawContentType = upstream.headers.get('content-type') ?? ''
    const contentLength = upstream.headers.get('content-length')
    if (
      contentLength &&
      Number.isFinite(Number.parseInt(contentLength, 10)) &&
      Number.parseInt(contentLength, 10) > MAX_AVATAR_BYTES
    ) {
      return proxyErrorResponse('avatar_too_large', 413)
    }

    const body = await readLimitedArrayBuffer(upstream, MAX_AVATAR_BYTES)
    const sniffed = sniffImageMime(new Uint8Array(body, 0, Math.min(body.byteLength, 32)))
    const effectiveContentType = resolveEffectiveContentType(rawContentType, sniffed)
    if (!effectiveContentType) {
      return proxyErrorResponse('unsupported_content_type', 415, {
        'x-avatar-proxy-upstream-type': rawContentType.slice(0, 120) || 'none',
      })
    }

    return new Response(body, {
      headers: {
        'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
        'content-type': effectiveContentType,
        'x-avatar-proxy-source': sniffed ? 'sniffed' : 'header',
      },
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'avatar_fetch_failed'
    const status =
      message === 'avatar_too_large'
        ? 413
        : message === 'unsupported_redirect'
          ? 400
          : message === 'timeout'
            ? 504
            : message.startsWith('http_5') || message === 'avatar_fetch_failed'
              ? 502
              : 502
    return proxyErrorResponse(message, status)
  }
}

const proxyErrorResponse = (
  reason: string,
  status: number,
  extraHeaders: Record<string, string> = {},
) =>
  new Response(reason, {
    status,
    headers: {
      'x-avatar-proxy-reason': reason,
      ...extraHeaders,
    },
  })

export type SocialAvatarProxyValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string }

export async function validateSocialAvatarProxyUrl(
  value: string | null,
  lookupHost: (hostname: string) => Promise<readonly string[]> = lookupHostIps,
): Promise<SocialAvatarProxyValidationResult> {
  if (!value || value.length > 4096) {
    return { ok: false, reason: 'invalid_url' }
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: 'unsupported_protocol' }
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'credentials_not_allowed' }
  }

  let hostIps: readonly string[]
  try {
    hostIps = await lookupHost(url.hostname)
  } catch {
    return { ok: false, reason: 'unresolved_host' }
  }
  if (hostIps.length === 0) {
    return { ok: false, reason: 'unresolved_host' }
  }
  if (hostIps.some(isPrivateOrReservedIp)) {
    return { ok: false, reason: 'private_host_not_allowed' }
  }

  return { ok: true, url }
}

export function isAllowedAvatarContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase().split(';')[0]?.trim() ?? ''
  if (normalized.startsWith('image/')) {
    return true
  }
  return ALLOWED_CONTENT_TYPE_EXACT.has(normalized)
}

export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null
  // PNG: 89 50 4E 47
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  // GIF: 47 49 46 38
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return 'image/gif'
  }
  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  // BMP
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp'
  }
  // AVIF/HEIC: ftyp box at offset 4
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/avif'
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('mif1'))
      return 'image/heic'
  }
  // SVG: <?xml or <svg
  const head = String.fromCharCode(...bytes.slice(0, Math.min(bytes.length, 16))).trim().toLowerCase()
  if (head.startsWith('<?xml') || head.startsWith('<svg')) {
    return 'image/svg+xml'
  }
  return null
}

export function resolveEffectiveContentType(
  headerContentType: string,
  sniffed: string | null,
): string | null {
  if (sniffed) {
    return sniffed
  }
  if (isAllowedAvatarContentType(headerContentType)) {
    return headerContentType || 'application/octet-stream'
  }
  return null
}

async function fetchAvatarWithRedirects(
  initialUrl: URL,
  redirectCount = 0,
): Promise<Response> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error('too_many_redirects')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort('timeout'), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(initialUrl, {
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'manual',
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*,*/*;q=0.8',
        'user-agent':
          'Mozilla/5.0 (compatible; NostrEspacialSocialAvatarProxy/1.0; +https://github.com/)',
      },
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        throw new Error('unsupported_redirect')
      }
      const redirectedUrl = new URL(location, initialUrl)
      const validated = await validateSocialAvatarProxyUrl(redirectedUrl.toString())
      if (!validated.ok) {
        throw new Error('unsupported_redirect')
      }
      return fetchAvatarWithRedirects(validated.url, redirectCount + 1)
    }

    if (!response.ok) {
      throw new Error(`http_${response.status}`)
    }

    return response
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error('timeout')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

async function readLimitedArrayBuffer(
  response: Response,
  maxBytes: number,
): Promise<ArrayBuffer> {
  if (!response.body) {
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > maxBytes) {
      throw new Error('avatar_too_large')
    }
    return buffer
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue
    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      reader.cancel().catch(() => {})
      throw new Error('avatar_too_large')
    }
    chunks.push(value)
  }

  const output = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output.buffer
}

async function lookupHostIps(hostname: string): Promise<readonly string[]> {
  if (isIP(hostname)) {
    return [hostname]
  }

  const records = await dnsLookup(hostname, { all: true, verbatim: false })
  return records.map((record) => record.address)
}

export function isPrivateOrReservedIp(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split('.').map((part) => Number.parseInt(part, 10))
    const [a = 0, b = 0] = parts
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }

  if (isIP(address) === 6) {
    const normalized = address.toLowerCase()
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    )
  }

  return true
}
