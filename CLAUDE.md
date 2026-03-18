# Clavis — Claude Code Instructions

An education platform (student practice, parent monitoring, admin management) built with Vue 3 + TypeScript + TailwindCSS 4 + shadcn-vue + Supabase.

## First Principles

Reason from the original requirements and the root problem. If the motivation or goal is unclear, **stop and discuss** before proceeding. Do not assume the user knows exactly what they want.

## Solution Standards

When proposing modifications or refactoring plans:

- Use the shortest path to implementation — no over-engineering
- Only address the stated requirements — no unsolicited fallbacks, degradation paths, or scope additions that could cause business logic drift
- Use production-grade solutions only — no compatibility shims, patches, or workarounds
- Verify logical correctness across the full chain of execution
- If there is nothing to improve, say so

---

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # vue-tsc --build + vite build (parallel)
npm run type-check   # vue-tsc --build (NOT --noEmit; see gotchas)
npm run lint         # eslint . --fix --cache
npm run format       # prettier --write --experimental-cli src/
```

---

## Code Style

- `<script setup lang="ts">` for all Vue components
- Composables in `src/composables/` for reusable logic
- `defineProps` and `defineEmits` with TypeScript generics
- Proper typing — no `any` unless absolutely necessary
- Stores in `src/stores/` using Pinia
- Role-scoped pages under `src/pages/{student,parent,admin}/`

---

## MCP Tool Usage

### Context7 (REQUIRED for code tasks)

**Always use Context7 MCP tools** before generating code, configuration, or setup instructions.

1. Call `resolve-library-id` to find the correct library ID
2. Call `get-library-docs` with that ID to fetch current documentation
3. Generate code based on the retrieved docs

Use any other relevant MCP tools automatically when they would improve the response.

---

## Database Rules

`src/types/database.types.ts` is the **single source of truth** for all database schemas. NEVER edit it manually — it is auto-generated.

### Migration Workflow

```bash
npx supabase migration new <migration-name>   # 1. Create migration
# 2. Edit the SQL file in supabase/migrations/
npx supabase db push                           # 3. Apply to database
npx supabase gen types typescript --linked > src/types/database.types.ts  # 4. Regen types
```

Afterwards, check for security and performance issues with supabase MCP.

### RLS Policies

Wrap `auth.uid()`, `auth.jwt()`, and `current_setting()` in a subquery to prevent per-row re-evaluation:

```sql
-- GOOD: evaluates once
CREATE POLICY "read own" ON my_table
FOR SELECT USING (user_id = (SELECT auth.uid()));
```

### Upserts

`upsert` with `onConflict` requires a unique constraint on the conflict columns and an UPDATE RLS policy.

---

## Git

- Branches: `main` (production) → `staging` (integration) → feature branches
- Do NOT add `Co-Authored-By` lines to commit messages
- Keep untracked: `.claude/settings.local.json`, `supabase/.temp/`

---

## Gotchas

- `vue-tsc --noEmit` may pass while `vue-tsc --build` fails (different modes). Always use `npm run type-check` (which runs `--build`).
- Clean stale build cache: `rm -rf node_modules/.tmp/tsconfig.app.tsbuildinfo`
- `shadcn-vue init --overwrite` resets `src/lib/utils.ts` and `src/style.css` to defaults — always revert these files as they contain custom functions and theming.
