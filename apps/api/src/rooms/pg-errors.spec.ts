import { describe, expect, it } from 'vitest';
import { AppError } from '../errors.js';
import { roomBooked, roomNameTaken } from './pg-errors.js';

describe('room pg errors', () => {
  it('maps their own constraint, wrapped by Drizzle or not, and passes the rest through', () => {
    const overlap = { code: '23P01', constraint: 'sessions_room_no_overlap' };
    expect(() => roomBooked({ cause: overlap })).toThrow(new AppError('ROOM_BOOKED'));
    expect(() => roomNameTaken({ code: '23505', constraint: 'rooms_workspace_name_key' })).toThrow(
      new AppError('ROOM_NAME_TAKEN'),
    );
    const other = new Error('boom');
    expect(() => roomBooked(other)).toThrow(other);
    expect(() => roomNameTaken({ code: '23505', constraint: 'users_phone_unique' })).toThrow(
      expect.objectContaining({ constraint: 'users_phone_unique' }),
    );
  });
});
