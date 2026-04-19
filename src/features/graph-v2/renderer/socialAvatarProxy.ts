export function buildSocialAvatarProxyUrl(
  sourceUrl: string,
  origin: string,
): string {
  const url = new URL('/api/social-avatar', origin)
  url.searchParams.set('url', sourceUrl)
  return url.toString()
}
