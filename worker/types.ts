export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_PASSWORD_HASH?: string;
  COOKIE_SECURE?: string;
}
export interface BookingRow {
  id: string;
  service_id: string;
  date: string;
  weekday: number;
  starts_at: number;
  start_min: number;
  end_min: number;
  occupied_until: number;
  name: string;
  email: string;
  cancel_hash: string;
  cancelled: number;
}
export interface HoursRow {
  weekday: number;
  opens: number;
  closes: number;
  enabled: number;
}
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export const now = () => Math.floor(Date.now() / 1000);
