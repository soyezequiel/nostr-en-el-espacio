# Avatar pipeline for graph-v2 (Sigma overlay)

Nostr avatars painted on top of Sigma nodes in `/labs/sigma`, tuned for low-end
mobile. Designed as a canvas-2D overlay because Sigma 3.0.2 does not expose a
public API for custom WebGL node programs.

## Modules (`src/features/graph-v2/renderer/avatar/`)

- `types.ts` — `AvatarEntry`, `AvatarBudget`, `DeviceTier`, `DEFAULT_BUDGETS`.
- `avatarBitmapCache.ts` — LRU keyed by `pubkey::url`. Stores `ImageBitmap` or
  `HTMLCanvasElement`. Always produces a monogram `HTMLCanvasElement` per
  pubkey as perpetual fallback. Calls `ImageBitmap.close()` on eviction.
- `avatarLoader.ts` — `fetch` + `createImageBitmap` downscale to LOD bucket
  (off-main-thread) + circular composite via `OffscreenCanvas`. Rejects unsafe
  URLs; merges external `AbortSignal` with an 8s timeout. Maintains a
  blocklist with configurable TTL.
- `avatarScheduler.ts` — Accepts a visible-candidate list per frame. Enforces
  concurrency cap. Aborts in-flight loads for pubkeys that left the viewport.
  Marks `failed` and blocklists on error.
- `avatarOverlayRenderer.ts` — Hooks `sigma.on('afterRender', …)`, draws on
  the `labels` 2D canvas. For each visible node it paints the monogram
  unconditionally and, if cached, the decoded circular bitmap on top.
  Feeds `PerfBudget.recordFrame` with the inter-frame delta.
- `deviceTier.ts` — Classifies `low | mid | high` from
  `hardwareConcurrency`, `deviceMemory`, `connection.effectiveType`,
  `saveData`, and UA.
- `perfBudget.ts` — EMA of frame time. Downgrades the tier after 2s above
  40ms; upgrades after 5s below 18ms. Falls back to per-field overrides
  once the lowest tier is reached.

## Integration

`SigmaRendererAdapter.mount` instantiates the pipeline and binds motion
tracking. `dispose` tears it down, closing bitmaps and clearing timers.

Motion is marked in three places:

1. Any `camera.updated` (pan / zoom / inertia).
2. Any drag `flushPendingDragFrame`.
3. `startDrag`.

While `motionActive` is true the overlay short-circuits before iterating the
graph. When the debounce timer expires (`MOTION_RESUME_MS = 140`) we call
`sigma.refresh()` once to force a paint that includes the avatars again.

## Performance strategy

- **Hide-on-move**: 0 work per frame while panning/dragging. WebGL circles
  alone during motion.
- **Size threshold + viewport cull**: nodes smaller than the threshold (or
  outside the container rect) are skipped before any cache lookup.
- **Zoom threshold**: no load is enqueued when `cameraRatio > budget.zoomThreshold`.
- **Pre-rendered circular bitmap**: no `ctx.clip()` in the hot path. One
  `drawImage` per node per frame.
- **`createImageBitmap` downscale**: never hold full-res bytes in memory.
- **LOD bucket hysteresis**: reuses existing `applyImageBucketHysteresis` to
  avoid thrashing on zoom wiggles.
- **LRU eviction with `ImageBitmap.close()`**: bounded VRAM.
- **Adaptive degradation**: `PerfBudget` downgrades tier (and eventually
  per-field overrides) if the EMA frame time rises above 40ms.

## Tests (`node:test` + `tsx`)

Run the suite with:

```bash
npx tsx --test src/features/graph-v2/renderer/avatar/*.test.ts
```

Covered:

- `deviceTier`: 6 scenarios across low/mid/high + missing navigator.
- `perfBudget`: init, downgrade, upgrade, brief spike, disable/enable, NaN.
- `avatarLoader`: blocklist lifecycle, TTL, unblock, rejection of unsafe URLs.

Not covered with unit tests (depend on DOM): `avatarBitmapCache`,
`avatarScheduler`, `avatarOverlayRenderer`. These are exercised via the
production build and pending manual validation below.

## Pending validation on a real device

The Samsung S21 target has not been validated end to end. To validate:

1. Load `/labs/sigma` with a real kind-0-enriched root that yields 200–500
   visible nodes with `pictureUrl` set.
2. Measure FPS during: idle, pan, zoom, drag, and sustained FA2 simulation.
   Target: ≥30 fps idle, ≥24 fps during drag.
3. Inspect VRAM / heap after 5 min of continuous navigation; verify LRU cap
   holds and no unbounded growth.
4. Test with relays that serve large or slow images; verify concurrency cap
   and blocklist keep the main thread responsive.
5. Check fallback path on a WebView that lacks `createImageBitmap` — monogram
   should stay visible and no console errors should fire.
6. Verify hover, drag, selection, physics, and export remain unaffected.
