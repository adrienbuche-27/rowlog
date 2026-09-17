/**
 * Bluetooth Fitness Machine Service (FTMS) — Rower Data characteristic.
 *
 * Spec: Bluetooth SIG "Fitness Machine Service 1.0", section 4.8 (Rower Data).
 * The WaterRower ComModule implements this profile. All values are little-endian.
 *
 * Two traps:
 *  1. Bit 0 ("More Data") is inverted: when it is 0, Stroke Rate and Stroke Count ARE present.
 *  2. A device may split one reading across several notifications, each carrying a subset of
 *     fields. Consumers must merge notifications instead of treating each as complete.
 */

export const FTMS_SERVICE = 0x1826
export const ROWER_DATA_CHAR = 0x2ad1
export const FITNESS_MACHINE_FEATURE_CHAR = 0x2acc

export const RowerFlags = {
  MORE_DATA: 1 << 0,
  AVERAGE_STROKE_RATE: 1 << 1,
  TOTAL_DISTANCE: 1 << 2,
  INSTANT_PACE: 1 << 3,
  AVERAGE_PACE: 1 << 4,
  INSTANT_POWER: 1 << 5,
  AVERAGE_POWER: 1 << 6,
  RESISTANCE_LEVEL: 1 << 7,
  EXPENDED_ENERGY: 1 << 8,
  HEART_RATE: 1 << 9,
  METABOLIC_EQUIVALENT: 1 << 10,
  ELAPSED_TIME: 1 << 11,
  REMAINING_TIME: 1 << 12,
} as const

export interface RowerData {
  /** strokes per minute (0.5 resolution) */
  strokeRate?: number
  strokeCount?: number
  averageStrokeRate?: number
  /** metres */
  totalDistance?: number
  /** seconds per 500 m */
  instantPace?: number
  averagePace?: number
  /** watts */
  instantPower?: number
  averagePower?: number
  resistanceLevel?: number
  /** kcal */
  totalEnergy?: number
  energyPerHour?: number
  energyPerMinute?: number
  /** bpm */
  heartRate?: number
  metabolicEquivalent?: number
  /** seconds */
  elapsedTime?: number
  remainingTime?: number
}

class Reader {
  offset = 0
  constructor(private view: DataView) {}
  has(bytes: number) {
    return this.offset + bytes <= this.view.byteLength
  }
  u8() {
    const v = this.view.getUint8(this.offset)
    this.offset += 1
    return v
  }
  u16() {
    const v = this.view.getUint16(this.offset, true)
    this.offset += 2
    return v
  }
  s16() {
    const v = this.view.getInt16(this.offset, true)
    this.offset += 2
    return v
  }
  u24() {
    const v = this.view.getUint16(this.offset, true) | (this.view.getUint8(this.offset + 2) << 16)
    this.offset += 3
    return v
  }
}

type FieldSpec = [bit: number | null, size: number, read: (r: Reader, out: RowerData) => void]

// Order matters: fields appear in the payload in this exact order.
const FIELDS: FieldSpec[] = [
  [null, 3, (r, o) => { o.strokeRate = r.u8() / 2; o.strokeCount = r.u16() }],
  [RowerFlags.AVERAGE_STROKE_RATE, 1, (r, o) => { o.averageStrokeRate = r.u8() / 2 }],
  [RowerFlags.TOTAL_DISTANCE, 3, (r, o) => { o.totalDistance = r.u24() }],
  [RowerFlags.INSTANT_PACE, 2, (r, o) => { o.instantPace = r.u16() }],
  [RowerFlags.AVERAGE_PACE, 2, (r, o) => { o.averagePace = r.u16() }],
  [RowerFlags.INSTANT_POWER, 2, (r, o) => { o.instantPower = r.s16() }],
  [RowerFlags.AVERAGE_POWER, 2, (r, o) => { o.averagePower = r.s16() }],
  [RowerFlags.RESISTANCE_LEVEL, 2, (r, o) => { o.resistanceLevel = r.s16() }],
  [RowerFlags.EXPENDED_ENERGY, 5, (r, o) => {
    o.totalEnergy = r.u16(); o.energyPerHour = r.u16(); o.energyPerMinute = r.u8()
  }],
  [RowerFlags.HEART_RATE, 1, (r, o) => { o.heartRate = r.u8() }],
  [RowerFlags.METABOLIC_EQUIVALENT, 1, (r, o) => { o.metabolicEquivalent = r.u8() / 10 }],
  [RowerFlags.ELAPSED_TIME, 2, (r, o) => { o.elapsedTime = r.u16() }],
  [RowerFlags.REMAINING_TIME, 2, (r, o) => { o.remainingTime = r.u16() }],
]

