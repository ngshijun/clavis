# Claude Code Instructions

## Tech Stack

- TypeScript
- Vue 3 (Composition API)
- TailwindCSS 4
- shadcn-vue
- Supabase

---

## MCP Tool Usage
### Context7 (REQUIRED for code tasks)
**Always use Context7 MCP tools** before generating code, configuration, or setup instructions.

Workflow:
1. Call `resolve-library-id` to find the correct library ID
2. Call `get-library-docs` with that ID to fetch current documentation
3. Generate code based on the retrieved docs

**Triggers** — Use Context7 when:
- Writing new components, composables, or utilities
- Setting up or configuring libraries/tools
- Referencing any library or API documentation
- Answering questions about library usage or best practices

### Other MCP Tools
Use any relevant MCP tools automatically when they would improve the response. No permission needed.

---

## Database Rules
### Single Source of Truth
`src/types/database.types.ts` is the **single source of truth** for all database schemas.
**NEVER** edit this file manually — it is auto-generated.

### Supabase Migration Workflow
When database changes are needed, follow this exact sequence:

```bash
# 1. Create migration file
npx supabase migration new <migration-name>
# 2. Edit the generated SQL file in supabase/migrations/
# 3. Apply migration to database
npx supabase db push
# 4. Regenerate TypeScript types
npx supabase gen types typescript --linked > src/types/database.types.ts
```

Afterwards, check for security and performance issues with supabase mcp and fix them if necessary.

### RLS Policy Best Practices
When writing Row Level Security (RLS) policies, **always wrap `auth.uid()` and other auth functions in a subquery** to prevent re-evaluation for each row:

```sql
-- BAD: Re-evaluates auth.uid() for every row (slow at scale)
CREATE POLICY "Users can read own data" ON my_table
FOR SELECT USING (user_id = auth.uid());

-- GOOD: Evaluates auth.uid() once per query (fast)
CREATE POLICY "Users can read own data" ON my_table
FOR SELECT USING (user_id = (SELECT auth.uid()));
```

This applies to all RLS policies using:
- `auth.uid()`
- `auth.jwt()`
- `current_setting()`

See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

### Upsert Requirements
When using Supabase `upsert` with `onConflict`, ensure:
1. A **unique constraint** exists on the specified columns
2. The user has **UPDATE permission** (RLS policy) if conflicts may occur

```typescript
// Requires: UNIQUE constraint on (student_id, topic_id, question_id)
await supabase
  .from('my_table')
  .upsert(data, { onConflict: 'student_id,topic_id,question_id' })
```

---

## Code Quality Standards
### No Quick Fixes
Never suggest quick fixes, hacks, or workarounds. All recommendations must:

- Follow industry best practices
- Be production-ready
- Consider maintainability and scalability
- Use proper typing (no `any` unless absolutely necessary)
- Don't forcefully suggest fixes/improvements if there's nothing to be improved (just say everything is good)

### Vue 3 Conventions
- Use `<script setup lang="ts">` syntax
- Prefer composables for reusable logic
- Use `defineProps` and `defineEmits` with TypeScript generics