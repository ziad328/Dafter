import { useState, type FormEvent } from 'react';
import { DoorOpen, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  type Room,
  useCreateRoomMutation,
  useGetCurrentWorkspaceQuery,
  useListRoomsQuery,
  useUpdateRoomMutation,
} from '@/api/generated';
import { Field, FormError, Skeleton } from '@/components/Field';
import { PageHeader, Sheet } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { errorKey } from '@/lib/session';

/** "" = no capacity; anything else must be a whole number from 1 to 1000. */
const toCapacity = (v: string) => (v.trim() === '' ? null : Number(v));
const capacityOk = (c: number | null) => c === null || (Number.isInteger(c) && c >= 1 && c <= 1000);

/** The center's rooms: everyone sees where groups meet; the owner adds, renames and archives. */
export default function Rooms() {
  const { t } = useTranslation();
  const isOwner = useGetCurrentWorkspaceQuery().data?.role === 'owner';
  const rooms = useListRoomsQuery();
  const [adding, setAdding] = useState(false);
  if (rooms.isLoading) return <Skeleton />;
  if (rooms.error) return <FormError message={t(errorKey(rooms.error))} />;

  return (
    <div className="grid gap-5">
      {/* Adding waits behind a button, so the list opens first (audit 3 R3, R4). */}
      <PageHeader
        title={t('rooms.title')}
        action={
          isOwner && (
            <Button onClick={() => setAdding(true)}>
              <Plus aria-hidden />
              {t('rooms.add')}
            </Button>
          )
        }
      />
      <Sheet open={adding} onClose={() => setAdding(false)} title={t('rooms.add')}>
        <p className="mb-3 text-sm text-muted-foreground">{t('rooms.subtitle')}</p>
        <RoomForm bare onDone={() => setAdding(false)} />
      </Sheet>
      <Card>
        <CardContent className="p-0">
          {rooms.data!.length === 0 ? (
            <p className="p-4 text-muted-foreground">{t('rooms.empty')}</p>
          ) : (
            <ul className="divide-y" aria-label={t('rooms.title')}>
              {rooms.data!.map((r) => (
                <RoomRow key={r.id} room={r} canEdit={isOwner} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** New room, or (with `room`) rename one and change its capacity. */
function RoomForm({
  room,
  onDone,
  bare,
}: {
  room?: Room;
  onDone?: () => void;
  /** Inside a sheet: no card of its own. */
  bare?: boolean;
}) {
  const { t } = useTranslation();
  const [create, created] = useCreateRoomMutation();
  const [update, updated] = useUpdateRoomMutation();
  const [name, setName] = useState(room?.name ?? '');
  const [capacity, setCapacity] = useState(room?.capacity?.toString() ?? '');
  const [invalid, setInvalid] = useState(false);
  const error = room ? updated.error : created.error;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { name: name.trim(), capacity: toCapacity(capacity) };
    if (!body.name || !capacityOk(body.capacity)) return setInvalid(true);
    setInvalid(false);
    const res = room
      ? await update({ id: room.id, updateRoomRequest: body })
      : await create({ createRoomRequest: body });
    if (res.error) return;
    setName('');
    setCapacity('');
    onDone?.();
  };

  const form = (
    <form onSubmit={submit} noValidate>
      <div className={bare ? 'grid gap-3' : 'grid gap-3 p-4'}>
        <Field
          label={t('rooms.name')}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label={`${t('groups.capacity')} ${t('form.optional')}`}
          type="number"
          inputMode="numeric"
          dir="ltr"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
        <FormError
          message={invalid ? t('rooms.invalid') : error ? t(errorKey(error)) : undefined}
        />
        <Button type="submit" disabled={created.isLoading || updated.isLoading}>
          {t(room ? 'rooms.save' : 'rooms.add')}
        </Button>
      </div>
    </form>
  );
  return bare ? form : <Card>{form}</Card>;
}

function RoomRow({ room, canEdit }: { room: Room; canEdit: boolean }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [update, updated] = useUpdateRoomMutation();
  const archived = room.status === 'archived';
  if (editing)
    return (
      <li className="p-2">
        <RoomForm room={room} onDone={() => setEditing(false)} />
      </li>
    );

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <DoorOpen className="size-5 shrink-0 text-ink" aria-hidden />
      <div className="grid min-w-0 flex-1">
        <span className="truncate font-medium">{room.name}</span>
        <span className="text-sm text-muted-foreground">
          {room.capacity === null ? (
            t('rooms.noCapacity')
          ) : (
            <bdi>{t('rooms.seats', { count: room.capacity })}</bdi>
          )}
          {archived && ` · ${t('rooms.archived')}`}
        </span>
      </div>
      {canEdit && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {t('rooms.edit')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={updated.isLoading}
            onClick={() =>
              void update({
                id: room.id,
                updateRoomRequest: { status: archived ? 'active' : 'archived' },
              })
            }
          >
            {t(archived ? 'rooms.restore' : 'rooms.archive')}
          </Button>
        </div>
      )}
      {updated.error && <FormError message={t(errorKey(updated.error))} />}
    </li>
  );
}
