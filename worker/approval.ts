import { HttpError, type BookingRow, type Env } from "./types";

// Both HTTP and scheduled execution use the same guarded atomic transition.
export async function expirePending(env: Env) {
  await env.DB.prepare(
    `UPDATE bookings SET status='expired',cancelled=1,version=version+1,decided_at=unixepoch()
     WHERE status='pending_approval' AND approval_expires_at<=unixepoch()`,
  ).run();
}

export async function decide(
  env: Env,
  id: string,
  action: "approve" | "reject",
  version: number,
) {
  const target = action === "approve" ? "confirmed" : "rejected";
  const row = await env.DB.prepare(
    `UPDATE bookings SET status=?,cancelled=?,version=version+1,decided_at=unixepoch()
     WHERE id=? AND status='pending_approval' AND version=? AND approval_expires_at>unixepoch()
     RETURNING *`,
  )
    .bind(target, Number(target === "rejected"), id, version)
    .first<BookingRow>();
  if (row) return row;
  const existing = await env.DB.prepare("SELECT * FROM bookings WHERE id=?")
    .bind(id)
    .first<BookingRow>();
  if (!existing) throw new HttpError(404, "Solicitação não encontrada.");
  // Repeating the same decision is safe; no UPDATE means no extra event/job.
  if (existing.status === target && existing.version === version + 1)
    return existing;
  throw new HttpError(
    409,
    "A solicitação mudou ou expirou. Atualize a agenda.",
  );
}
