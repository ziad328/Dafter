CREATE TYPE "public"."group_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "grade_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"sort_order" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grade_levels_workspace_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "group_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "group_slots_weekday_check" CHECK ("group_slots"."weekday" between 0 and 6),
	CONSTRAINT "group_slots_time_check" CHECK ("group_slots"."end_time" > "group_slots"."start_time")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"teacher_membership_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"grade_level_id" uuid NOT NULL,
	"capacity" integer,
	"status" "group_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_workspace_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "groups_capacity_check" CHECK ("groups"."capacity" is null or "groups"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"sort_order" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_workspace_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "grade_levels" ADD CONSTRAINT "grade_levels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_slots" ADD CONSTRAINT "group_slots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_slots" ADD CONSTRAINT "group_slots_group_fk" FOREIGN KEY ("workspace_id","group_id") REFERENCES "public"."groups"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_teacher_fk" FOREIGN KEY ("workspace_id","teacher_membership_id") REFERENCES "public"."memberships"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_subject_fk" FOREIGN KEY ("workspace_id","subject_id") REFERENCES "public"."subjects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_grade_level_fk" FOREIGN KEY ("workspace_id","grade_level_id") REFERENCES "public"."grade_levels"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grade_levels_workspace_sort_idx" ON "grade_levels" USING btree ("workspace_id","sort_order");--> statement-breakpoint
CREATE INDEX "group_slots_workspace_group_idx" ON "group_slots" USING btree ("workspace_id","group_id");--> statement-breakpoint
CREATE INDEX "groups_workspace_teacher_idx" ON "groups" USING btree ("workspace_id","teacher_membership_id");--> statement-breakpoint
CREATE INDEX "subjects_workspace_sort_idx" ON "subjects" USING btree ("workspace_id","sort_order");--> statement-breakpoint
-- RLS for the teaching tables (dafter_app's grants come from the default privileges in 0001).
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON subjects USING (workspace_id = app_workspace_id());--> statement-breakpoint
ALTER TABLE grade_levels ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON grade_levels USING (workspace_id = app_workspace_id());--> statement-breakpoint
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON groups USING (workspace_id = app_workspace_id());--> statement-breakpoint
ALTER TABLE group_slots ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON group_slots USING (workspace_id = app_workspace_id());
