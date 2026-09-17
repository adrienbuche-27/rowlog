import { describe, expect, it } from 'vitest'
import { RowerFlags, encodeRowerData, parseRowerData } from './ftms'

const bytes = (...b: number[]) => new DataView(new Uint8Array(b).buffer)

describe('parseRowerData', () => {
  it('reads stroke rate and count when the More Data bit is 0 (inverted flag)', () => {
    // flags 0x0000, stroke rate 48 (=24 spm), stroke count 300
    expect(parseRowerData(bytes(0x00, 0x00, 48, 0x2c, 0x01))).toEqual({ strokeRate: 24, strokeCount: 300 })
  })

  it('omits stroke fields when More Data is 1', () => {
    // flags: MORE_DATA | TOTAL_DISTANCE, distance = 70000 m (0x011170)
    const flags = RowerFlags.MORE_DATA | RowerFlags.TOTAL_DISTANCE
    expect(parseRowerData(bytes(flags, 0x00, 0x70, 0x11, 0x01))).toEqual({ totalDistance: 70000 })
  })

  it('parses a typical WaterRower packet with distance, pace and power', () => {
    const flags = RowerFlags.TOTAL_DISTANCE | RowerFlags.INSTANT_PACE | RowerFlags.INSTANT_POWER
    const view = bytes(flags & 0xff, flags >> 8, 50, 0x10, 0x00, 0xe8, 0x03, 0x00, 125, 0x00, 180, 0x00)
    expect(parseRowerData(view)).toEqual({
      strokeRate: 25,
      strokeCount: 16,
      totalDistance: 1000,
      instantPace: 125,
      instantPower: 180,
    })
  })

  it('returns the fields read so far for truncated packets', () => {
    const flags = RowerFlags.MORE_DATA | RowerFlags.TOTAL_DISTANCE | RowerFlags.INSTANT_PACE
    expect(parseRowerData(bytes(flags, 0x00, 0x10, 0x00, 0x00, 0x7d))).toEqual({ totalDistance: 16 })
  })

  it('handles empty payloads', () => {
    expect(parseRowerData(bytes())).toEqual({})
    expect(parseRowerData(bytes(0x00))).toEqual({})
  })

  it('reads signed power', () => {
    const flags = RowerFlags.MORE_DATA | RowerFlags.INSTANT_POWER
    expect(parseRowerData(bytes(flags, 0x00, 0xff, 0xff))).toEqual({ instantPower: -1 })
  })

  it('round-trips every field through the encoder', () => {
    const data = {
      strokeRate: 26.5,
      strokeCount: 1234,
      averageStrokeRate: 24,
      totalDistance: 5321,
      instantPace: 118,
      averagePace: 121,
      instantPower: 210,
      averagePower: 195,
      resistanceLevel: 3,
      totalEnergy: 312,
      energyPerHour: 900,
      energyPerMinute: 15,
      heartRate: 152,
      metabolicEquivalent: 9.5,
      elapsedTime: 1500,
      remainingTime: 300,
    }
    expect(parseRowerData(encodeRowerData(data))).toEqual(data)
  })
})
