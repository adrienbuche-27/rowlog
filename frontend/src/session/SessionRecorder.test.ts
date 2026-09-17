import { describe, expect, it } from 'vitest'
import { CumulativeCounter } from './CumulativeCounter'
import { SessionRecorder } from './SessionRecorder'

describe('CumulativeCounter', () => {
  it('counts from the first reading', () => {
    const c = new CumulativeCounter()
    c.update(1000)
    c.update(1010)
    expect(c.value).toBe(10)
  })

  it('survives a monitor reset', () => {
    const c = new CumulativeCounter()
    c.update(100)
    c.update(600) // 500 m
    c.update(0) // reset
    c.update(50)
    expect(c.value).toBe(550)
  })

  it('rebase keeps the value and adopts a new baseline', () => {
    const c = new CumulativeCounter()
    c.update(0)
    c.update(300)
    c.rebase()
    c.update(9000) // new baseline, e.g. restored session on a monitor showing other numbers
    c.update(9100)
    expect(c.value).toBe(400)
  })
})

function row(r: SessionRecorder, now: number, distance: number, strokes: number) {
  r.ingest({ strokeRate: 24, strokeCount: strokes, totalDistance: distance, instantPace: 120, instantPower: 200 }, now)
}

describe('SessionRecorder', () => {
  it('starts on the first stroke when armed and counts that stroke', () => {
    const r = new SessionRecorder()
    r.arm()
    row(r, 0, 250, 10) // baseline seen before rowing
    expect(r.status).toBe('armed')
    row(r, 1000, 254, 11)
    expect(r.status).toBe('recording')
    expect(r.snapshot(1000).distance).toBe(4)
  })

  it('records one sample per second and fills throttled gaps', () => {
    const r = new SessionRecorder()
    r.start(0)
    row(r, 0, 0, 0) // first packet after a manual start is the baseline
    for (let s = 1; s <= 3; s++) {
      row(r, s * 1000, s * 4, s)
      r.tick(s * 1000)
    }
    row(r, 6000, 24, 6)
    r.tick(6000) // timer skipped seconds 4 and 5
    expect(r.samples.map((s) => s.t)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(r.samples[6].distance).toBe(24)
  })

  it('excludes paused time and ignores distance rowed while paused', () => {
    const r = new SessionRecorder()
    r.start(0)
    row(r, 0, 0, 0)
    row(r, 10_000, 40, 4)
    r.pause(10_000)
    row(r, 20_000, 80, 8) // rowing while paused
    r.resume(30_000)
    row(r, 30_500, 80, 8) // first packet after resume becomes the baseline
    row(r, 40_000, 120, 12)
    r.tick(40_000)
    expect(r.elapsedMs(40_000)).toBe(20_000)
    expect(r.snapshot(40_000).distance).toBe(80)
  })

  it('marks samples as disconnected when data goes stale', () => {
    const r = new SessionRecorder()
    r.start(0)
    row(r, 0, 0, 0)
    r.tick(1000)
    r.tick(10_000) // no data for 10 s
    const last = r.samples[r.samples.length - 1]
    expect(last.connected).toBe(false)
    expect(last.pace).toBeNull()
    expect(r.samples[1].connected).toBe(true)
  })

  it('keeps distance across a reconnection to a reset monitor', () => {
    const r = new SessionRecorder()
    r.start(0)
    row(r, 0, 1000, 50)
    row(r, 60_000, 1250, 74)
    r.setLinkUp(false)
    row(r, 70_000, 0, 0) // monitor restarted from zero
    row(r, 80_000, 40, 4)
    expect(r.snapshot(80_000).distance).toBe(290)
    expect(r.snapshot(80_000).strokes).toBe(28)
  })

  it('serializes and restores as paused', () => {
    const r = new SessionRecorder()
    r.start(0)
    row(r, 0, 0, 0)
    row(r, 5000, 20, 2)
    r.tick(5000)
    const restored = SessionRecorder.restore(r.serialize(5000))
    expect(restored.status).toBe('paused')
    expect(restored.samples).toHaveLength(6)
    restored.resume(100_000)
    row(restored, 100_000, 5000, 100) // different monitor reading after reload
    row(restored, 101_000, 5004, 101)
    expect(restored.snapshot(101_000).distance).toBe(24)
    expect(restored.elapsedMs(101_000)).toBe(6000)
  })

  it('builds the API payload', () => {
    const r = new SessionRecorder()
    r.start(Date.UTC(2026, 8, 17, 7, 0))
    const payload = r.toPayload('Intervals')
    expect(payload.started_at).toBe('2026-09-17T07:00:00.000Z')
    expect(payload.samples).toHaveLength(1)
    expect(payload.notes).toBe('Intervals')
  })
})
