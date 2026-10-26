import { digest, randomToken } from "./security";
import { HttpError, now, type Env, type BookingRow } from "./types";
const lifetime = 30 * 86400;
export function customerCookie(request: Request) {
  const value =
    request.headers
      .get("Cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("slotiva_customer="))
      ?.slice(17) ?? "";
  return /^[a-f0-9]{64}$/.test(value) ? value : "";
}
export function accessCookie(env: Env, value: string, age = lifetime) {
  return `slotiva_customer=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${age}${env.COOKIE_SECURE === "false" ? "" : "; Secure"}`;
}
export async function prepareGrant(
  request: Request,
  env: Env,
  bookingId: string,
) {
  let session = customerCookie(request);
  const saved =
    session &&
    (await env.DB.prepare(
      "SELECT 1 FROM customer_grants WHERE session_hash=? AND expires_at>? LIMIT 1",
    )
      .bind(await digest(session), now())
      .first());
  if (!saved) session = randomToken();
  return {
    cookie: accessCookie(env, session),
    statement: env.DB.prepare(
      "INSERT INTO customer_grants(session_hash,booking_id,expires_at) VALUES(?,?,?) ON CONFLICT(session_hash,booking_id) DO UPDATE SET expires_at=excluded.expires_at",
    ).bind(await digest(session), bookingId, now() + lifetime),
  };
}
export async function customerBooking(
  request: Request,
  env: Env,
  id: string,
  active = true,
) {
  const capability = request.headers.get("X-Cancel-Token") ?? "";
  const cookie = customerCookie(request);
  const row = await env.DB.prepare(
    `SELECT b.* FROM bookings b JOIN professionals p ON p.id=b.professional_id AND p.status='active' WHERE b.id=? AND (b.cancel_hash=? OR EXISTS(SELECT 1 FROM customer_grants g WHERE g.booking_id=b.id AND g.session_hash=? AND g.expires_at>?))`,
  )
    .bind(
      id,
      /^[a-f0-9]{64}$/.test(capability) ? await digest(capability) : "",
      cookie ? await digest(cookie) : "",
      now(),
    )
    .first<BookingRow>();
  if (!row || (active && row.cancelled))
    throw new HttpError(404, "Reserva não encontrada.");
  return row;
}
export async function customerBookings(
  request: Request,
  env: Env,
  slug: string,
) {
  const cookie = customerCookie(request);
  if (!cookie) return [];
  const rows = await env.DB.prepare(
    "SELECT b.* FROM customer_grants g JOIN bookings b ON b.id=g.booking_id JOIN professionals p ON p.id=b.professional_id AND p.status='active' WHERE g.session_hash=? AND g.expires_at>? AND p.slug=? ORDER BY b.created_at DESC,b.id LIMIT 50",
  )
    .bind(await digest(cookie), now(), slug)
    .all<BookingRow>();
  return rows.results;
}
export async function createCustomerLink(
  request: Request,
  env: Env,
  id: string,
) {
  const b = await customerBooking(request, env, id, false);
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM customer_links WHERE expires_at<=?").bind(
      now(),
    ),
    env.DB.prepare(
      "INSERT INTO customer_links(token_hash,booking_id,expires_at) VALUES(?,?,?)",
    ).bind(await digest(token), id, now() + 1800),
  ]);
  const p = await env.DB.prepare("SELECT slug FROM professionals WHERE id=?")
    .bind(b.professional_id)
    .first<{ slug: string }>();
  return {
    url: `${new URL(request.url).origin}/p/${p!.slug}#access=${token}`,
    expiresIn: 1800,
  };
}
export async function redeemCustomerLink(
  request: Request,
  env: Env,
  token: string,
) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(404, "Link inválido ou expirado.");
  const link = await env.DB.prepare(
    "SELECT l.booking_id,l.email_hash,b.email FROM customer_links l JOIN bookings b ON b.id=l.booking_id JOIN professionals p ON p.id=b.professional_id AND p.status='active' WHERE l.token_hash=? AND l.expires_at>?",
  )
    .bind(await digest(token), now())
    .first<{ booking_id: string; email_hash: string | null; email: string }>();
  if (!link) throw new HttpError(404, "Link inválido ou expirado.");
  const grant = await prepareGrant(request, env, link.booking_id);
  // The guarded INSERT and one-use DELETE share the same transaction.
  const result = await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO customer_grants(session_hash,booking_id,expires_at) SELECT ?,booking_id,? FROM customer_links WHERE token_hash=? AND expires_at>? ON CONFLICT(session_hash,booking_id) DO UPDATE SET expires_at=excluded.expires_at",
    ).bind(
      await digest(grant.cookie.split(";")[0].slice(17)),
      now() + lifetime,
      await digest(token),
      now(),
    ),
    env.DB.prepare(
      "INSERT INTO verified_booking_contacts(booking_id,email_hash) SELECT booking_id,email_hash FROM customer_links WHERE token_hash=? AND expires_at>? AND email_hash=? ON CONFLICT(booking_id) DO UPDATE SET email_hash=excluded.email_hash,verified_at=unixepoch()",
    ).bind(await digest(token), now(), await digest(link.email.toLowerCase())),
    env.DB.prepare("DELETE FROM customer_links WHERE token_hash=?").bind(
      await digest(token),
    ),
  ]);
  if (!result[0].meta.changes)
    throw new HttpError(404, "Link inválido ou expirado.");
  return { cookie: grant.cookie, bookingId: link.booking_id };
}
