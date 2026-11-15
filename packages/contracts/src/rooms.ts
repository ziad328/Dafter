import * as z from 'zod';

const name = z.string().trim().min(1).max(40);
const capacity = z.int().min(1).max(1000).nullable();

/** The room a group meets in, as shown on groups and sessions. */
export const roomRef = z.object({ id: z.uuid(), name: z.string() }).meta({ id: 'RoomRef' });

export const room = z
  .object({
    id: z.uuid(),
    name: z.string(),
    capacity: z.int().nullable(),
    status: z.enum(['active', 'archived']),
  })
  .meta({ id: 'Room' });

export const roomList = z.array(room).meta({ id: 'RoomList' });

export const createRoomRequest = z
  .object({ name, capacity: capacity.optional() })
  .meta({ id: 'CreateRoomRequest' });

/** An archived room stays on past sessions and on its groups, but can't be picked again. */
export const updateRoomRequest = z
  .object({ name, capacity, status: z.enum(['active', 'archived']) })
  .partial()
  .meta({ id: 'UpdateRoomRequest' });

export type RoomRef = z.infer<typeof roomRef>;
export type Room = z.infer<typeof room>;
export type CreateRoomRequest = z.infer<typeof createRoomRequest>;
export type UpdateRoomRequest = z.infer<typeof updateRoomRequest>;
