# Nostr Explorer

Graph-first Nostr identity explorer for La Crypta's IDENTITY Hackathon.

This repository started from the original `nostr-starter`, but the current app is no longer a profile-first starter kit. The primary surface is now an identity graph explorer with relay-aware discovery, worker-backed analysis, layered rendering, and auditable export.

## What the app does today

- Explore a discovered identity neighborhood from an `npub` or `nprofile`
- Inspect node profiles, discovered follow counts, followers, and mutuals
- Expand nodes without losing the existing graph session
- Reconfigure relays with reversible overrides and live health feedback
- Switch graph views for graph, mutual, keyword, and zap-oriented reading
- Compare selected identities visually inside the graph canvas
- Export auditable snapshot bundles as deterministic ZIP packages
- Log in with NIP-07, `nsec`, or NIP-46 bunker
- View the connected profile and NIP-58 badges on dedicated routes

## Routes

- `/` - identity graph explorer
- `/profile` - authenticated profile view with social stats and notes
- `/badges` - authenticated NIP-58 badge view

## Current Graph Capabilities

The graph route is the strongest part of the product and already includes:

- root input for `npub` and `nprofile`
- relay health indicators and relay override controls
- root loading states with graceful partial and stale handling
- node detail panel with async hydration and node expansion
- discovered graph analysis for communities, leaders, and bridges
- compare mode for selected nodes
- zap layer support in the render/store pipeline
- render diagnostics and image runtime diagnostics
- export selection for deep users plus auditable snapshot packaging

Note: there is internal support for a `pathfinding` layer in the graph runtime and render pipeline, but it should be treated as in-progress infrastructure rather than a polished user-facing feature.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS v4
- NDK v3
- nostr-tools
- Zustand
- deck.gl
- d3-force
- Dexie
- Web Workers
- qrcode.react
- fflate

## Architecture Snapshot

```text
src/
|-- app/                  # Next.js routes
|-- components/           # Shared navbar/login/profile/badges UI
|-- features/graph/       # Graph application slice
|   |-- analysis/         # Graph analysis models and helpers
|   |-- app/store/        # Zustand slices, selectors, store wiring
|   |-- components/       # Graph-facing panels and controls
|   |-- db/               # Dexie persistence and repositories
|   |-- export/           # Snapshot freezing and ZIP packaging
|   |-- kernel/           # Runtime orchestration and root loading
|   |-- nostr/            # Graph-specific relay transport logic
|   |-- render/           # deck.gl model, viewport, image pipeline
|   `-- workers/          # Event, graph, and verification workers
|-- lib/                  # Shared Nostr/media helpers for classic surfaces
|-- store/                # Shared auth state
`-- types/                # Browser Nostr typings
```

## Development

```bash
npm install
npm run dev
npm run build
npm run lint
```

The graph workers are rebuilt automatically through `predev`, `prebuild`, and `prestart`.

## Working Conventions

- Prefer extending `src/features/graph/` for identity-heavy work
- Keep Nostr fetches time-bounded and relay-aware
- Preserve partial-state UX when relay coverage is weak
- Reuse `src/lib/nostr.ts` for auth/profile/badge flows
- Treat export as evidence packaging, not just a file download

## Extra Docs

- [`docs/current-codebase.md`](./docs/current-codebase.md) for the real architecture guide
- [`AGENTS.md`](./AGENTS.md) for repo-specific implementation guidance
