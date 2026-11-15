CREATE TYPE "public"."member_status" AS ENUM('active', 'removed');--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "teacher_membership_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "status" "member_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "removed_at" timestamp with time zone;