/**
 * Parse one Rower Data notification. Truncated payloads return the fields read so far
 * rather than throwing, so a malformed packet never kills a workout.
 */
export function parseRowerData(view: DataView): RowerData {
  const out: RowerData = {}
  const r = new Reader(view)
  if (!r.has(2)) return out
  const flags = r.u16()

  for (const [bit, size, read] of FIELDS) {
    // bit === null is the stroke rate/count pair, present when MORE_DATA is NOT set.
    const present = bit === null ? (flags & RowerFlags.MORE_DATA) === 0 : (flags & bit) !== 0
    if (!present) continue
    if (!r.has(size)) break
    read(r, out)
  }
  return out
}

/**
 * Encode Rower Data into a notification payload. Used by the simulator and tests, so both
 * exercise exactly the same parsing path as the real device.
 */
export function encodeRowerData(data: RowerData): DataView {
  let flags = 0
  const bytes: number[] = []
  const u8 = (v: number) => bytes.push(Math.round(v) & 0xff)
  const u16 = (v: number) => {
    const n = Math.round(v)
    bytes.push(n & 0xff, (n >> 8) & 0xff)
  }
  const u24 = (v: number) => {
    const n = Math.round(v)
    bytes.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff)
  }
  const add = (bit: number, value: number | undefined, write: (v: number) => void) => {
    if (value === undefined) return
    flags |= bit
    write(value)
  }

  if (data.strokeRate !== undefined && data.strokeCount !== undefined) {
    u8(data.strokeRate * 2)
    u16(data.strokeCount)
  } else {
    flags |= RowerFlags.MORE_DATA
  }
  add(RowerFlags.AVERAGE_STROKE_RATE, data.averageStrokeRate, (v) => u8(v * 2))
  add(RowerFlags.TOTAL_DISTANCE, data.totalDistance, u24)
  add(RowerFlags.INSTANT_PACE, data.instantPace, u16)
  add(RowerFlags.AVERAGE_PACE, data.averagePace, u16)
  add(RowerFlags.INSTANT_POWER, data.instantPower, u16)
  add(RowerFlags.AVERAGE_POWER, data.averagePower, u16)
  add(RowerFlags.RESISTANCE_LEVEL, data.resistanceLevel, u16)
  if (data.totalEnergy !== undefined) {
    flags |= RowerFlags.EXPENDED_ENERGY
    u16(data.totalEnergy)
    u16(data.energyPerHour ?? 0)
    u8(data.energyPerMinute ?? 0)
  }
  add(RowerFlags.HEART_RATE, data.heartRate, u8)
  add(RowerFlags.METABOLIC_EQUIVALENT, data.metabolicEquivalent, (v) => u8(v * 10))
  add(RowerFlags.ELAPSED_TIME, data.elapsedTime, u16)
  add(RowerFlags.REMAINING_TIME, data.remainingTime, u16)

  const buf = new Uint8Array(2 + bytes.length)
  buf[0] = flags & 0xff
  buf[1] = (flags >> 8) & 0xff
  buf.set(bytes, 2)
  return new DataView(buf.buffer)
}

export function hex(view: DataView): string {
  return Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
}
