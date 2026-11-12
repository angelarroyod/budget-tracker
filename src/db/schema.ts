import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// Money is always integer cents. mode "number" is safe: Number.MAX_SAFE_INTEGER cents ≈ $90 trillion.
const cents = (name: string) => bigint(name, { mode: "number" });

export const roleEnum = pgEnum("role", ["executive", "champion", "delegate", "finance"]);
export const currencyEnum = pgEnum("currency", ["USD", "MXN"]);
export const expenseStatusEnum = pgEnum("expense_status", ["committed", "accrued", "actual"]);
export const approvalEnum = pgEnum("approval", ["none", "pending", "approved", "rejected"]);
export const requestStatusEnum = pgEnum("request_status", ["pending", "approved", "rejected"]);
export const stepDecisionEnum = pgEnum("step_decision", ["pending", "approved", "rejected", "skipped"]);
export const stepRoleEnum = pgEnum("step_role", ["champion", "executive", "finance"]);

export const teams = pgTable("teams", {
  id: serial().primaryKey(),
  key: text().notNull().unique(), // i18n key: "facilities", "ehs", …
  costCenter: text("cost_center").notNull().unique(), // how the finance ledger names the team: "CC-110", …
  // ponytail: no FK to users (circular). Champion is resolved via users.team_id + role.
});

export const users = pgTable(
  "users",
  {
    id: serial().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    role: roleEnum().notNull(),
    teamId: integer("team_id").references(() => teams.id),
  },
  (t) => [
    index("users_team_idx").on(t.teamId),
    // champions and delegates belong to a team; executive and finance see everything
    check(
      "users_team_by_role",
      sql`(${t.role} in ('champion','delegate')) = (${t.teamId} is not null)`,
    ),
  ],
);

export const lineItems = pgTable(
  "line_items",
  {
    id: serial().primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id),
    accountCode: text("account_code").notNull(),
    nameEn: text("name_en").notNull(),
    nameEs: text("name_es").notNull(),
  },
  (t) => [index("line_items_team_idx").on(t.teamId)],
);

// Annual team budget = sum of its plans. No separate budget number to drift.
export const plans = pgTable(
  "plans",
  {
    lineItemId: integer("line_item_id").notNull().references(() => lineItems.id),
    month: smallint().notNull(),
    amountCents: cents("amount_cents").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.lineItemId, t.month] }),
    check("plans_month", sql`${t.month} between 1 and 12`),
    check("plans_amount", sql`${t.amountCents} >= 0`),
  ],
);

export const fxRates = pgTable(
  "fx_rates",
  {
    month: smallint().primaryKey(),
    usdMxn: numeric("usd_mxn", { precision: 12, scale: 6 }).notNull(),
  },
  (t) => [check("fx_month", sql`${t.month} between 1 and 12`)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: serial().primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id),
    lineItemId: integer("line_item_id").references(() => lineItems.id), // null = unbudgeted
    description: text().notNull(),
    vendor: text().notNull(),
    fiscalMonth: smallint("fiscal_month").notNull(),
    status: expenseStatusEnum().notNull(),
    amountOrigCents: cents("amount_orig_cents").notNull(),
    currency: currencyEnum().notNull(),
    fxRate: numeric("fx_rate", { precision: 12, scale: 6 }).notNull(), // MXN per USD, locked at entry
    amountUsdCents: cents("amount_usd_cents").notNull(),
    invoiceUrl: text("invoice_url"),
    nextFy: boolean("next_fy").notNull().default(false),
    approval: approvalEnum().notNull().default("none"),
    createdBy: integer("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("expenses_team_month_idx").on(t.teamId, t.fiscalMonth),
    index("expenses_line_item_idx").on(t.lineItemId),
    index("expenses_created_by_idx").on(t.createdBy),
    check("expenses_month", sql`${t.fiscalMonth} between 1 and 12`),
    check("expenses_amount", sql`${t.amountOrigCents} > 0 and ${t.amountUsdCents} > 0`),
    check("expenses_fx", sql`${t.fxRate} > 0`),
  ],
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: serial().primaryKey(),
    expenseId: integer("expense_id").notNull().unique().references(() => expenses.id),
    requesterId: integer("requester_id").notNull().references(() => users.id),
    reason: text().notNull(),
    status: requestStatusEnum().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("approval_requests_requester_idx").on(t.requesterId)],
);

