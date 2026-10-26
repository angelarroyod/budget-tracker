CREATE TYPE "public"."approval" AS ENUM('none', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('USD', 'MXN');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('committed', 'accrued', 'actual');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('executive', 'champion', 'delegate', 'finance');--> statement-breakpoint
CREATE TYPE "public"."step_decision" AS ENUM('pending', 'approved', 'rejected', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."step_role" AS ENUM('champion', 'executive', 'finance');--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"expense_id" integer NOT NULL,
	"requester_id" integer NOT NULL,
	"reason" text NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "approval_requests_expense_id_unique" UNIQUE("expense_id")
);
--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"seq" smallint NOT NULL,
	"role" "step_role" NOT NULL,
	"approver_id" integer,
	"decision" "step_decision" DEFAULT 'pending' NOT NULL,
	"comment" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"line_item_id" integer,
	"description" text NOT NULL,
	"vendor" text NOT NULL,
	"fiscal_month" smallint NOT NULL,
	"status" "expense_status" NOT NULL,
	"amount_orig_cents" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"fx_rate" numeric(12, 6) NOT NULL,
	"amount_usd_cents" bigint NOT NULL,
	"invoice_url" text,
	"next_fy" boolean DEFAULT false NOT NULL,
	"approval" "approval" DEFAULT 'none' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_month" CHECK ("expenses"."fiscal_month" between 1 and 12),
	CONSTRAINT "expenses_amount" CHECK ("expenses"."amount_orig_cents" > 0 and "expenses"."amount_usd_cents" > 0),
	CONSTRAINT "expenses_fx" CHECK ("expenses"."fx_rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"month" smallint PRIMARY KEY NOT NULL,
	"usd_mxn" numeric(12, 6) NOT NULL,
	CONSTRAINT "fx_month" CHECK ("fx_rates"."month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"account_code" text NOT NULL,
	"name_en" text NOT NULL,
	"name_es" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"line_item_id" integer NOT NULL,
	"month" smallint NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "plans_line_item_id_month_pk" PRIMARY KEY("line_item_id","month"),
	CONSTRAINT "plans_month" CHECK ("plans"."month" between 1 and 12),
	CONSTRAINT "plans_amount" CHECK ("plans"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"finance_threshold_cents" bigint NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	CONSTRAINT "teams_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "role" NOT NULL,
	"team_id" integer,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_team_by_role" CHECK (("users"."role" in ('champion','delegate')) = ("users"."team_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_request_id_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_line_item_id_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_line_item_id_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_requests_requester_idx" ON "approval_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "approval_steps_request_idx" ON "approval_steps" USING btree ("request_id","seq");--> statement-breakpoint
CREATE INDEX "approval_steps_approver_idx" ON "approval_steps" USING btree ("approver_id");--> statement-breakpoint
CREATE INDEX "expenses_team_month_idx" ON "expenses" USING btree ("team_id","fiscal_month");--> statement-breakpoint
CREATE INDEX "expenses_line_item_idx" ON "expenses" USING btree ("line_item_id");--> statement-breakpoint
CREATE INDEX "expenses_created_by_idx" ON "expenses" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "line_items_team_idx" ON "line_items" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "users_team_idx" ON "users" USING btree ("team_id");