---
name: testing
description: Use when writing, running or fixing tests - Vitest unit and integration with Testcontainers, Playwright end-to-end - or when any test fails.
---
- Run the narrowest test first (`pnpm --filter <package> vitest run <file>`); run `pnpm test` once at the end.
- Integration tests use the template-database harness; no shared state between tests.
- Build data with the factories in packages/db; no hand-written inserts.
- Time-dependent logic freezes Clock.
- Playwright runs each user flow in Arabic and English and selects by role or label, never by CSS class.
- Fix failing tests in the code, not by weakening assertions. If the test itself is wrong, say why before changing it.
