CREATE TYPE "public"."attendance_method" AS ENUM('student_scan', 'manual', 'auto_close');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'late', 'absent', 'excused', 'makeup');--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"method" "attendance_method" NOT NULL,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone NOT NULL,
	"device_id" uuid,
	"qr_window" bigint,
	CONSTRAINT "attendance_records_session_student_key" UNIQUE("workspace_id","session_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_device_id_student_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."student_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_fk" FOREIGN KEY ("workspace_id","session_id") REFERENCES "public"."sessions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_fk" FOREIGN KEY ("workspace_id","student_id") REFERENCES "public"."students"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_records_student_idx" ON "attendance_records" USING btree ("workspace_id","student_id");--> statement-breakpoint
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON attendance_records USING (workspace_id = app_workspace_id());
