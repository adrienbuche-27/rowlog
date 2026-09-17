/**
 * Turns a device counter (distance, strokes, energy) into a session counter that never
 * goes backwards, even if the monitor resets or the app reconnects mid-workout.
 *
 * value = raw - base + offset
 *  - base is the raw reading when counting (re)started
 *  - offset is what was accumulated before that
 */
export class CumulativeCounter {
  value = 0
  private base: number | undefined
  private offset = 0
  private last: number | undefined

  constructor(private readonly resetTolerance = 1) {}

  /** Start counting from a known raw reading (e.g. the value seen before the first stroke). */
  begin(raw: number): void {
    this.base = raw
    this.last = raw
  }

  update(raw: number): number {
    if (this.base === undefined) {
      this.base = raw
    } else if (this.last !== undefined && raw < this.last - this.resetTolerance) {
      // Monitor reset (or reconnection to a monitor that restarted from zero).
      this.offset = this.value
      this.base = 0
    }
    this.last = raw
    this.value = Math.max(this.offset, raw - this.base + this.offset)
    return this.value
  }

  /**
   * Keep the accumulated value but forget the raw baseline. The next reading becomes the new
   * baseline. Used on resume after a pause and when restoring a session after a reload.
   */
  rebase(): void {
    this.offset = this.value
    this.base = undefined
    this.last = undefined
  }

  static fromValue(value: number): CumulativeCounter {
    const c = new CumulativeCounter()
    c.value = value
    c.rebase()
    return c
  }
}
