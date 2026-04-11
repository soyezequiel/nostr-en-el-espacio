# Reporte de Impacto

> Generado por la capa deterministica de context-artifact-generator.

## Archivos Fuente Cambiados
- .claude/launch.json
- .next/_events_21052.json
- .next/_events_22572.json
- .next/_events_26772.json
- .next/_events_28108.json
- .next/_events_33876.json
- .next/_events_35612.json
- .next/build-manifest.json
- .next/dev/prerender-manifest.json
- .next/dev/server/chunks/ssr/[root-of-the-server]__09h8in1._.js
- .next/dev/server/chunks/ssr/[root-of-the-server]__0u4e96o._.js
- .next/dev/server/chunks/ssr/[root-of-the-server]__0xlmxgi._.js
- .next/dev/server/chunks/ssr/[root-of-the-server]__0xo239y._.js
- .next/dev/static/chunks/src_0fmup2r._.js
- .next/dev/static/chunks/src_0izbcuf._.js
- .next/dev/static/chunks/src_0sw1_wl._.js
- .next/diagnostics/route-bundle-stats.json
- .next/fallback-build-manifest.json
- .next/server/app/_not-found/page_client-reference-manifest.js
- .next/server/app/badges/page_client-reference-manifest.js
- .next/server/app/page/react-loadable-manifest.json
- .next/server/app/page_client-reference-manifest.js
- .next/server/app/profile/page_client-reference-manifest.js
- .next/server/chunks/ssr/[root-of-the-server]__0bh4_.n._.js
- .next/server/chunks/ssr/[root-of-the-server]__0eu04-u._.js
- .next/server/chunks/ssr/[root-of-the-server]__0gkf33d._.js
- .next/server/chunks/ssr/[root-of-the-server]__13_89qx._.js
- .next/server/chunks/ssr/_13orez4._.js
- .next/server/middleware-build-manifest.js
- .next/static/chunks/003tnyqo5-gn6.js
- .next/static/chunks/003x6qy96txck.js
- .next/static/chunks/0_k0tvv~jeio1.js
- .next/static/chunks/0_v5dxcc386qr.js
- .next/static/chunks/0fj2fbuj5~re7.js
- .next/static/chunks/0gy2_uxxnof28.js
- .next/static/chunks/0qvraivts7u~9.js
- .next/static/chunks/0vdw853nzh__b.js
- .next/static/chunks/0wgp6zy-d30a4.js
- .next/static/chunks/1286m6cge2wak.js
- .next/static/fvdqpwJK2-OrFtKOPbwdC/_buildManifest.js
- .next/static/fvdqpwJK2-OrFtKOPbwdC/_clientMiddlewareManifest.js
- .next/static/fvdqpwJK2-OrFtKOPbwdC/_ssgManifest.js
- .next/static/pFyQvd8o7aYOM9sir_Hqn/_buildManifest.js
- .next/static/pFyQvd8o7aYOM9sir_Hqn/_clientMiddlewareManifest.js
- .next/static/pFyQvd8o7aYOM9sir_Hqn/_ssgManifest.js
- AGENTS.md
- CLAUDE.md
- next-env.d.ts
- src/app/badges/page.tsx
- src/app/profile/page.tsx
- src/components/Badges.tsx
- src/components/LoginModal.tsx
- src/components/Navbar.tsx
- src/components/Profile.tsx
- src/features/graph/GraphApp.tsx
- src/features/graph/app/store/types.ts
- src/features/graph/components/GraphCanvas.tsx
- src/features/graph/components/GraphControlRail.tsx
- src/features/graph/db/database.ts
- src/features/graph/db/entities.ts
- src/features/graph/db/repositories.ts
- src/features/graph/db/utils.ts
- src/features/graph/kernel/modules/context.ts
- src/features/graph/kernel/modules/follower-discovery.ts
- src/features/graph/kernel/modules/root-loader.ts
- src/features/graph/kernel/transcript-relay.ts
- src/features/graph/kernel/transitions/root-load.ts
- src/features/graph/nostr/relay-adapter.ts
- src/features/graph/nostr/relay-transport.ts
- src/features/graph/nostr/types.ts
- src/features/graph/render/GraphViewport.tsx
- src/features/graph/render/GraphViewportLazy.tsx
- src/features/graph/render/index.ts

## Modulos Afectados
- .claude
- .next
- app
- components
- features
- root

## Artefactos Generados Afectados
- changes/impact-report.md
- changes/stale-artifacts.md
- decisions/architecture.md
- decisions/invariants.md
- flows/entrypoints.md
- modules/.claude.md
- modules/.next.md
- modules/app.md
- modules/components.md
- modules/docs.md
- modules/features.md
- modules/lib.md
- modules/public.md
- modules/root.md
- modules/scripts.md
- modules/store.md
- modules/types.md
- repo-map.md
- symbols/.claude.symbols.json
- symbols/.next.symbols.json
- symbols/app.symbols.json
- symbols/components.symbols.json
- symbols/docs.symbols.json
- symbols/features.symbols.json
- symbols/lib.symbols.json
- symbols/public.symbols.json
- symbols/root.symbols.json
- symbols/scripts.symbols.json
- symbols/store.symbols.json
- symbols/types.symbols.json

## Plan de Regeneracion Recomendado
- Corre `context build` para refrescar todos los artefactos generados vencidos.

## Notas de Confianza
- El analisis de impacto es deterministico y se basa en hashes de archivos, ownership de modulos, imports y exports.
- Las referencias se incluyen solo cuando estan disponibles de forma barata desde la metadata del parser.
