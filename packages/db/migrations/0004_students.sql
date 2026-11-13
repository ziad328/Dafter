CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."guardian_relation" AS ENUM('father', 'mother', 'other');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text,
	"phone" text NOT NULL,
	"relation" "guardian_relation" DEFAULT 'other' NOT NULL,
	"preferred_locale" "locale" DEFAULT 'ar' NOT NULL,
	"whatsapp_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_workspace_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "guardians_workspace_phone_key" UNIQUE("workspace_id","phone")
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"workspace_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "student_guardians_workspace_id_student_id_guardian_id_pk" PRIMARY KEY("workspace_id","student_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"phone" text,
	"grade_level_id" uuid NOT NULL,
	"school" text,
	"user_id" uuid,
	"name_search" text NOT NULL,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_workspace_id_key" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_fk" FOREIGN KEY ("workspace_id","student_id") REFERENCES "public"."students"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_fk" FOREIGN KEY ("workspace_id","guardian_id") REFERENCES "public"."guardians"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_grade_level_fk" FOREIGN KEY ("workspace_id","grade_level_id") REFERENCES "public"."grade_levels"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_guardians_guardian_idx" ON "student_guardians" USING btree ("workspace_id","guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_guardians_one_primary_key" ON "student_guardians" USING btree ("workspace_id","student_id") WHERE "student_guardians"."is_primary";--> statement-breakpoint
CREATE INDEX "students_workspace_phone_idx" ON "students" USING btree ("workspace_id","phone");--> statement-breakpoint
CREATE INDEX "students_name_search_idx" ON "students" USING gin ("name_search" gin_trgm_ops);--> statement-breakpoint
-- RLS (dafter_app grants come from the default privileges in 0001).
ALTER TABLE students ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON students USING (workspace_id = app_workspace_id());--> statement-breakpoint
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON guardians USING (workspace_id = app_workspace_id());--> statement-breakpoint
ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON student_guardians USING (workspace_id = app_workspace_id());