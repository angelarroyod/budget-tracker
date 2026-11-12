# ADR 0001: The ledger pipeline is Python and SQL, run by GitHub Actions

**Status:** accepted · 2026-11

## Context

The app is TypeScript on Vercel. Month-end reconciliation needs a batch job that reads finance's
ledger file, validates it, loads it and compares it with the tracker. That job could live in the
app or beside it.

The nightly demo reset was a Vercel Cron call to `/api/reset` (TypeScript). The pipeline has to run
*after* the reset, every night, and produce the same results every night.

## Decision

- **Python for orchestration, SQL for the logic.** Validation is one ordered `CASE` per row, loading
  is `INSERT … ON CONFLICT`, reconciliation is a join. Python (stdlib `csv`, `psycopg`) reads the file,
  runs the steps in a transaction, records the run and logs JSON. No pandas: the data is a few
  hundred rows and the rules are set operations the database already does well.
- **Drizzle owns the schema.** The pipeline tables are in `src/db/schema.ts` and its migrations, so
  there is one migration history; Python only reads and writes rows.
- **One GitHub Actions job runs the nightly sequence** (`.github/workflows/nightly-reset.yml`):
  call `/api/reset`, then run the pipeline against the production database. The Vercel Cron entry is
  removed, so nothing can wipe the ledger after it loads.

## Alternatives considered

- **TypeScript inside `/api/reset`.** One runtime, one deploy, reconciliation always in step with the
  reset. Rejected because batch data work is usually Python and SQL, and keeping the pipeline outside
  the web app is closer to how a finance data team would run it: separately deployable, testable
  without a browser, with its own credentials.
- **A Python Vercel Function next to Next.js.** Would keep everything on Vercel, but adds a second
  runtime to the web deployment and still needs ordering against the cron.

## Consequences

- The production `DATABASE_URL` is a GitHub Actions secret. That is a second place the credential
  lives; a pipeline-only database role (write to ledger tables, read the tracker) would narrow it.
- Reconciliation is a nightly snapshot. A visitor's edit during the day isn't reconciled until the
  next run, which is also how a real month-end batch behaves.
- GitHub may start scheduled runs late, and disables schedules on repositories with no activity for
  60 days. The job can also be started by hand (`workflow_dispatch`).
- CI runs pytest against a real Postgres service, seeded the same way as production.
