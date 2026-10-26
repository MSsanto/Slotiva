import { requireNotice, window } from "./booking";
import { assertGoogleFree } from "./calendar-sync";
import { customerBooking } from "./customer-access";
import { HttpError, type Env } from "./types";
export async function proposeChange(
  request: Request,
  env: Env,
  id: string,
  data: { date: string; time: string },
) {
  const b = await customerBooking(request, env, id);
  if (b.status !== "confirmed" || b.starts_at <= Date.now() / 1000)
    throw new HttpError(
      409,
      "Somente reservas confirmadas futuras podem ser remarcadas.",
    );
  const w = window(data.date, data.time, b.service_duration);
  requireNotice(w.startsAt);
  if (b.date === data.date && b.start_min === w.start)
    throw new HttpError(422, "Escolha um horário diferente do atual.");
  await env.DB.prepare(
    "UPDATE booking_changes SET state='expired',version=version+1 WHERE booking_id=? AND state='pending' AND expires_at<=unixepoch()",
  )
    .bind(id)
    .run();
  try {
    return await env.DB.prepare(
      "INSERT INTO booking_changes(id,booking_id,professional_id,booking_version,replacement_id,date,weekday,starts_at,start_min,end_min,occupied_until) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id,date,start_min,state,expires_at,version",
    )
      .bind(
        crypto.randomUUID(),
        id,
        b.professional_id,
        b.version,
        crypto.randomUUID(),
        data.date,
        w.weekday,
        w.startsAt,
        w.start,
        w.end,
        w.until,
      )
      .first();
  } catch (e) {
    if (
      (e instanceof Error &&
        e.message.includes("one_pending_booking_change")) ||
      (e instanceof Error && e.message.includes("booking_changes.booking_id"))
    )
      throw new HttpError(409, "Já existe uma mudança aguardando aprovação.");
    throw e;
  }
}
export async function changeStatus(request: Request, env: Env, id: string) {
  await customerBooking(request, env, id, false);
  return env.DB.prepare(
    "SELECT id,date,start_min,CASE WHEN state='pending' AND expires_at<=unixepoch() THEN 'expired' ELSE state END AS state,expires_at,version,replacement_id FROM booking_changes WHERE booking_id=? ORDER BY created_at DESC,id DESC LIMIT 1",
  )
    .bind(id)
    .first();
}
export async function pendingChanges(env: Env, owner: string) {
  const rows = await env.DB.prepare(
    "SELECT c.id,c.booking_id,c.date,c.start_min,c.expires_at,c.version,b.date AS original_date,b.start_min AS original_start,b.name FROM booking_changes c JOIN bookings b ON b.id=c.booking_id WHERE c.professional_id=? AND c.state='pending' AND c.expires_at>unixepoch() ORDER BY c.created_at",
  )
    .bind(owner)
    .all();
  return rows.results;
}
export async function decideChange(
  env: Env,
  owner: string,
  actor: string,
  id: string,
  action: "approve" | "reject",
  version: number,
) {
  const c = await env.DB.prepare(
    "SELECT starts_at,start_min,end_min FROM booking_changes WHERE id=? AND professional_id=? AND state='pending' AND version=? AND expires_at>unixepoch()",
  )
    .bind(id, owner, version)
    .first<{ starts_at: number; start_min: number; end_min: number }>();
  if (c && action === "approve")
    await assertGoogleFree(env, owner, [
      { startsAt: c.starts_at, start: c.start_min, end: c.end_min },
    ]);
  const state = action === "approve" ? "approved" : "rejected";
  const row = await env.DB.prepare(
    "UPDATE booking_changes SET state=?,version=version+1,actor=? WHERE id=? AND professional_id=? AND state='pending' AND version=? AND expires_at>unixepoch() RETURNING id,state,replacement_id,version",
  )
    .bind(state, actor, id, owner, version)
    .first();
  if (row) return row;
  const replay = await env.DB.prepare(
    "SELECT id,state,replacement_id,version FROM booking_changes WHERE id=? AND professional_id=? AND state=? AND version=?",
  )
    .bind(id, owner, state, version + 1)
    .first();
  if (replay) return replay;
  throw new HttpError(409, "A proposta mudou ou expirou. Atualize a agenda.");
}
