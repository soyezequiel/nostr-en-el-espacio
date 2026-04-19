import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isAllowedAvatarContentType,
  isPrivateOrReservedIp,
  resolveEffectiveContentType,
  sniffImageMime,
  validateSocialAvatarProxyUrl,
} from '@/app/api/social-avatar/route'
import { buildSocialAvatarProxyUrl } from '@/features/graph-v2/renderer/socialAvatarProxy'

test('social avatar proxy builds same-origin URLs with the source encoded', () => {
  assert.equal(
    buildSocialAvatarProxyUrl(
      'https://cdn.example/avatar.png?size=large',
      'https://app.example',
    ),
    'https://app.example/api/social-avatar?url=https%3A%2F%2Fcdn.example%2Favatar.png%3Fsize%3Dlarge',
  )
})

test('social avatar proxy accepts public http image URLs', async () => {
  const result = await validateSocialAvatarProxyUrl(
    'https://cdn.example/avatar.png',
    async () => ['93.184.216.34'],
  )

  assert.equal(result.ok, true)
})

test('social avatar proxy rejects private hosts and credentials', async () => {
  const privateHost = await validateSocialAvatarProxyUrl(
    'https://internal.example/avatar.png',
    async () => ['192.168.0.10'],
  )
  const withCredentials = await validateSocialAvatarProxyUrl(
    'https://user:pass@cdn.example/avatar.png',
    async () => ['93.184.216.34'],
  )

  assert.deepEqual(privateHost, {
    ok: false,
    reason: 'private_host_not_allowed',
  })
  assert.deepEqual(withCredentials, {
    ok: false,
    reason: 'credentials_not_allowed',
  })
})

test('social avatar proxy content type policy allows images and opaque binary', () => {
  assert.equal(isAllowedAvatarContentType('image/jpeg; charset=binary'), true)
  assert.equal(isAllowedAvatarContentType('application/octet-stream'), true)
  assert.equal(isAllowedAvatarContentType('text/html'), false)
  assert.equal(isAllowedAvatarContentType(''), true)
  assert.equal(isAllowedAvatarContentType('image/webp'), true)
  assert.equal(isAllowedAvatarContentType('image/avif'), true)
})

test('social avatar proxy sniffs image mime from magic bytes', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38])
  const webp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  ])
  const html = new Uint8Array([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54])
  assert.equal(sniffImageMime(png), 'image/png')
  assert.equal(sniffImageMime(jpg), 'image/jpeg')
  assert.equal(sniffImageMime(gif), 'image/gif')
  assert.equal(sniffImageMime(webp), 'image/webp')
  assert.equal(sniffImageMime(html), null)
})

test('resolveEffectiveContentType prefers sniffed mime over wrong header', () => {
  assert.equal(
    resolveEffectiveContentType('text/html; charset=utf-8', 'image/png'),
    'image/png',
  )
  assert.equal(
    resolveEffectiveContentType('', null),
    'application/octet-stream',
  )
  assert.equal(
    resolveEffectiveContentType('image/jpeg', null),
    'image/jpeg',
  )
  assert.equal(
    resolveEffectiveContentType('text/html', null),
    null,
  )
})

test('social avatar proxy identifies private and reserved IP ranges', () => {
  assert.equal(isPrivateOrReservedIp('10.0.0.4'), true)
  assert.equal(isPrivateOrReservedIp('172.20.0.4'), true)
  assert.equal(isPrivateOrReservedIp('192.168.1.4'), true)
  assert.equal(isPrivateOrReservedIp('127.0.0.1'), true)
  assert.equal(isPrivateOrReservedIp('93.184.216.34'), false)
  assert.equal(isPrivateOrReservedIp('::1'), true)
  assert.equal(isPrivateOrReservedIp('2606:4700:4700::1111'), false)
})
