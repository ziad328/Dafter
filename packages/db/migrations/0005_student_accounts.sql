CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'left');--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"discount_pct" smallint DEFAULT 0 NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "enrollments_workspace_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "enrollments_discount_pct" CHECK ("enrollments"."discount_pct" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"destination" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"label" text,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid
);
--> statement-breakpoint
CREATE TABLE "student_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_fk" FOREIGN KEY ("workspace_id","student_id") REFERENCES "public"."students"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_group_fk" FOREIGN KEY ("workspace_id","group_id") REFERENCES "public"."groups"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_devices" ADD CONSTRAINT "student_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_devices" ADD CONSTRAINT "student_devices_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_invites" ADD CONSTRAINT "student_invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_invites" ADD CONSTRAINT "student_invites_student_fk" FOREIGN KEY ("workspace_id","student_id") REFERENCES "public"."students"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_one_active_key" ON "enrollments" USING btree ("workspace_id","student_id","group_id") WHERE "enrollments"."status" = 'active';--> statement-breakpoint
CREATE INDEX "enrollments_group_idx" ON "enrollments" USING btree ("workspace_id","group_id");--> statement-breakpoint
CREATE INDEX "otp_codes_destination_idx" ON "otp_codes" USING btree ("destination","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_devices_one_active_per_user" ON "student_devices" USING btree ("user_id") WHERE "student_devices"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "student_devices_one_active_per_key" ON "student_devices" USING btree ("public_key") WHERE "student_devices"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "student_invites_student_idx" ON "student_invites" USING btree ("workspace_id","student_id");--> statement-breakpoint
-- RLS on the tenant tables. otp_codes and student_devices are identity tables (no workspace).
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON enrollments USING (workspace_id = app_workspace_id());--> statement-breakpoint
ALTER TABLE student_invites ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON student_invites USING (workspace_id = app_workspace_id());
