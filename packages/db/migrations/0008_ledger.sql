CREATE TYPE "public"."ledger_entry_type" AS ENUM('charge', 'payment', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'vodafone_cash', 'instapay');--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"type" "ledger_entry_type" NOT NULL,
	"amount_piastres" bigint NOT NULL,
	"method" "payment_method",
	"receipt_no" integer,
	"enrollment_id" uuid,
	"period" text,
	"reverses_entry_id" uuid,
	"note" text,
	"idempotency_key" text,
	"request_hash" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_workspace_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "ledger_entries_idempotency_key" UNIQUE("workspace_id","idempotency_key"),
	CONSTRAINT "ledger_entries_reverses_key" UNIQUE("workspace_id","reverses_entry_id"),
	CONSTRAINT "ledger_entries_receipt_key" UNIQUE("workspace_id","receipt_no"),
	CONSTRAINT "ledger_entries_sign" CHECK (("ledger_entries"."type" = 'charge' and "ledger_entries"."amount_piastres" > 0) or ("ledger_entries"."type" = 'payment' and "ledger_entries"."amount_piastres" < 0) or ("ledger_entries"."type" = 'reversal' and "ledger_entries"."reverses_entry_id" is not null)),
	CONSTRAINT "ledger_entries_payment_fields" CHECK ("ledger_entries"."type" <> 'payment' or ("ledger_entries"."method" is not null and "ledger_entries"."receipt_no" is not null))
);
--> statement-breakpoint
CREATE TABLE "receipt_counters" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"last" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "monthly_fee_piastres" integer;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_student_fk" FOREIGN KEY ("workspace_id","student_id") REFERENCES "public"."students"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_group_fk" FOREIGN KEY ("workspace_id","group_id") REFERENCES "public"."groups"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_enrollment_fk" FOREIGN KEY ("workspace_id","enrollment_id") REFERENCES "public"."enrollments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reverses_fk" FOREIGN KEY ("workspace_id","reverses_entry_id") REFERENCES "public"."ledger_entries"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_counters" ADD CONSTRAINT "receipt_counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_monthly_charge_key" ON "ledger_entries" USING btree ("workspace_id","student_id","group_id","period") WHERE "ledger_entries"."type" = 'charge' and "ledger_entries"."period" is not null;--> statement-breakpoint
CREATE INDEX "ledger_entries_student_idx" ON "ledger_entries" USING btree ("workspace_id","student_id","created_at");--> statement-breakpoint
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON ledger_entries USING (workspace_id = app_workspace_id());--> statement-breakpoint
ALTER TABLE receipt_counters ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON receipt_counters USING (workspace_id = app_workspace_id());--> statement-breakpoint
-- Append-only: the app role can add entries, never change or remove them (fix with a reversal).
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries FROM dafter_app;
