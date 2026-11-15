import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { CreateRoomRequest, Room, UpdateRoomRequest } from '@dafter/contracts';
import { rooms } from '@dafter/db';
import { TenantRepository } from '../tenant.repository.js';

const columns = { id: rooms.id, name: rooms.name, capacity: rooms.capacity, status: rooms.status };

@Injectable()
export class RoomsRepository extends TenantRepository {
  list(workspaceId: string): Promise<Room[]> {
    return this.inTenant(workspaceId, (tx) =>
      tx
        .select(columns)
        .from(rooms)
        .where(eq(rooms.workspaceId, workspaceId))
        .orderBy(asc(rooms.status), asc(rooms.name)),
    );
  }

  async create(workspaceId: string, body: CreateRoomRequest): Promise<Room> {
    const [row] = await this.inTenant(workspaceId, (tx) =>
      tx
        .insert(rooms)
        .values({ workspaceId, name: body.name, capacity: body.capacity ?? null })
        .returning(columns),
    );
    return row!;
  }

  async update(workspaceId: string, id: string, patch: UpdateRoomRequest) {
    const where = and(eq(rooms.workspaceId, workspaceId), eq(rooms.id, id));
    const [row] = await this.inTenant(workspaceId, (tx) =>
      // An empty patch changes nothing: return the room as it is.
      Object.keys(patch).length
        ? tx.update(rooms).set(patch).where(where).returning(columns)
        : tx.select(columns).from(rooms).where(where),
    );
    return row as Room | undefined;
  }
}
