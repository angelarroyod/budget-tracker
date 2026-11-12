CREATE TYPE "public"."recon_kind" AS ENUM('matched', 'amount_mismatch', 'ledger_only', 'tracker_only');--> statement-breakpoint
CREATE TYPE "public"."reject_reason" AS ENUM('missing_field', 'bad_format', 'month_out_of_range', 'unknown_cost_center', 'unknown_account', 'fx_rate_mismatch', 'fx_amount_mismatch', 'duplicate_key', 'duplicate_posting');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_file" text NOT NULL,
	"source_sha256" text NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"rows_read" integer,
	"rows_rejected" integer,
	"rows_inserted" integer,
	"rows_updated" integer,
	"rows_unchanged" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "ledger_postings" (
	"id" serial PRIMARY KEY NOT NULL,
	"journal_id" text NOT NULL,
	"line_no" smallint NOT NULL,
	"posting_date" date NOT NULL,
	"fiscal_month" smallint NOT NULL,
	"team_id" integer NOT NULL,
	"account_code" text NOT NULL,
	"tracker_ref" integer,
	"description" text NOT NULL,
	"currency" "currency" NOT NULL,
	"amount_orig_cents" bigint NOT NULL,
	"fx_rate" numeric(12, 6) NOT NULL,
	"amount_usd_cents" bigint NOT NULL,
	"loaded_run_id" integer NOT NULL,
	"updated_run_id" integer,
	CONSTRAINT "ledger_postings_natural_key" UNIQUE("journal_id","line_no"),
	CONSTRAINT "ledger_postings_month" CHECK ("ledger_postings"."fiscal_month" between 1 and 12),
	CONSTRAINT "ledger_postings_amount" CHECK ("ledger_postings"."amount_orig_cents" > 0 and "ledger_postings"."amount_usd_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_rejects" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_sha256" text NOT NULL,
	"row_number" integer NOT NULL,
	"run_id" integer NOT NULL,
	"reason" "reject_reason" NOT NULL,
	"detail" text NOT NULL,
	"tracker_ref" text,
	"raw" jsonb NOT NULL,
	CONSTRAINT "ledger_rejects_source_row" UNIQUE("source_sha256","row_number")
);
--> statement-breakpoint
CREATE TABLE "ledger_staging" (
	"run_id" integer NOT NULL,
	"row_number" integer NOT NULL,
	"journal_id" text,
	"line_no" text,
	"posting_date" text,
	"cost_center" text,
	"account_code" text,
	"tracker_ref" text,
	"description" text,
	"currency" text,
	"amount_orig" text,
	"fx_rate" text,
	"amount_usd" text,
	CONSTRAINT "ledger_staging_run_id_row_number_pk" PRIMARY KEY("run_id","row_number")
);
--> statement-breakpoint
CREATE TABLE "recon_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_key" text NOT NULL,
	"kind" "recon_kind" NOT NULL,
	"fiscal_month" smallint NOT NULL,
	"team_id" integer NOT NULL,
	"expense_id" integer,
	"posting_id" integer,
	"reject_id" integer,
	"tracker_usd_cents" bigint,
	"ledger_usd_cents" bigint,
	"run_id" integer NOT NULL,
	CONSTRAINT "recon_items_item_key_unique" UNIQUE("item_key")
);
--> statement-breakpoint
-- Hand-edited: teams already has rows in production, so add the column nullable, backfill, then
-- tighten. The nightly reset reseeds the same values from src/db/seed.ts.
ALTER TABLE "teams" ADD COLUMN "cost_center" text;--> statement-breakpoint
UPDATE "teams" SET "cost_center" = CASE "key"
	WHEN 'facilities' THEN 'CC-110' WHEN 'operations' THEN 'CC-120' WHEN 'ehs' THEN 'CC-130'
	WHEN 'quality' THEN 'CC-140' WHEN 'maintenance' THEN 'CC-150' WHEN 'engineering' THEN 'CC-160'
	WHEN 'it' THEN 'CC-170' WHEN 'hr' THEN 'CC-180' ELSE 'CC-' || "id" END;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "cost_center" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_postings" ADD CONSTRAINT "ledger_postings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_postings" ADD CONSTRAINT "ledger_postings_loaded_run_id_ingest_runs_id_fk" FOREIGN KEY ("loaded_run_id") REFERENCES "public"."ingest_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_postings" ADD CONSTRAINT "ledger_postings_updated_run_id_ingest_runs_id_fk" FOREIGN KEY ("updated_run_id") REFERENCES "public"."ingest_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_rejects" ADD CONSTRAINT "ledger_rejects_run_id_ingest_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ingest_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_staging" ADD CONSTRAINT "ledger_staging_run_id_ingest_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ingest_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recon_items" ADD CONSTRAINT "recon_items_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recon_items" ADD CONSTRAINT "recon_items_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recon_items" ADD CONSTRAINT "recon_items_posting_id_ledger_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."ledger_postings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recon_items" ADD CONSTRAINT "recon_items_reject_id_ledger_rejects_id_fk" FOREIGN KEY ("reject_id") REFERENCES "public"."ledger_rejects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recon_items" ADD CONSTRAINT "recon_items_run_id_ingest_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ingest_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_postings_tracker_ref_idx" ON "ledger_postings" USING btree ("tracker_ref");--> statement-breakpoint
CREATE INDEX "ledger_postings_team_month_idx" ON "ledger_postings" USING btree ("team_id","fiscal_month");--> statement-breakpoint
CREATE INDEX "recon_items_team_month_idx" ON "recon_items" USING btree ("team_id","fiscal_month");--> statement-breakpoint
CREATE INDEX "recon_items_expense_idx" ON "recon_items" USING btree ("expense_id");--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_cost_center_unique" UNIQUE("cost_center");