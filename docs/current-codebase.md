# Current Codebase Guide

This document describes the code that actually exists in this repository today. It intentionally overrides the assumptions of the original starter kit.

## 1. Product shape

The original starter was profile-centric.

This repository is now graph-first.

Today:

- the home route mounts a dedicated identity graph application
- profile and badges live on separate routes
- relay uncertainty is part of the UX, not an edge case
- the graph slice includes storage, workers, analysis, export, and rendering layers
- the app already supports evidence-oriented export rather than only on-screen exploration

## 2. Route map

### `/`

Entry points:

- `src/app/page.tsx`
- `src/features/graph/GraphClient.tsx`
- `src/features/graph/GraphApp.tsx`

Purpose:

- accept an `npub` or `nprofile`
- load a discovered neighborhood
- inspect and expand nodes
- switch relay sets
- tune rendering
- export an auditable snapshot package

Notes:

- `GraphClient.tsx` loads the graph app with `ssr: false`
- this route is the main product surface

### `/profile`

Entry points:

- `src/app/profile/page.tsx`
- `src/components/Profile.tsx`

Purpose:

- authenticate the connected user
- render profile metadata, social stats, and notes
- reuse shared auth and Nostr helpers

### `/badges`

Entry points:

- `src/app/badges/page.tsx`
- `src/components/Badges.tsx`

Purpose:

- fetch NIP-58 badge awards for the connected identity
- resolve badge definitions and media

## 3. Shared app layer

### `src/components/Navbar.tsx`

Shared route navigation for:

- graph
- profile
- badges

It also exposes the shared connect/disconnect entry point through `LoginModal`.

### `src/components/LoginModal.tsx`

Current login flows:

- NIP-07 extension
- `nsec`
- NIP-46 bunker
- Nostr Connect QR flow for bunker login

### `src/components/SkeletonImage.tsx`

Shared image wrapper used in the classic routes and navbar for:

- loading placeholders
- graceful media fallback
- avatar/banner rendering

### `src/lib/nostr.ts`

Use this for the classic app surfaces:

- shared NDK singleton setup
- login methods
- NIP-65 relay enrichment
- profile parsing
- followers/following/notes fetches
- bounded timeouts for user-facing network calls

### `src/store/auth.ts`

Shared auth state used by:

- `Navbar`
- `Profile`
- `Badges`

It persists:

- login method
- parsed profile

## 4. Graph architecture

The graph is not a single component. It is a client application slice inside the repo.

### Top-level shell

- `src/features/graph/GraphApp.tsx`

Responsibilities:

- root entry flow
- settings drawer orchestration
- relay and export panels
- runtime diagnostics
- graph canvas + node detail coordination

### State

- `src/features/graph/app/store/`

Important slices:

- `graphSlice.ts` for nodes, links, adjacency, root state, expansion state
- `relaySlice.ts` for relay URLs, relay health, override status, stale graph status
- `uiSlice.ts` for active panel, selected node, compare selection, render config, active layer
- `analysisSlice.ts` for discovered graph analysis status and result reuse
- `zapSlice.ts` for zap-layer state and sorted zap edges
- `exportSlice.ts` for deep-user selection and export job progress

Current UI layers in store/render:

- `graph`
- `mutuals`
- `keywords`
- `zaps`
- `pathfinding`

Important caution:

- `pathfinding` exists in runtime/store/render contracts, but it should be treated as partial infrastructure until there is a complete end-user workflow and panel around it

### Kernel and runtime

- `src/features/graph/kernel/runtime.ts`
- `src/features/graph/kernel/runner.ts`
- `src/features/graph/kernel/headless.ts`
- `src/features/graph/kernel/transcript-relay.ts`

This layer handles:

- root decoding and loading
- relay session management
- reversible relay overrides
- node detail hydration
- node structure preview and expansion
- keyword search
- layer toggling
- discovered graph analysis scheduling
- zap-layer prefetching
- snapshot export orchestration

If the logic feels like workflow, session lifecycle, or cross-cutting graph behavior, it belongs here.

### Database and persistence

- `src/features/graph/db/`

This layer owns client persistence through Dexie and repository helpers for:

- profiles
- contact lists
- raw events
- replaceable and addressable heads
- zap records
- inbound references

### Transport and protocol details

- `src/features/graph/nostr/`

Use this layer for graph-specific relay and subscription behavior. Keep generic auth/profile helpers in `src/lib/nostr.ts`.

### Rendering

