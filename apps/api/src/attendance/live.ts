import { Injectable } from '@nestjs/common';
import { filter, map, type Observable, Subject } from 'rxjs';
import type { AttendanceRecord } from '@dafter/contracts';

/**
 * Pushes attendance changes to open teacher screens.
 * shortcut: in-process only, so it needs a single API process (the free tier runs one); with
 * several, publish through PostgreSQL LISTEN/NOTIFY instead.
 */
@Injectable()
export class LiveAttendance {
  private readonly changes = new Subject<{ sessionId: string; record: AttendanceRecord }>();

  publish(sessionId: string, records: AttendanceRecord[]) {
    for (const record of records) this.changes.next({ sessionId, record });
  }

  of(sessionId: string): Observable<AttendanceRecord> {
    return this.changes.pipe(
      filter((c) => c.sessionId === sessionId),
      map((c) => c.record),
    );
  }
}
