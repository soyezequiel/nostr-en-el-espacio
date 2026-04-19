import { lookup as dnsLookup } from 'node:dns/promises'
import { createHash } from 'node:crypto'
import { isIP } from 'node:net'

export { buildSocialAvatarProxyUrl } from '@/features/graph-v2/renderer/socialAvatarProxy'

const MAX_AVATAR_BYTES = 12 * 1024 * 1024
const FETCH_TIMEOUT_MS = 12000
const MAX_REDIRECTS = 6
const BLOSSOM_MIRROR_BASE_URLS = [
  'https://blossom.nostr.build',
  'https://blossom.primal.net',
] as const
const BLOSSOM_MIRROR_FALLBACK_REASONS = new Set([
  'timeout',
  'avatar_fetch_failed',
  'http_404',
  'http_410',
  'http_429',
  'http_500',
  'http_502',
  'http_503',
  'http_504',
])
const TWIMG_AVATAR_VARIANT_FALLBACK_REASONS = new Set(['http_404', 'http_410'])
const TWIMG_PROFILE_IMAGE_SIZE_SUFFIXES = [
  '',
  '_400x400',
  '_normal',
  '_bigger',
  '_mini',
] as const
const TWIMG_QUERY_SIZE_NAMES = [
  '4096x4096',
  'large',
  '400x400',
  'medium',
  'small',
  'normal',
] as const
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
    return await buildAvatarProxyResponse(upstream)
  } catch (error) {
    const message = getProxyErrorReason(error)
    const twimgVariantResponse = await fetchTwimgAvatarVariant(
      validated.url,
      message,
    )
    if (twimgVariantResponse) {
      return twimgVariantResponse
    }

    const mirrorResponse = await fetchVerifiedBlossomMirrorAvatar(
      validated.url,
      message,
    )
    if (mirrorResponse) {
      return mirrorResponse
    }

    const status = resolveProxyErrorStatus(message)
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

async function buildAvatarProxyResponse(
  upstream: Response,
  options: {
    expectedSha256?: string
    extraHeaders?: Record<string, string>
    throwOnUnsupportedContentType?: boolean
  } = {},
): Promise<Response> {
  const rawContentType = upstream.headers.get('content-type') ?? ''
  const contentLength = upstream.headers.get('content-length')
  if (
    contentLength &&
    Number.isFinite(Number.parseInt(contentLength, 10)) &&
    Number.parseInt(contentLength, 10) > MAX_AVATAR_BYTES
  ) {
    throw new Error('avatar_too_large')
  }

  const body = await readLimitedArrayBuffer(upstream, MAX_AVATAR_BYTES)
  if (options.expectedSha256) {
    const actualSha256 = sha256Hex(body)
    if (actualSha256 !== options.expectedSha256.toLowerCase()) {
      throw new Error('blossom_hash_mismatch')
    }
  }

  const sniffed = sniffImageMime(new Uint8Array(body, 0, Math.min(body.byteLength, 32)))
  const effectiveContentType = resolveEffectiveContentType(rawContentType, sniffed)
  if (!effectiveContentType) {
    if (options.throwOnUnsupportedContentType) {
      throw new Error('unsupported_content_type')
    }
    return proxyErrorResponse('unsupported_content_type', 415, {
      'x-avatar-proxy-upstream-type': rawContentType.slice(0, 120) || 'none',
      ...options.extraHeaders,
    })
  }

  return new Response(body, {
    headers: {
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
      'content-type': effectiveContentType,
      'x-avatar-proxy-source': sniffed ? 'sniffed' : 'header',
      ...options.extraHeaders,
    },
  })
}

async function fetchVerifiedBlossomMirrorAvatar(
  sourceUrl: URL,
  originalReason: string,
): Promise<Response | null> {
  if (!shouldAttemptBlossomMirrorFallback(sourceUrl, originalReason)) {
    return null
  }

  const sha256 = extractBlossomSha256FromUrl(sourceUrl)
  if (!sha256) {
    return null
  }

  for (const mirrorUrl of buildBlossomMirrorCandidateUrls(sourceUrl)) {
    const validated = await validateSocialAvatarProxyUrl(mirrorUrl.toString())
    if (!validated.ok) {
      continue
    }

    try {
      const upstream = await fetchAvatarWithRedirects(validated.url)
      return await buildAvatarProxyResponse(upstream, {
        expectedSha256: sha256,
        extraHeaders: {
          'x-avatar-proxy-origin-reason': originalReason,
          'x-avatar-proxy-source': 'blossom-mirror',
          'x-avatar-proxy-mirror': validated.url.hostname,
        },
        throwOnUnsupportedContentType: true,
      })
    } catch {
      // Try the next mirror or path variant. The original failure remains the
      // relevant user-facing reason if no verified mirror has the blob.
    }
  }

  return null
}

async function fetchTwimgAvatarVariant(
  sourceUrl: URL,
  originalReason: string,
): Promise<Response | null> {
  if (!shouldAttemptTwimgAvatarVariantFallback(sourceUrl, originalReason)) {
    return null
  }

  for (const candidateUrl of buildTwimgAvatarVariantCandidateUrls(sourceUrl)) {
    const validated = await validateSocialAvatarProxyUrl(candidateUrl.toString())
    if (!validated.ok) {
      continue
    }

    try {
      const upstream = await fetchAvatarWithRedirects(validated.url)
      return await buildAvatarProxyResponse(upstream, {
        extraHeaders: {
          'x-avatar-proxy-origin-reason': originalReason,
          'x-avatar-proxy-source': 'twimg-variant',
          'x-avatar-proxy-variant': validated.url.pathname.slice(-120),
        },
        throwOnUnsupportedContentType: true,
      })
    } catch {
      // Twitter profile image URLs commonly differ only by the size variant.
      // If one candidate is gone, try the next bounded canonical variant.
    }
  }

  return null
}

export function shouldAttemptTwimgAvatarVariantFallback(
  sourceUrl: URL,
  reason: string,
): boolean {
  return (
    TWIMG_AVATAR_VARIANT_FALLBACK_REASONS.has(reason) &&
    sourceUrl.hostname.toLowerCase() === 'pbs.twimg.com' &&
    buildTwimgAvatarVariantCandidateUrls(sourceUrl).length > 0
  )
}

export function buildTwimgAvatarVariantCandidateUrls(sourceUrl: URL): URL[] {
  if (sourceUrl.hostname.toLowerCase() !== 'pbs.twimg.com') {
    return []
  }

  const candidates = new Map<string, URL>()
  addTwimgProfileImagePathCandidates(sourceUrl, candidates)
  addTwimgQuerySizeCandidates(sourceUrl, candidates)
  candidates.delete(sourceUrl.toString())
  return [...candidates.values()]
}

function addTwimgProfileImagePathCandidates(
  sourceUrl: URL,
  candidates: Map<string, URL>,
) {
  const segments = sourceUrl.pathname.split('/')
  const profileImagesIndex = segments.findIndex(
    (segment) => segment === 'profile_images',
  )
  if (profileImagesIndex === -1) {
    return
  }

  const rawFileName = segments.at(-1)
  if (!rawFileName) {
    return
  }

  const fileName = decodeURIComponent(rawFileName)
  const match =
    /^(?<base>.+?)(?:_(?:normal|bigger|mini|400x400))?(?<ext>\.(?:jpe?g|png|webp|gif))$/i.exec(
      fileName,
    )
  if (!match?.groups?.base || !match.groups.ext) {
    return
  }

  for (const suffix of TWIMG_PROFILE_IMAGE_SIZE_SUFFIXES) {
    const candidate = new URL(sourceUrl)
    const nextSegments = [...segments]
    nextSegments[nextSegments.length - 1] = `${match.groups.base}${suffix}${match.groups.ext}`
    candidate.pathname = nextSegments.join('/')
    candidate.search = ''
    candidates.set(candidate.toString(), candidate)
  }
}

function addTwimgQuerySizeCandidates(
  sourceUrl: URL,
  candidates: Map<string, URL>,
) {
  if (!sourceUrl.searchParams.has('name')) {
    return
  }

  for (const name of TWIMG_QUERY_SIZE_NAMES) {
    const candidate = new URL(sourceUrl)
    candidate.searchParams.set('name', name)
    candidates.set(candidate.toString(), candidate)
  }
}

export function shouldAttemptBlossomMirrorFallback(
  sourceUrl: URL,
  reason: string,
): boolean {
  return (
    BLOSSOM_MIRROR_FALLBACK_REASONS.has(reason) &&
    extractBlossomSha256FromUrl(sourceUrl) !== null
  )
}

export function extractBlossomSha256FromUrl(url: URL): string | null {
  for (const rawSegment of url.pathname.split('/')) {
    const segment = decodeURIComponent(rawSegment)
    const match = /^([a-f0-9]{64})(?:\.[a-z0-9]{1,12})?$/i.exec(segment)
    if (match?.[1]) {
      return match[1].toLowerCase()
    }
  }
  return null
}

export function buildBlossomMirrorCandidateUrls(
  sourceUrl: URL,
  mirrorBaseUrls: readonly string[] = BLOSSOM_MIRROR_BASE_URLS,
): URL[] {
  const sha256 = extractBlossomSha256FromUrl(sourceUrl)
  if (!sha256) {
    return []
  }

  const sourceOrigin = sourceUrl.origin.toLowerCase()
  const sourceSegment = sourceUrl.pathname
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .find((segment) => new RegExp(`^${sha256}(\\.[a-z0-9]{1,12})?$`, 'i').test(segment))
  const extension = sourceSegment?.slice(sha256.length) ?? ''
  const candidates = new Map<string, URL>()

  for (const base of mirrorBaseUrls) {
    const baseUrl = new URL(base)
    if (baseUrl.origin.toLowerCase() === sourceOrigin) {
      continue
    }
    const variants = extension ? [`/${sha256}${extension}`, `/${sha256}`] : [`/${sha256}`]
    for (const path of variants) {
      const candidate = new URL(path, baseUrl)
      candidates.set(candidate.toString(), candidate)
    }
  }

  return [...candidates.values()]
}

export function sha256Hex(buffer: ArrayBuffer): string {
  return createHash('sha256').update(Buffer.from(buffer)).digest('hex')
}

function getProxyErrorReason(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'avatar_fetch_failed'
}

export function resolveProxyErrorStatus(message: string): number {
  if (message === 'avatar_too_large') return 413
  if (message === 'unsupported_redirect') return 400
  if (message === 'unsupported_content_type') return 415
  if (message === 'timeout') return 504
  const upstreamStatus = /^http_(\d{3})$/.exec(message)?.[1]
  if (upstreamStatus) return Number.parseInt(upstreamStatus, 10)
  if (message.startsWith('http_5') || message === 'avatar_fetch_failed') {
    return 502
  }
  return 502
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
