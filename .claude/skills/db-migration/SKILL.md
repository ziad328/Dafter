---
name: db-migration
description: Use when changing the database schema in packages/db - tables, columns, indexes, RLS policies, seed data, factories.
---
- Edit the Drizzle schema. Tenant tables get workspace_id uuid not null with a foreign key.
- Indexes are composite and start with workspace_id. Names use a trigram GIN index on name_search.
- Same migration: enable RLS and add a policy on current_setting('app.workspace_id')::uuid.
- Money columns are bigint named *_piastres. Timestamps are timestamptz.
- Run `pnpm db:generate`, read the SQL, run `pnpm db:reset`, run integration tests.
- Migrations are backward compatible (add first, remove later). Never edit an applied migration.
- Update the seed and the test factories.
