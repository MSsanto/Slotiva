export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_PASSWORD_HASH?: string;
  COOKIE_SECURE?: string;
  AUTH_MODE?: string;
  PUBLIC_ORIGIN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MASTER_GOOGLE_SUBS?: string;
  CALENDAR_TOKEN_KEY?: string;
}
export interface BookingRow {
  id: string;
  source: "public" | "professional";
  series_id: string | null;
  service_id: string;
  service_name: string;
  service_description: string;
  service_duration: number;
  service_price_mode: "free" | "paid" | "hidden";
  service_price_cents: number | null;
  service_version: number;
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
  professional_id: string;
  status:
    "pending_approval" | "confirmed" | "rejected" | "expired" | "cancelled";
  approval_expires_at: number | null;
  decided_at: number | null;
  version: number;
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
