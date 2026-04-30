import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseLikeEvent,
  parseQuoteEvent,
  parseRepostEvent,
} from './parsers'

const BASE_EVENT = {
  id: 'event-id',
  pubkey: 'AUTHOR',
  created_at: 123,
  content: '',
  tags: [] as string[][],
}

test('reaction parser uses the last p tag as the target author', () => {
  const parsed = parseLikeEvent({
    ...BASE_EVENT,
    kind: 7,
    tags: [
      ['p', 'mentioned-author'],
      ['e', 'target-event'],
      ['p', 'reacted-author'],
    ],
  })

  assert.equal(parsed?.fromPubkey, 'author')
  assert.equal(parsed?.toPubkey, 'reacted-author')
  assert.equal(parsed?.refEventId, 'target-event')
})

test('repost parser prefers embedded original author over incidental p tags', () => {
  const parsed = parseRepostEvent({
    ...BASE_EVENT,
    kind: 6,
    content: JSON.stringify({
      id: 'original-note',
      pubkey: 'embedded-original-author',
      kind: 1,
    }),
    tags: [
      ['p', 'mentioned-author'],
      ['e', 'original-note'],
      ['p', 'fallback-author'],
    ],
  })

  assert.equal(parsed?.toPubkey, 'embedded-original-author')
  assert.equal(parsed?.refEventId, 'original-note')
})

test('quote parser can animate authored quotes using the q-tag author hint', () => {
  const parsed = parseQuoteEvent({
    ...BASE_EVENT,
    kind: 1,
    content: 'quoting a visible note',
    tags: [['q', 'quoted-event', 'wss://relay.example', 'quoted-author']],
  })

  assert.equal(parsed?.fromPubkey, 'author')
  assert.equal(parsed?.toPubkey, 'quoted-author')
  assert.equal(parsed?.refEventId, 'quoted-event')
})
