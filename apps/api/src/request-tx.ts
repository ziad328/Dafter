import { AsyncLocalStorage } from 'node:async_hooks';
import type { Tx } from '@dafter/db';

/**
 * The transaction of the tenant write request being handled (opened by AuditInterceptor). Every
 * `inTenant` for the same workspace runs inside it as a savepoint, so the audit row commits or
 * rolls back with the write it records. `after` holds work that must wait for the commit (the
 * inline outbox flush reads the rows the request wrote). Rule: a write handler awaits its
 * repository calls one after another, never in parallel (`Promise.all`): savepoints share the
 * request's one connection.
 */
export type RequestTx = { workspaceId: string; tx: Tx; after: (() => Promise<void>)[] };

export const requestTx = new AsyncLocalStorage<RequestTx>();
