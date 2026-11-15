CREATE TABLE "exam_results" (
	"workspace_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"score" integer,
	"absent" boolean DEFAULT false NOT NULL,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "exam_results_workspace_id_exam_id_student_id_pk" PRIMARY KEY("workspace_id","exam_id","student_id"),
	CONSTRAINT "exam_results_score_or_absent" CHECK (("exam_results"."absent" and "exam_results"."score" is null) or (not "exam_results"."absent" and "exam_results"."score" >= 0))
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"title" text NOT NULL,
	"held_on" date NOT NULL,
	"max_score" integer NOT NULL,
	"notified_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exams_workspace_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "exams_max_score_check" CHECK ("exams"."max_score" > 0)
);
--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_exam_fk" FOREIGN KEY ("workspace_id","exam_id") REFERENCES "public"."exams"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_student_fk" FOREIGN KEY ("workspace_id","student_id") REFERENCES "public"."students"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_group_fk" FOREIGN KEY ("workspace_id","group_id") REFERENCES "public"."groups"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_results_student_idx" ON "exam_results" USING btree ("workspace_id","student_id");--> statement-breakpoint
CREATE INDEX "exams_group_idx" ON "exams" USING btree ("workspace_id","group_id","held_on");--> statement-breakpoint
-- RLS (dafter_app grants come from the default privileges in 0001).
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON exams USING (workspace_id = app_workspace_id());--> statement-breakpoint
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON exam_results USING (workspace_id = app_workspace_id());
