import { describe, expect, it } from 'vitest'
import type { PlanPiece } from '../api/types'
import { IntervalRunner } from './IntervalRunner'

const distance = (target: number, rest_s = 0): PlanPiece => ({ kind: 'distance', target, rest_s })
const time = (target: number, rest_s = 0): PlanPiece => ({ kind: 'time', target, rest_s })

describe('IntervalRunner', () => {
  it('reports progress through a distance piece', () => {
    const runner = new IntervalRunner([distance(1000)])

    let state = runner.update(0, 0)
    expect(state.phase).toBe('piece')
    expect(state.pieceNumber).toBe(1)
    expect(state.remaining).toBe(1000)

    state = runner.update(60, 250)
    expect(state.progress).toBeCloseTo(0.25)
    expect(state.remaining).toBe(750)
  })

  it('finishes a distance piece once the target is covered', () => {
    const runner = new IntervalRunner([distance(500)])
    expect(runner.update(100, 499).phase).toBe('piece')

    const state = runner.update(101, 500)
    expect(state.phase).toBe('done')
    expect(runner.isDone).toBe(true)
    expect(runner.rowedPieces).toEqual([
      { index: 1, kind: 'distance', target: 500, start_t: 0, end_t: 101 },
    ])
  })

  it('finishes a time piece exactly on its target, not when it was noticed', () => {
    const runner = new IntervalRunner([time(240)])
    // The tick lands late, but the recorded boundary is the target itself.
    runner.update(241.5, 900)
    expect(runner.rowedPieces[0].end_t).toBe(240)
  })

  it('rests between pieces and starts the next one by itself', () => {
    const runner = new IntervalRunner([distance(500, 120), distance(500)])

    let state = runner.update(100, 500)
    expect(state.phase).toBe('rest')
    expect(state.restRemaining).toBe(120)
    expect(state.pieceNumber).toBe(2) // the piece the rest leads into
    expect(state.next).toEqual(distance(500))

    state = runner.update(160, 520)
    expect(state.phase).toBe('rest')
    expect(state.restRemaining).toBe(60)

    state = runner.update(221, 530)
    expect(state.phase).toBe('piece')
    expect(state.pieceNumber).toBe(2)
    // The second piece measures from where the rest ended, not from the workout start.
    expect(state.remaining).toBe(500)
  })

  it('goes straight into the next piece when there is no rest', () => {
    const runner = new IntervalRunner([distance(500, 0), distance(500)])
    const state = runner.update(100, 500)
    expect(state.phase).toBe('piece')
    expect(state.pieceNumber).toBe(2)
    expect(runner.rowedPieces).toHaveLength(1)
  })

  it('ignores the rest configured on the final piece', () => {
    const runner = new IntervalRunner([distance(500, 120)])
    expect(runner.update(100, 500).phase).toBe('done')
  })

  it('crosses several boundaries in one update when the tab was throttled', () => {
    // Hidden tab: no ticks for ten minutes, covering two time pieces and the rest between.
    const runner = new IntervalRunner([time(60, 30), time(60, 30), time(60)])
    const state = runner.update(600, 2500)

    expect(state.phase).toBe('done')
    expect(runner.rowedPieces.map((p) => [p.start_t, p.end_t])).toEqual([
      [0, 60],
      [90, 150],
      [180, 240],
    ])
  })

  it('does not advance a distance piece on time alone', () => {
    const runner = new IntervalRunner([distance(1000), distance(1000)])
    // An hour of sitting still: the piece is not done until the metres are rowed.
    const state = runner.update(3600, 0)
    expect(state.phase).toBe('piece')
    expect(state.pieceNumber).toBe(1)
    expect(runner.rowedPieces).toEqual([])
  })

  it('measures distance pieces exactly when fed back-filled samples after a throttle', () => {
    // 4x250 m, no rest. The tab sleeps: one wake-up, but tick() has back-filled every
    // second, so each piece must still end at the second its metres were reached.
    const runner = new IntervalRunner([distance(250), distance(250), distance(250), distance(250)])
    const samples = Array.from({ length: 201 }, (_, t) => ({ t, distance: t * 5 }))

    const state = runner.consume(samples)

    expect(state.phase).toBe('done')
    expect(runner.rowedPieces.map((p) => [p.start_t, p.end_t])).toEqual([
      [0, 50],
      [50, 100],
      [100, 150],
      [150, 200],
    ])
  })

  it('consume() picks up where the previous call stopped', () => {
    const runner = new IntervalRunner([distance(250), distance(250)])
    const samples = Array.from({ length: 101 }, (_, t) => ({ t, distance: t * 5 }))

    expect(runner.consume(samples.slice(0, 40)).phase).toBe('piece')
    const state = runner.consume(samples)
    expect(state.phase).toBe('done')
    expect(runner.rowedPieces.map((p) => p.end_t)).toEqual([50, 100])
  })

  it('handles an empty plan as already done', () => {
    const runner = new IntervalRunner([])
    expect(runner.update(0, 0).phase).toBe('done')
    expect(runner.rowedPieces).toEqual([])
  })

  it('mixes distance and time pieces in one session', () => {
    const runner = new IntervalRunner([distance(500, 60), time(120)])

    expect(runner.update(110, 500).phase).toBe('rest')
    expect(runner.update(170, 500).phase).toBe('piece')
    expect(runner.update(290, 900).phase).toBe('done')

    expect(runner.rowedPieces).toEqual([
      { index: 1, kind: 'distance', target: 500, start_t: 0, end_t: 110 },
      { index: 2, kind: 'time', target: 120, start_t: 170, end_t: 290 },
    ])
  })
})
