export type Service = { id: string; name: string; description: string; duration: number; price: number }
export type Booking = { id: string; serviceId: string; date: string; time: string; name: string; email: string }
export type Receipt = Booking & { cancelToken: string }
export type Hours = { weekday: number; opens: string; closes: string }
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(typeof body.detail === 'string' ? body.detail : 'Não foi possível concluir. Confira os dados e tente novamente.', response.status)
  }
  return response.status === 204 ? undefined as T : response.json()
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Falha na conexão. Tente novamente.'
export function nextDays(today: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate()+i+1)
    return { key: d.toISOString().slice(0,10), day: d.getUTCDate(), weekday: d.toLocaleDateString('pt-BR',{weekday:'short',timeZone:'UTC'}), month: d.toLocaleDateString('pt-BR',{month:'short',timeZone:'UTC'}) }
  })
}
export const formatDate = (date: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone:'UTC' }).format(new Date(`${date}T12:00:00Z`))