- `src/features/graph/render/`
- `src/features/graph/components/GraphCanvas.tsx`

This layer owns:

- deck.gl integration
- viewport and fit logic
- worker-backed render model generation
- avatar/image runtime and zoom-aware quality thresholds
- label selection and scene geometry
- compare highlighting and layer-specific visual transforms

### Workers

- `src/features/graph/workers/events.worker.ts`
- `src/features/graph/workers/graph.worker.ts`
- `src/features/graph/workers/verifyWorker.ts`

Use workers for heavy or repeated operations such as:

- event parsing and normalization
- keyword extraction
- graph analysis
- render-model preparation
- event signature verification

### Export

- `src/features/graph/export/`

This layer already supports:

- frozen snapshots
- deterministic ZIP packaging
- multipart archive generation
- manifest and file-tree construction
- profile photo archive artifacts
- per-user evidence packaging

If the request is about downloadable evidence, provenance, or reproducible capture, extend this layer instead of building a second export path elsewhere.

## 5. Current graph workflow

At a high level:

1. The user enters an `npub` or `nprofile`.
2. `NpubInput.tsx` validates and decodes the root pointer.
3. The kernel loads the root neighborhood from the active relay set.
4. Workers parse events and compute graph analysis.
5. Store slices receive nodes, links, relay state, analysis, zap state, and export state.
6. The render pipeline translates store data into deck.gl-friendly structures.
7. The UI exposes node detail, relay controls, render controls, export actions, and runtime diagnostics.

This means:

- validation belongs near the input/kernel boundary
- session and relay behavior belongs in the kernel
- expensive transforms belong in workers or analysis
- visual decisions belong in render/components

## 6. User-facing strengths already present

The repo is already strong at:

- relay-aware identity discovery
- graph exploration with graceful degraded states
- node expansion without discarding the existing session
- visual comparison of selected identities
- discovered-graph analysis for communities, leaders, and bridges
- zap-aware graph reading
- evidence-oriented export for research or demo packaging

This is a stronger hackathon story than positioning the app as a plain profile viewer.

## 7. Safe extension points

### Add a new top-level page

Touch:

- `src/app/<route>/page.tsx`
- `src/components/Navbar.tsx`

Use this for:

- standalone profile utilities
- badge workflows
- export viewers

### Add a graph-side panel or control

Touch:

- `src/features/graph/GraphApp.tsx`
- one or more files in `src/features/graph/components/`
- the relevant graph store slice

Use this for:

- trust overlays
- explanation panels
- richer node detail workflows
- compare-mode controls

### Add heavy discovery or analysis logic

Touch:

- `src/features/graph/kernel/`
- `src/features/graph/analysis/`
- `src/features/graph/workers/`

Use this for:

- ranking/scoring
- community heuristics
- pathfinding completion
- more expensive graph transforms

### Add shared account capabilities

Touch:

- `src/lib/nostr.ts`
- `src/store/auth.ts`
- `src/components/LoginModal.tsx`

Use this for:

- new auth flows
- shared publishing helpers
- account-level mutations

## 8. Recommended next-step features

Features that fit the current code well:

- NIP-05 trust overlay on nodes and node detail
- web-of-trust scoring with explanation
- stronger badge and zap overlays inside graph analysis
- export-ready identity cards for selected nodes
- relay reliability summaries tied to discovery confidence
- external attestations shown in node detail

Feature that is plausible but not yet complete:

- follow pathfinding between identities

If you build that, finish the full flow:

- runtime request
- store state
- UI controls
- explanation copy
- visual layer treatment

## 9. Working conventions

- Keep async fetches bounded by timeouts.
- Preserve partial-state UX when relays underperform.
- Reuse the existing La Crypta visual language.
- Prefer extending `src/features/graph/` rather than bypassing it.
- Do not reintroduce the old `store/nav.ts` pattern.

## 10. Recommended reading order

If you are new to the repo, read files in this order:

1. `src/app/page.tsx`
2. `src/features/graph/GraphClient.tsx`
3. `src/features/graph/GraphApp.tsx`
4. `src/features/graph/app/store/types.ts`
5. `src/features/graph/kernel/runtime.ts`
6. `src/features/graph/components/GraphCanvas.tsx`
7. `src/features/graph/export/types.ts`
8. `src/features/graph/analysis/types.ts`
9. `src/lib/nostr.ts`
10. `src/components/Profile.tsx`
11. `src/components/Badges.tsx`
