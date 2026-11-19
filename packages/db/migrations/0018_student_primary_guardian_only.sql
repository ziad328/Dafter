ALTER TABLE "students" ADD COLUMN "primary_guardian_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The center-wide switch (settings.messages.primaryOnly) becomes each student's own setting:
-- every student of a center that had it on keeps the same behaviour.
UPDATE "students" s SET "primary_guardian_only" = true
FROM "workspaces" w
WHERE w.id = s.workspace_id AND coalesce((w.settings->'messages'->>'primaryOnly')::boolean, false);
