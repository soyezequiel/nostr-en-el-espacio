import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mapProfileRecordToNodeProfile,
  safeParseProfile,
} from './helpers'

test('safeParseProfile acepta image y normaliza URLs de media', () => {
  const parsed = safeParseProfile(
    JSON.stringify({
      display_name: 'Alice',
      about: 'bio',
      image: 'ipfs://bafybeiavatarcid/profile.png',
      nip05: 'alice@example.com',
    }),
  )

  assert.deepEqual(parsed, {
    name: 'Alice',
    about: 'bio',
    picture: 'https://ipfs.io/ipfs/bafybeiavatarcid/profile.png',
    pictureSource: 'ipfs://bafybeiavatarcid/profile.png',
    nip05: 'alice@example.com',
    lud16: null,
  })
})

test('mapProfileRecordToNodeProfile normaliza URLs cacheadas antes de renderizar', () => {
  const profile = mapProfileRecordToNodeProfile({
    pubkey: 'pubkey',
    eventId: 'event',
    createdAt: 123,
    fetchedAt: 456,
    name: 'Alice',
    about: null,
    picture: '//cdn.example.com/avatar.png',
    nip05: null,
    lud16: null,
  })

  assert.equal(profile.picture, 'https://cdn.example.com/avatar.png')
  assert.equal(profile.name, 'Alice')
  assert.equal(profile.eventId, 'event')
  assert.equal(profile.fetchedAt, 456)
})
