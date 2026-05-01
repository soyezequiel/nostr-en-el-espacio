import assert from 'node:assert/strict'
import test from 'node:test'

import { GraphEventOverlay } from './graphEventOverlay'
import type { ParsedGraphEvent } from './types'

type TestAnimation = {
  startMs: number
}

type OverlayInternals = {
  animations: TestAnimation[]
  rafId: number | null
}

type FrameCallback = (timestamp: number) => void

function installOverlayDomHarness() {
  let now = 1000
  let nextFrameId = 1
  const frames = new Map<number, FrameCallback>()
  const routeSegments: Array<{
    from: { x: number; y: number }
    to: { x: number; y: number }
  }> = []
  let currentMove: { x: number; y: number } | null = null
  let currentLine: { x: number; y: number } | null = null

  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => now },
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { devicePixelRatio: 1 },
  })
  Object.defineProperty(globalThis, 'getComputedStyle', {
    configurable: true,
    value: () => ({ position: 'relative' }),
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameCallback) => {
      const id = nextFrameId
      nextFrameId += 1
      frames.set(id, callback)
      return id
    },
  })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: (id: number) => {
      frames.delete(id)
    },
  })

  const context = {
    arc() {},
    beginPath() {
      currentMove = null
      currentLine = null
    },
    bezierCurveTo() {},
    clearRect() {},
    closePath() {},
    createLinearGradient() {
      return { addColorStop() {} }
    },
    createRadialGradient() {
      return { addColorStop() {} }
    },
    fill() {},
    fillText() {},
    lineTo(x: number, y: number) {
      currentLine = { x, y }
    },
    moveTo(x: number, y: number) {
      currentMove = { x, y }
    },
    restore() {},
    rotate() {},
    save() {},
    scale() {},
    setLineDash() {},
    setTransform() {},
    stroke() {
      if (currentMove && currentLine) {
        routeSegments.push({ from: currentMove, to: currentLine })
      }
    },
    translate() {},
  }
  const canvas = {
    height: 0,
    parentElement: null as unknown,
    style: {},
    width: 0,
    getContext: () => context,
    setAttribute() {},
  }
  const container = {
    style: {},
    appendChild(child: typeof canvas) {
      child.parentElement = container
    },
    getBoundingClientRect: () => ({ width: 320, height: 220 }),
    removeChild(child: typeof canvas) {
      child.parentElement = null
    },
  }

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => canvas,
    },
  })

  return {
    advance(ms: number) {
      now += ms
    },
    container,
    frames,
    routeSegments,
  }
}

const likeEvent: ParsedGraphEvent = {
  kind: 'like',
  eventId: 'evt1',
  fromPubkey: 'a',
  toPubkey: 'b',
  createdAt: 1,
  refEventId: null,
  payload: {
    kind: 'like',
    data: {
      reaction: '+',
      targetEventId: null,
      targetKind: null,
    },
  },
}

test('GraphEventOverlay redraws the frozen paused frame when viewport positions change', () => {
  const harness = installOverlayDomHarness()
  const positions = new Map([
    ['a', { x: 20, y: 30 }],
    ['b', { x: 220, y: 160 }],
  ])
  const overlay = new GraphEventOverlay(
    harness.container as unknown as HTMLElement,
    (pubkey) => positions.get(pubkey) ?? null,
  )
  const internals = overlay as unknown as OverlayInternals

  assert.equal(overlay.play(likeEvent), true)
  assert.equal(internals.animations.length, 1)
  assert.equal(internals.animations[0]?.startMs, 1000)
  assert.equal(harness.frames.size, 1)

  overlay.setPaused(true)
  assert.equal(internals.rafId, null)
  assert.equal(harness.frames.size, 0)

  harness.advance(500)
  positions.set('a', { x: 80, y: 90 })
  positions.set('b', { x: 260, y: 190 })
  overlay.redrawPausedFrame()

  const latestRoute = harness.routeSegments.at(-1)
  assert.deepEqual(latestRoute?.from, { x: 80, y: 90 })
  assert.deepEqual(latestRoute?.to, { x: 260, y: 190 })
  assert.equal(internals.animations[0]?.startMs, 1000)
  assert.equal(harness.frames.size, 0)

  overlay.dispose()
})
