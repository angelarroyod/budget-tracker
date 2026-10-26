# Budget Tracker

Site budget tracking for a fictional manufacturing plant (Cobalt Industrial – Monterrey Plant, FY2026).
Answers one question in ten seconds: **where is spend today, and where will it land at year end?**

See [SPEC.md](SPEC.md) for rules, data model and build plan.

## Stack

Next.js · TypeScript · Tailwind · shadcn/ui · Recharts · Drizzle ORM · Postgres (Neon in production, PGlite locally)

## Run locally

No Docker or Postgres install needed: `db:local` runs an embedded Postgres (PGlite) on port 5432.

```bash
pnpm install
cp .env.example .env
pnpm db:local        # terminal 1: keep running
pnpm db:migrate      # terminal 2
pnpm db:seed
pnpm dev
```

## Scripts

| Script | What it does |
|---|---|
| `db:local` | Embedded Postgres, data in `.pglite/` |
| `db:generate` | New SQL migration from `src/db/schema.ts` |
| `db:migrate` | Apply migrations to `DATABASE_URL` |
| `db:seed` | Wipe and reload deterministic demo data |
| `db:studio` | Browse the DB in Drizzle Studio |
| `typecheck` | Generate Next route types, then `tsc` |

All data is fictional.
