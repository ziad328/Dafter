---
name: nestjs-module
description: Use when creating or editing anything in apps/api - modules, controllers, services, repositories, guards, validation, error handling.
---
- One folder per module: x.module.ts, x.controller.ts, x.service.ts, x.repository.ts, x.service.spec.ts, x.int.spec.ts.
- Controllers are thin: validate with the Zod schema from packages/contracts (nestjs-zod), call the service, nothing else.
- Services hold business rules. Inject Clock; never call new Date().
- Repositories extend TenantRepository; workspace_id always comes from the request context. Services never touch db directly.
- Errors: throw AppError(code, details) with a code from packages/contracts. Never message strings.
- Retryable writes use the shared Idempotency-Key interceptor.
- Writes are audited by the audit interceptor; do not log audits by hand.
- Permissions: the module's policy function decides owner, teacher and assistant scope.
