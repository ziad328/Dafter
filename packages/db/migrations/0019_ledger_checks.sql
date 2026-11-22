CREATE TABLE "ledger_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cutoff" timestamp with time zone NOT NULL,
	"entry_count" integer NOT NULL,
	"sum_piastres" bigint NOT NULL,
	"problems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_checks" ADD CONSTRAINT "ledger_checks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_checks_workspace_idx" ON "ledger_checks" USING btree ("workspace_id","cutoff");--> statement-breakpoint
ALTER TABLE ledger_checks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON ledger_checks USING (workspace_id = app_workspace_id());--> statement-breakpoint
-- Append-only, like the ledger it checks.
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_checks FROM dafter_app;
