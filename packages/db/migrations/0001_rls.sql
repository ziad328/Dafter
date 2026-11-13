-- Row-level security: the backstop behind the tenant-scoped repository.
-- The API connects as the table owner (RLS does not apply to it) and runs every tenant
-- transaction as dafter_app via SET LOCAL ROLE, with app.workspace_id set by set_config(..., true).
-- dafter_app has no login and no BYPASSRLS, so the policies below always apply to it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dafter_app') THEN
    CREATE ROLE dafter_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
-- PG16+: a CREATEROLE owner (Neon) is not allowed SET ROLE to roles it creates unless granted SET.
GRANT dafter_app TO CURRENT_USER WITH SET TRUE;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO dafter_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dafter_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dafter_app;
--> statement-breakpoint
-- Unset (or reset to '' at the end of a transaction) means no workspace: NULL matches no row.
CREATE FUNCTION app_workspace_id() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.workspace_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_workspace_id() TO dafter_app;
--> statement-breakpoint
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON workspaces USING (id = app_workspace_id());
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships USING (workspace_id = app_workspace_id());
--> statement-breakpoint
ALTER TABLE assistant_scopes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON assistant_scopes USING (workspace_id = app_workspace_id());
--> statement-breakpoint
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON invites USING (workspace_id = app_workspace_id());
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_log USING (workspace_id = app_workspace_id());
