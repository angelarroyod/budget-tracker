import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
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

export type ExpenseStatus = (typeof expenseStatusEnum.enumValues)[number];
export type StepRole = (typeof stepRoleEnum.enumValues)[number];
export type StepDecision = (typeof stepDecisionEnum.enumValues)[number];
