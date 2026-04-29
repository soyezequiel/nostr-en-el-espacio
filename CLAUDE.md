# CLAUDE.md

## Idioma
Responder en español. Términos técnicos en inglés con traducción breve entre paréntesis: "el `store` (almacén de estado)". Si un concepto puede ser desconocido, explicarlo en una línea.

## Proyecto
Nostr Explorer — app Sigma-first para La Crypta IDENTITY Hackathon 2026.
- `/` home minimal sin grafo.
- `/labs/sigma` producto principal: grafo de identidad, descubrimiento relay-aware, señales de confianza, export auditable.
- `/profile` perfil clásico. `/badges` NIP-58.
- Preservar: cobertura parcial de relays, estado stale, timeouts, export determinista.

## Directorios clave
- `src/app/` rutas Next.
- `src/components/` navbar, login, profile, badges, fallback de imagen.
- `src/lib/nostr.ts` helpers compartidos NDK/auth/profile/badge.
- `src/store/auth.ts` auth Zustand.
- `src/features/graph-v2/` UI Sigma, bridge, domain, projections, renderer.
- `src/features/graph-runtime/` runtime compartido: store, kernel, relay/protocol, DB, analysis, export, workers.
- `docs/current-codebase.md` referencia de arquitectura.
- `docs/avatar-pipeline-*.md` validación pipeline avatares.

## Comandos
npm (hay `package-lock.json`).
```bash
npm install
npm run dev
npm run build
npm run lint
npm run workers:build
npm run avatar:validate -- --output tmp/avatar-current.json
npm run avatar:compare -- tmp/avatar-before.json tmp/avatar-after.json
```
`dev/build/start` rebuildean workers vía pre-scripts. Avatar validation puede pedir `npx playwright install chromium`.

## Workflow
- Leer el código actual antes de editar.
- TodoWrite solo para trabajo multi-paso.
- Priorizar mejoras Sigma salvo que el pedido sea profile/badges.
- Mantener scope acotado. Revisar `git status` antes de ediciones grandes.
- Si se omite validación, explicarlo al final.

## Reglas de edición
- Auth/profile/badges compartidos → `src/lib/nostr.ts`.
- Relay/sesión del grafo → `src/features/graph-runtime/nostr/` o `kernel/`.
- Estado durable del grafo (capas, selección, export, relays, runtime) → `src/features/graph-runtime/app/store/`.
- Estado UI Sigma-only → `src/features/graph-v2/ui/`.
- Trabajo pesado → `workers/`, `analysis/`, renderer o `kernel/`. Nunca en render React.
- Rutas top-level → `src/app/<ruta>/page.tsx` + `src/components/Navbar.tsx`.
- Paneles/controles Sigma → `GraphAppV2.tsx` y boundary UI/runtime.
- Cambios de export deterministas y dentro de `src/features/graph-runtime/export/`.
- Visual: La Crypta en `globals.css`; Sigma scopeado en `graph-v2.css`.

## Validación (default antes de cerrar)
`npm run lint`. Targeted según el cambio:
- Worker/runtime: `npm run workers:build` (build solo si lo piden).
- Avatar/imagen: seguir `docs/avatar-pipeline-validation.md`.
- Export: verificar manifest/archivos/ZIP deterministas.
- Relay/Nostr: verificar timeout, estado stale, cobertura parcial.
- UI: revisar `/`; además `/profile` o `/badges` si se tocaron.

## Convenciones
- Stack: Next 16, React 19, TS strict, Tailwind v4, NDK v3, nostr-tools, Zustand, Sigma.js, Graphology, ForceAtlas2, Dexie, Web Workers, fflate.
- `@/*` → `src/*`.
- Fallos de relay y datos parciales = estados de UI normales.
- Export = empaquetado de evidencia, no descarga de conveniencia.
- Preservar timeouts y patrones relay-aware existentes.
- Transforms deterministas para analysis/export.

## Antipatrones
- No reintroducir `store/nav.ts` ni un section-switcher single-page.
- No hardcodear un único relay donde hay comportamiento relay-aware.
- No agregar fetches Nostr/red sin límites.
- No declarar `pathfinding` terminado sin verificar el flujo end-to-end.
- No tocar `.next/`, `node_modules/`, `tsconfig.tsbuildinfo` ni screenshots temporales sin pedido.
- No crear segundo cache de avatares ni segundo pipeline de export.

## Cuándo preguntar
Proceder si el pedido mapea a rutas, slices, módulos del kernel o docs existentes.
Preguntar solo si falta una decisión que afecta producto, corrección de protocolo, persistencia o semántica de evidencia del export.
Si un comando falla por entorno, reportar comando y error; no omitir en silencio.

## Checklist final
- Comportamiento implementado y acotado.
- Ruta relevante revisada.
- `lint` (y `build` si aplica) corridos o saltados con razón.
- Implicancias relay/parcial/export consideradas si se tocaron.
- Docs actualizadas si cambiaron comandos, arquitectura, validación o flujos visibles.