export const approvalSteps = pgTable(
  "approval_steps",
  {
    id: serial().primaryKey(),
    requestId: integer("request_id").notNull().references(() => approvalRequests.id),
    seq: smallint().notNull(),
    role: stepRoleEnum().notNull(),
    approverId: integer("approver_id").references(() => users.id),
    decision: stepDecisionEnum().notNull().default("pending"),
    comment: text(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    index("approval_steps_request_idx").on(t.requestId, t.seq),
    index("approval_steps_approver_idx").on(t.approverId),
  ],
);

export const settings = pgTable(
  "settings",
  {
    id: smallint().primaryKey().default(1),
    financeThresholdCents: cents("finance_threshold_cents").notNull(),
  },
  (t) => [check("settings_singleton", sql`${t.id} = 1`)],
);

// ── Finance-ledger ingestion and reconciliation (pipelines/, Python). ──────────────────────────
// Drizzle owns the schema so there is one migration history; the pipeline only reads and writes rows.

export const runStatusEnum = pgEnum("run_status", ["running", "succeeded", "failed"]);
export const rejectReasonEnum = pgEnum("reject_reason", [
  "missing_field", // a required column is blank
  "bad_format", // not a date / integer / 2-decimal amount / known currency
  "month_out_of_range", // outside FY2026, or in a month that is still open
  "unknown_cost_center",
  "unknown_account",
  "fx_rate_mismatch", // rate differs from the month's rate in fx_rates
  "fx_amount_mismatch", // the row's own rate doesn't reproduce its USD amount
  "duplicate_key", // same journal_id + line_no twice in one file
  "duplicate_posting", // same tracker expense and amount posted under a second journal
]);
export const reconKindEnum = pgEnum("recon_kind", ["matched", "amount_mismatch", "ledger_only", "tracker_only"]);

/** One row per pipeline run, success or failure: the run log the Data health panel reads. */
export const ingestRuns = pgTable("ingest_runs", {
  id: serial().primaryKey(),
  sourceFile: text("source_file").notNull(),
  sourceSha256: text("source_sha256").notNull(),
  status: runStatusEnum().notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  rowsRead: integer("rows_read"),
  rowsRejected: integer("rows_rejected"),
  rowsInserted: integer("rows_inserted"),
  rowsUpdated: integer("rows_updated"),
  rowsUnchanged: integer("rows_unchanged"),
  error: text(),
});

/** The file exactly as received: every column is text, so a malformed row still lands and can be rejected with a reason. */
export const ledgerStaging = pgTable(
  "ledger_staging",
  {
    runId: integer("run_id").notNull().references(() => ingestRuns.id),
    rowNumber: integer("row_number").notNull(), // 1 = first data row after the header
    journalId: text("journal_id"),
    lineNo: text("line_no"),
    postingDate: text("posting_date"),
    costCenter: text("cost_center"),
    accountCode: text("account_code"),
    trackerRef: text("tracker_ref"),
    description: text(),
    currency: text(),
    amountOrig: text("amount_orig"),
    fxRate: text("fx_rate"),
    amountUsd: text("amount_usd"),
  },
  (t) => [primaryKey({ columns: [t.runId, t.rowNumber] })],
);

/** Rows that failed validation. Keyed by file hash + row, so re-running the same file adds nothing. */
export const ledgerRejects = pgTable(
  "ledger_rejects",
  {
    id: serial().primaryKey(),
    sourceSha256: text("source_sha256").notNull(),
    rowNumber: integer("row_number").notNull(),
    runId: integer("run_id").notNull().references(() => ingestRuns.id), // first run that saw it
    reason: rejectReasonEnum().notNull(),
    detail: text().notNull(),
    trackerRef: text("tracker_ref"), // as received, so a reject can be linked to the tracker expense it was for
    raw: jsonb().notNull(),
  },
  (t) => [unique("ledger_rejects_source_row").on(t.sourceSha256, t.rowNumber)],
);

/**
 * Validated ledger lines. Natural key = journal_id + line_no: the identity finance itself uses, so a
 * re-sent file updates in place instead of duplicating. tracker_ref has no FK on purpose: the ledger
 * is an outside system and may reference expenses the tracker doesn't have.
 */
export const ledgerPostings = pgTable(
  "ledger_postings",
  {
    id: serial().primaryKey(),
    journalId: text("journal_id").notNull(),
    lineNo: smallint("line_no").notNull(),
    postingDate: date("posting_date").notNull(),
    fiscalMonth: smallint("fiscal_month").notNull(),
    teamId: integer("team_id").notNull().references(() => teams.id),
    accountCode: text("account_code").notNull(),
    trackerRef: integer("tracker_ref"),
    description: text().notNull(),
    currency: currencyEnum().notNull(),
    amountOrigCents: cents("amount_orig_cents").notNull(),
    fxRate: numeric("fx_rate", { precision: 12, scale: 6 }).notNull(),
    amountUsdCents: cents("amount_usd_cents").notNull(),
    loadedRunId: integer("loaded_run_id").notNull().references(() => ingestRuns.id),
    updatedRunId: integer("updated_run_id").references(() => ingestRuns.id), // only set when a later file changed the row
  },
  (t) => [
    unique("ledger_postings_natural_key").on(t.journalId, t.lineNo),
    index("ledger_postings_tracker_ref_idx").on(t.trackerRef),
    index("ledger_postings_team_month_idx").on(t.teamId, t.fiscalMonth),
    check("ledger_postings_month", sql`${t.fiscalMonth} between 1 and 12`),
    check("ledger_postings_amount", sql`${t.amountOrigCents} > 0 and ${t.amountUsdCents} > 0`),
  ],
);

/**
 * Reconciliation of ledger postings against tracker expenses, one row per expense or unmatched posting.
 * item_key is stable across runs ("matched:E42", "ledger_only:JE-2026-09-0107:1"), so recomputing an
 * unchanged ledger rewrites nothing.
 */
export const reconItems = pgTable(
  "recon_items",
  {
    id: serial().primaryKey(),
    itemKey: text("item_key").notNull().unique(),
    kind: reconKindEnum().notNull(),
    fiscalMonth: smallint("fiscal_month").notNull(),
    teamId: integer("team_id").notNull().references(() => teams.id),
    expenseId: integer("expense_id").references(() => expenses.id),
    postingId: integer("posting_id").references(() => ledgerPostings.id), // set for ledger-only items
    rejectId: integer("reject_id").references(() => ledgerRejects.id), // tracker-only because its ledger row was rejected
    trackerUsdCents: cents("tracker_usd_cents"),
    ledgerUsdCents: cents("ledger_usd_cents"),
    runId: integer("run_id").notNull().references(() => ingestRuns.id), // run that first produced it
    // A person explains each exception; nothing is corrected automatically. Cleared by the pipeline if the facts change.
    resolution: text(),
    resolvedBy: integer("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("recon_items_team_month_idx").on(t.teamId, t.fiscalMonth),
    index("recon_items_expense_idx").on(t.expenseId),
    check(
      "recon_items_resolution",
      sql`(${t.resolution} is null) = (${t.resolvedBy} is null) and (${t.resolution} is null) = (${t.resolvedAt} is null)
        and (${t.resolution} is null or ${t.kind} <> 'matched')`,
    ),
  ],
);

/**
 * A fiscal month finance has closed. Only "closed" is stored: "reconciled" is derived from recon_items
 * (every exception resolved), so the two can't disagree. Closing locks the month's expenses.
 */
export const monthCloses = pgTable(
  "month_closes",
  {
    fiscalMonth: smallint("fiscal_month").primaryKey(),
    closedBy: integer("closed_by").notNull().references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("month_closes_month", sql`${t.fiscalMonth} between 1 and 12`)],
);

export type ExpenseStatus = (typeof expenseStatusEnum.enumValues)[number];
export type StepRole = (typeof stepRoleEnum.enumValues)[number];
export type StepDecision = (typeof stepDecisionEnum.enumValues)[number];
