ALTER TABLE "grade_levels" ADD COLUMN "status" "group_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "status" "group_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "grade_levels" ADD CONSTRAINT "grade_levels_workspace_name_ar_key" UNIQUE("workspace_id","name_ar");--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_workspace_name_ar_key" UNIQUE("workspace_id","name_ar");