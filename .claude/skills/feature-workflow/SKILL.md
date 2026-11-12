---
name: feature-workflow
description: Use when building or changing any Dafter feature or API endpoint end to end (contract, database, API, screen, tests). Defines the order of work.
---
1. Read only the relevant section of the matching docs/ file.
2. Contract: add or extend Zod schemas in packages/contracts (request, response, error codes). Run `pnpm contracts:gen` to emit OpenAPI and regenerate the RTK Query client.
3. Database change? Follow the db-migration skill.
4. API: follow the nestjs-module skill.
5. Tests: unit for logic, integration for the endpoint, and the tenant-isolation skill.
6. Web: follow the react-screen and i18n-rtl skills.
7. User flow? Add or extend a Playwright test (testing skill).
8. Hard part? Follow the hard-part-coach skill.
9. Narrowest tests, then `pnpm test`, then the task-finish skill.
