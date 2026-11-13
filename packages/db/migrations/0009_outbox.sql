CREATE TYPE "public"."outbox_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "outbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "outbox_status" DEFAULT 'queued' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"send_after" timestamp with time zone NOT NULL,
	"locale" "locale",
	"body" text,
	"provider_message_id" text,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_messages_dedupe_key" UNIQUE("workspace_id","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_guardian_fk" FOREIGN KEY ("workspace_id","guardian_id") REFERENCES "public"."guardians"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_messages_due_idx" ON "outbox_messages" USING btree ("send_after") WHERE "outbox_messages"."status" = 'queued';--> statement-breakpoint
ALTER TABLE outbox_messages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON outbox_messages USING (workspace_id = app_workspace_id());--> statement-breakpoint
-- Quiet hours (22:00 to 08:00 in the workspace timezone): the next 08:00, else `at` itself.
CREATE FUNCTION quiet_hours_send_after(at timestamptz, zone text) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  select case
    when (at at time zone zone)::time >= time '22:00'
      then ((at at time zone zone)::date + 1 + time '08:00') at time zone zone
    when (at at time zone zone)::time < time '08:00'
      then ((at at time zone zone)::date + time '08:00') at time zone zone
    else at
  end
$$;
