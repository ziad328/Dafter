/** The only place that reads the system time; tests swap in FakeClock. */
export class Clock {
  now(): Date {
    return new Date();
  }
}

export class FakeClock extends Clock {
  constructor(private time = new Date('2026-11-16T08:00:00Z')) {
    super();
  }
  override now() {
    return new Date(this.time);
  }
  advance(ms: number) {
    this.time = new Date(this.time.getTime() + ms);
  }
}
