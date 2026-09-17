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

  it('parses a real WaterRower S4 packet (warm-up, distance/pace/power/energy/HR/elapsed)', () => {
    // captured from Settings → "Log raw Bluetooth packets" during a live 30 s test row
    const view = bytes(
      0x2c, 0x0b, 0x30, 0x49, 0x00, 0x65, 0x01, 0x00, 0x08, 0x02, 0x23, 0x00, 0x0b, 0x00, 0x32, 0x28,
      0xab, 0x00, 0x71, 0x01,
    )
    expect(parseRowerData(view)).toEqual({
      strokeRate: 24,
      strokeCount: 73,
      totalDistance: 357,
      instantPace: 520,
      instantPower: 35,
      totalEnergy: 11,
      energyPerHour: 10290,
      energyPerMinute: 171,
      heartRate: 0,
      elapsedTime: 369,
    })
  })

  it('parses a real WaterRower S4 packet mid-stroke, higher stroke rate and power', () => {
    // same session, ~40 s later once the rower settled into a steady 27 spm
    const view = bytes(
      0x2c, 0x0b, 0x36, 0x53, 0x00, 0xa0, 0x01, 0x00, 0xe5, 0x01, 0x46, 0x00, 0x0e, 0x00, 0xb0, 0x18,
      0x69, 0x00, 0x91, 0x01,
    )
    expect(parseRowerData(view)).toEqual({
      strokeRate: 27,
      strokeCount: 83,
      totalDistance: 416,
      instantPace: 485,
      instantPower: 70,
      totalEnergy: 14,
      energyPerHour: 6320,
      energyPerMinute: 105,
      heartRate: 0,
      elapsedTime: 401,
    })
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
