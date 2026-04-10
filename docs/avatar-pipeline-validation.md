# Avatar Pipeline Validation

This workflow measures avatar delivery in a production-like build instead of `next dev`.

It is intentionally narrow:

- build the app
- run `next start`
- open `/` with a fresh Playwright browser context
- load a fixed root (`Damus` by default)
- read the existing image-runtime counters through a query-gated probe

## What it measures

The probe surfaces the counters that matter for the avatar pipeline:

- visible queued requests
- visible in-flight requests
- critical visible base queue and in-flight pressure
- runtime-ready visible nodes
- painted visible nodes
- runtime-to-paint gap
- icon layer pending visible nodes
- proxy fallback sources
- hydration backlog
- blocked source URLs and timed-out requests

The validation script turns those counters into comparison-friendly metrics:

- time to first visible avatar request
- time to first runtime-ready visible avatar
- time to first painted visible avatar
- time to 50% and 90% painted visible coverage
- settled time
- peak visible queue pressure
- peak visible in-flight pressure
- peak proxy fallback sources
- peak hydration backlog
- peak runtime-to-paint gap
- final painted coverage

## Commands

First run after installing dependencies:

```bash
npx playwright install chromium
```

Cold production-like validation:

```bash
npm run avatar:validate -- --output tmp/avatar-baseline.json
```

That command:

- runs `npm run build`
- starts `next start` on `http://127.0.0.1:3200`
- opens `/?avatarProbe=1`
- fills the root input with the curated sample `npub`
- samples the avatar probe until the pipeline settles or the timeout expires

If you already have a production build running, reuse it:

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3200
npm run avatar:validate -- --server-url http://127.0.0.1:3200 --output tmp/avatar-current.json
```

Useful flags:

- `--root <npub-or-nprofile>` to test another identity
- `--timeout-ms <ms>` to extend the run for slower relay conditions
- `--settle-ms <ms>` to change how long the script waits for a stable painted state
- `--sample-interval-ms <ms>` to sample more or less often
- `--headed` to watch the browser session
- `--skip-build` when you already ran `npm run build` and want the script to only start the server

## Before / After comparison

Capture a baseline before avatar changes:

```bash
npm run avatar:validate -- --output tmp/avatar-before.json
```

Capture the candidate after the change:

```bash
npm run avatar:validate -- --output tmp/avatar-after.json
```

Compare both runs:

```bash
npm run avatar:compare -- tmp/avatar-before.json tmp/avatar-after.json
```

For the same root and viewport, prioritize these deltas:

- `timeToFirstPaintedMs`
- `timeTo90PctPaintedMs`
- `settledAtMs`
- `peakVisibleQueuedRequests`
- `peakVisibleInFlightRequests`
- `peakCriticalVisibleBaseQueuedRequests`
- `peakCriticalVisibleBaseInFlightRequests`
- `maxRuntimePaintGap`
- `maxProxyFallbackSources`
- `maxHydrationBacklog`
- `finalPaintCoverage`

## Manual spot checks

If you want to inspect the raw latest snapshot during a production run, open:

```text
http://127.0.0.1:3200/?avatarProbe=1
```

Then read this browser global in DevTools:

```js
window.__NOSTR_AVATAR_PIPELINE_PROBE__
```

The probe is only populated when the `avatarProbe=1` query param is present, so it stays local to this workflow.
