import { describe, expect, it } from 'vitest'
import { availableSlots, reserve, type Booking } from './booking'
const booking: Booking = { id: '1', serviceId: 'discovery', date: '2026-11-02', time: '09:00', name: 'Demo', email: 'demo@example.com' }
describe('booking rules', () => {
  it('removes a reserved slot only from its day', () => {
    expect(availableSlots([booking], booking.date)).not.toContain('09:00')
    expect(availableSlots([booking], '2026-11-03')).toContain('09:00')
  })
  it('rejects a conflicting booking without changing the original list', () => {
    const existing = [booking]
    expect(() => reserve(existing, { ...booking, id: '2' })).toThrow('não está mais disponível')
    expect(existing).toHaveLength(1)
  })
  it('rejects invalid contact information', () => {
    expect(() => reserve([], { ...booking, email: 'invalid' })).toThrow('e-mail válido')
  })
  it('allows a new reservation without mutating existing data', () => {
    const existing: Booking[] = []
    expect(reserve(existing, booking)).toEqual([booking])
    expect(existing).toEqual([])
  })
})
