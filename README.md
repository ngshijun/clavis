# Clavis

The operating platform for tuition centers: classrooms and a guided practice
path. `CONTEXT.md` states how the product is modelled.

Built with SvelteKit, shadcn-svelte, Tailwind CSS and Supabase. Postgres row level security
decides what each account may read or change; the app keeps people on the pages built for
their role.

## Running it

Docker must be running for the local Supabase stack.

```bash
pnpm install
pnpm supabase start   # Postgres, auth, storage and edge functions on 127.0.0.1:54321
cp .env.example .env.local   # then fill in the publishable key that `pnpm supabase status` prints
pnpm dev
```

`pnpm supabase db reset` rebuilds the database from the migrations and loads `supabase/seed.sql`:
six test accounts, seven classrooms and a question of every type. The top of
that file lists what each account and classroom is there to test, and the developer tools (the
wrench, on the dev server) sign in as any of them.

## Commands

```bash
pnpm dev        # dev server
pnpm build      # production build
pnpm check      # type check (run a build or the dev server once first, to compile the translations)
pnpm lint       # prettier and eslint
pnpm test       # unit tests
pnpm db:types   # regenerate src/lib/database.types.ts from the local database
```

## Changing the database

```bash
pnpm supabase migration new <name>   # then write the SQL in supabase/migrations/
pnpm supabase migration up           # apply it to the local database
pnpm db:types
```
