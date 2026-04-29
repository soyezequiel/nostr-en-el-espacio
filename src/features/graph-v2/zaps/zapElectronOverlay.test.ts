import assert from 'node:assert/strict'
import test from 'node:test'

import { ZapElectronOverlay } from './zapElectronOverlay'

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
    beginPath() {},
    clearRect() {},
    createLinearGradient() {
      return { addColorStop() {} }
    },
    createRadialGradient() {
      return { addColorStop() {} }
    },
    fill() {},
    fillText() {},
    lineTo() {},
    moveTo() {},
    restore() {},
    save() {},
    setTransform() {},
    stroke() {},
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
  }
}

test('ZapElectronOverlay pauses without advancing progress and resumes from the same frame', () => {
  const harness = installOverlayDomHarness()
  const overlay = new ZapElectronOverlay(
    harness.container as unknown as HTMLElement,
    (pubkey) =>
      pubkey === 'a'
        ? { x: 20, y: 30 }
        : pubkey === 'b'
          ? { x: 220, y: 160 }
          : null,
  )
  const internals = overlay as unknown as OverlayInternals

  assert.equal(overlay.play({ fromPubkey: 'a', toPubkey: 'b', sats: 2100 }), true)
  assert.equal(internals.animations.length, 1)
  assert.equal(internals.animations[0]?.startMs, 1000)
  assert.equal(harness.frames.size, 1)

  overlay.setPaused(true)
  assert.equal(internals.rafId, null)
  assert.equal(harness.frames.size, 0)

  harness.advance(500)
  assert.equal(internals.animations[0]?.startMs, 1000)

  overlay.setPaused(false)
  assert.equal(internals.animations[0]?.startMs, 1500)
  assert.equal(harness.frames.size, 1)

  overlay.dispose()
  assert.equal(internals.animations.length, 0)
  assert.equal(internals.rafId, null)
  assert.equal(harness.frames.size, 0)
})
