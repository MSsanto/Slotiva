export const services = [
  { id: 'discovery', name: 'Conversa inicial', description: 'Um primeiro encontro para entender seus objetivos.', duration: 30, price: 0 },
  { id: 'consulting', name: 'Consultoria individual', description: 'Tempo dedicado para transformar ideias em próximos passos.', duration: 60, price: 150 },
  { id: 'review', name: 'Sessão de acompanhamento', description: 'Revise o progresso e ajuste a direção.', duration: 45, price: 100 },
]
export type Booking = { id: string; serviceId: string; date: string; time: string; name: string; email: string }
export const slots = ['09:00', '10:30', '13:00', '14:30', '16:00']
export function availableSlots(bookings: Booking[], date: string) {
  return slots.filter(time => !bookings.some(b => b.date === date && b.time === time))
}
export function reserve(bookings: Booking[], booking: Booking): Booking[] {
  if (!services.some(s => s.id === booking.serviceId) || !availableSlots(bookings, booking.date).includes(booking.time)) throw new Error('Este horário não está mais disponível. Escolha outro.')
  if (!booking.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.email)) throw new Error('Preencha seu nome e um e-mail válido.')
  return [...bookings, booking]
}
export function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}` }
