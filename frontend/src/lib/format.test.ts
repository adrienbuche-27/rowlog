import { describe, expect, it } from 'vitest'
import { formatDuration, formatMetres, formatPace } from './format'

describe('format', () => {
  it('formats pace', () => {
    expect(formatPace(123.44)).toBe('2:03.4')
    expect(formatPace(59.96)).toBe('1:00.0')
    expect(formatPace(null)).toBe('–:––')
  })
  it('formats durations', () => {
    expect(formatDuration(754)).toBe('12:34')
    expect(formatDuration(3754)).toBe('1:02:34')
  })
  it('groups metres', () => {
    expect(formatMetres(5234.6)).toBe('5\u202f235')
  })
})
