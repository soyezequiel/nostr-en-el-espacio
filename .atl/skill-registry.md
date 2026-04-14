# Skill Registry

**Delegator use only.** This registry is intentionally minimal for the Nostr Explorer repo. It tracks the non-default skills that were intentionally kept after pruning global skill inventory.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| Prompt engineering, adaptation, prompt splitting, or prompt diagnosis | prompt-master-es-v3 | C:/Users/soyal/.codex/skills/prompt-master-es-v3/SKILL.md |
| Bugs, test failures, or unexpected behavior before proposing fixes | systematic-debugging | C:/Users/soyal/.agents/skills/systematic-debugging/SKILL.md |
| Visually strong landing pages, prototypes, or product UI work | frontend-skill | C:/Users/soyal/.codex/skills/frontend-skill/SKILL.md |
| React or Next.js performance-oriented implementation or review | vercel-react-best-practices | C:/Users/soyal/.agents/skills/vercel-react-best-practices/SKILL.md |

## Compact Rules

### prompt-master-es-v3
- Use when converting rough ideas into production-ready prompts.
- Ask only short clarifying questions when the target tool is ambiguous.
- Keep prompt outputs ready to paste.

### systematic-debugging
- Use before proposing fixes for bugs, failing tests, or unexpected behavior.
- Compare against working references before changing code.
- Prefer root-cause isolation over speculative patching.

### frontend-skill
- Use for visually important UI, landing pages, demos, and product surfaces.
- Prioritize composition, hierarchy, and restraint over generic card-heavy layouts.
- Keep branding and visual direction coherent.

### vercel-react-best-practices
- Use when implementing or reviewing React and Next.js code with performance in mind.
- Prefer stable handlers, careful initialization, and patterns that reduce unnecessary re-renders.
- Apply when bundle size, rendering cost, or app responsiveness matter.

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| AGENTS.md | F:/proyectos/Nostr explorer/AGENTS.md | Primary agent instructions for this repo. |
| CLAUDE.md | F:/proyectos/Nostr explorer/CLAUDE.md | Secondary agent instructions and workflow notes. |
| current-codebase.md | F:/proyectos/Nostr explorer/docs/current-codebase.md | Current architecture reference. |
| src/app/ | F:/proyectos/Nostr explorer/src/app/ | Next.js routes and global app entrypoints. |
| src/components/ | F:/proyectos/Nostr explorer/src/components/ | Shared UI components. |
| src/features/graph/ | F:/proyectos/Nostr explorer/src/features/graph/ | Graph-first product surface and supporting modules. |
| src/lib/nostr.ts | F:/proyectos/Nostr explorer/src/lib/nostr.ts | Shared Nostr helpers for account/profile/badge fetches. |
| src/store/auth.ts | F:/proyectos/Nostr explorer/src/store/auth.ts | Shared auth state. |

Read the convention files listed above for project-specific patterns and rules. No extra cross-project skill inventory should live in this repo.
