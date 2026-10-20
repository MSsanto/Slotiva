import { describe, it, expect } from 'vitest'
import { nextDays } from './api'
describe('professional calendar',() => {
  it('crosses month and year boundaries using UTC keys',() => {
    const days=nextDays('2026-12-30',3)
    expect(days.map(d => d.key)).toEqual(['2026-12-31','2027-01-01','2027-01-02'])
    expect(days.map(d => d.day)).toEqual([31,1,2])
  })
})
