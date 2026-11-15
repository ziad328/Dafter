CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" integer,
	"status" "group_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_workspace_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "rooms_workspace_name_key" UNIQUE("workspace_id","name"),
	CONSTRAINT "rooms_capacity_check" CHECK ("rooms"."capacity" is null or "rooms"."capacity" > 0)
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_room_fk" FOREIGN KEY ("workspace_id","room_id") REFERENCES "public"."rooms"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_room_fk" FOREIGN KEY ("workspace_id","room_id") REFERENCES "public"."rooms"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Two non-cancelled sessions never overlap in one room, even under concurrent writes. Ranges are
-- [start, end), so 16:00-17:30 and 17:30-19:00 can share a room. Hand-written: Drizzle has no EXCLUDE.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_room_no_overlap" EXCLUDE USING gist ("workspace_id" WITH =, "room_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&) WHERE ("room_id" IS NOT NULL AND "status" <> 'cancelled');--> statement-breakpoint
-- RLS (dafter_app grants come from the default privileges in 0001).
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON rooms USING (workspace_id = app_workspace_id());
