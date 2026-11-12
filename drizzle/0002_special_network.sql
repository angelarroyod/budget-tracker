CREATE TABLE "month_closes" (
	"fiscal_month" smallint PRIMARY KEY NOT NULL,
	"closed_by" integer NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "month_closes_month" CHECK ("month_closes"."fiscal_month" between 1 and 12)
);
--> statement-breakpoint
ALTER TABLE "recon_items" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "recon_items" ADD COLUMN "resolved_by" integer;--> statement-breakpoint
ALTER TABLE "recon_items" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "month_closes" ADD CONSTRAINT "month_closes_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recon_items" ADD CONSTRAINT "recon_items_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recon_items" ADD CONSTRAINT "recon_items_resolution" CHECK (("recon_items"."resolution" is null) = ("recon_items"."resolved_by" is null) and ("recon_items"."resolution" is null) = ("recon_items"."resolved_at" is null)
        and ("recon_items"."resolution" is null or "recon_items"."kind" <> 'matched'));