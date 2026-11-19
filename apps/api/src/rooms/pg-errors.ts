import type { ErrorCode } from '@dafter/contracts';
import { AppError } from '../errors.js';

/**
 * The exclusion constraint `sessions_room_no_overlap` as ROOM_BOOKED; other errors pass through.
 * It fires when the API's own slot check could not see the clash (a moved session, or two saves
 * at the same moment).
 */
export const roomBooked = (err: unknown) =>
  rethrow(err, '23P01', 'sessions_room_no_overlap', 'ROOM_BOOKED');

/** A second room with the same name in the workspace. */
export const roomNameTaken = (err: unknown) =>
  rethrow(err, '23505', 'rooms_workspace_name_key', 'ROOM_NAME_TAKEN');

/** A second subject or grade level with the same Arabic name in the workspace. */
export const curriculumNameTaken = (err: unknown) =>
  rethrow(err, '23505', /^(subjects|grade_levels)_workspace_name_ar_key$/, 'CURRICULUM_NAME_TAKEN');

function rethrow(err: unknown, code: string, constraint: string | RegExp, as: ErrorCode): never {
  // Drizzle wraps the pg error in `cause`.
  const pg = ((err as { cause?: unknown }).cause ?? err) as { code?: string; constraint?: string };
  const matches =
    typeof constraint === 'string'
      ? pg.constraint === constraint
      : constraint.test(pg.constraint ?? '');
  if (pg.code === code && matches) throw new AppError(as);
  throw err;
}
