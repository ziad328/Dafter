import type { Db } from '@dafter/db';
import type { Clock } from '../clock.js';
import { generateSessions } from '../sessions/generate.js';
import { forEachWorkspace } from './for-each-workspace.js';

export const GENERATE_SESSIONS = 'generate-sessions';

/** Tops every workspace up to 4 weeks of sessions; one RLS-bound transaction per workspace. */
export const generateAllSessions = (db: Db, clock: Clock) =>
  forEachWorkspace(db, GENERATE_SESSIONS, (tx, id) => generateSessions(tx, id, clock.now()));
