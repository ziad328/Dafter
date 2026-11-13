CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'open', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"slot_starts_at" timestamp with time zone NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "session_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_workspace_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "sessions_group_slot_key" UNIQUE("workspace_id","group_id","slot_starts_at"),
	CONSTRAINT "sessions_time_check" CHECK ("sessions"."ends_at" > "sessions"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_group_fk" FOREIGN KEY ("workspace_id","group_id") REFERENCES "public"."groups"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_workspace_starts_idx" ON "sessions" USING btree ("workspace_id","starts_at");--> statement-breakpoint
-- RLS (dafter_app grants come from the default privileges in 0001).
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON sessions USING (workspace_id = app_workspace_id());