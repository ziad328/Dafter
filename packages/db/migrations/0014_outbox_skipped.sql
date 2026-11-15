ALTER TYPE "public"."outbox_status" ADD VALUE 'skipped';--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "skip_reason" text;