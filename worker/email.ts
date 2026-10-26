import { z } from "zod";
import { encryptCalendarToken, decryptCalendarToken } from "./calendar";
import { clock } from "./booking";
import { digest, randomToken } from "./security";
import { HttpError, now, type Env, type BookingRow } from "./types";
export function emailEnabled(env: Env) {
  try {
    const origin = new URL(env.PUBLIC_ORIGIN ?? "");
    return (
      env.EMAIL_ENABLED === "true" &&
      !!env.EMAIL_API_KEY &&
      z.email().safeParse(env.EMAIL_FROM).success &&
      /^[A-Za-z0-9+/]{43}=$/.test(env.EMAIL_TOKEN_KEY ?? "") &&
      origin.origin === env.PUBLIC_ORIGIN &&
      (origin.protocol === "https:" ||
        (env.COOKIE_SECURE === "false" &&
          ["localhost", "127.0.0.1"].includes(origin.hostname)))
    );
  } catch {
    return false;
  }
}
const cipherEnv = (env: Env): Env => ({
  ...env,
  CALENDAR_TOKEN_KEY: env.EMAIL_TOKEN_KEY,
});
type Mail = { from: string; to: string[]; subject: string; text: string };
export const recoverySchema = z
  .object({
    bookingId: z.uuid(),
    email: z.email().max(200),
    slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  })
  .strict();
export async function requestRecovery(
  request: Request,
  env: Env,
  data: z.infer<typeof recoverySchema>,
) {
  if (!emailEnabled(env))
    throw new HttpError(
      503,
      "Recuperação por e-mail ainda não configurada. Use seu link de acesso ou fale com o profissional.",
    );
  const hour = Math.floor(now() / 3600),
    ip = await digest(
      `${env.EMAIL_TOKEN_KEY}:${request.headers.get("CF-Connecting-IP") ?? "local"}`,
    );
  await env.DB.prepare(
    "DELETE FROM recovery_limits WHERE expires_at<=unixepoch()",
  ).run();
  const limit = await env.DB.prepare(
    "INSERT INTO recovery_limits(bucket,expires_at) VALUES(?,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 WHERE attempts<5 RETURNING attempts",
  )
    .bind(`${hour}:${ip}`, now() + 3600)
    .first();
  if (!limit) return;
  const b = await env.DB.prepare(
    "SELECT b.*,p.slug FROM bookings b JOIN professionals p ON p.id=b.professional_id AND p.status='active' WHERE b.id=? AND lower(b.email)=? AND p.slug=?",
  )
    .bind(data.bookingId, data.email.toLowerCase(), data.slug)
    .first<BookingRow & { slug: string }>();
  if (!b) return;
  const perBooking = await env.DB.prepare(
    "INSERT INTO recovery_limits(bucket,expires_at) VALUES(?,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 WHERE attempts<3 RETURNING attempts",
  )
    .bind(`${hour}:booking:${b.id}`, now() + 3600)
    .first();
  if (!perBooking) return;
  const token = randomToken(),
    id = crypto.randomUUID();
  const mail: Mail = {
    from: env.EMAIL_FROM!,
    to: [b.email],
    subject: "Seu link de acesso ao Slotiva",
    text: `Use este link uma única vez, em até 30 minutos, para consultar a reserva ${b.id}:\n\n${env.PUBLIC_ORIGIN}/p/${b.slug}#access=${token}\n\nSe você não pediu acesso, ignore esta mensagem. Não encaminhe este link.`,
  };
  const encrypted = await encryptCalendarToken(
    cipherEnv(env),
    b.professional_id,
    id,
    JSON.stringify(mail),
  );
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO customer_links(token_hash,booking_id,expires_at,email_hash) VALUES(?,?,?,?)",
    ).bind(
      await digest(token),
      b.id,
      now() + 1800,
      await digest(b.email.toLowerCase()),
    ),
    env.DB.prepare(
      "INSERT INTO email_jobs(id,professional_id,booking_id,kind,booking_version,body_encrypted,expires_at) VALUES(?,?,?,'recovery',?,?,?)",
    ).bind(id, b.professional_id, b.id, b.version, encrypted, now() + 1800),
  ]);
}
type Job = {
  id: string;
  professional_id: string;
  booking_id: string;
  kind: string;
  booking_version: number;
  body_encrypted: string | null;
  attempts: number;
};
const labels: Record<string, string> = {
  requested: "Aguardando aprovação",
  confirmed: "Confirmado pelo profissional",
  cancelled: "Cancelado",
  rejected: "Solicitação recusada",
  expired: "Solicitação expirada",
};
export async function processEmailJobs(
  env: Env,
  owner?: string,
  fetcher: typeof fetch = fetch,
) {
  await env.DB.prepare(
    "UPDATE email_jobs SET state='expired',body_encrypted=NULL WHERE expires_at<=unixepoch() AND state IN ('pending','failed') AND lease_until<=unixepoch()",
  ).run();
  if (!emailEnabled(env)) return;
  const jobs = await env.DB.prepare(
    `SELECT j.* FROM email_jobs j JOIN professionals p ON p.id=j.professional_id AND p.status='active' WHERE j.state IN ('pending','failed') AND j.next_attempt<=unixepoch() AND j.expires_at>unixepoch() AND j.lease_until<=unixepoch() ${owner ? "AND j.professional_id=?" : ""} ORDER BY j.created_at,j.id LIMIT 3`,
  )
    .bind(...(owner ? [owner] : []))
    .all<Job>();
  for (const j of jobs.results) {
    const lease = crypto.randomUUID();
    const claim = await env.DB.prepare(
      "UPDATE email_jobs SET lease=?,lease_until=unixepoch()+60 WHERE id=? AND lease_until<=unixepoch() AND next_attempt<=unixepoch() AND expires_at>unixepoch() AND state IN ('pending','failed')",
    )
      .bind(lease, j.id)
      .run();
    if (!claim.meta.changes) continue;
    try {
      const b = await env.DB.prepare(
        "SELECT b.*,p.slug FROM bookings b JOIN professionals p ON p.id=b.professional_id AND p.status='active' WHERE b.id=?",
      )
        .bind(j.booking_id)
        .first<BookingRow & { slug: string }>();
      if (
        !b ||
        !b.email ||
        (j.kind !== "recovery" &&
          (b.version !== j.booking_version ||
            b.status !==
              (j.kind === "requested" ? "pending_approval" : j.kind)))
      ) {
        await env.DB.prepare(
          "UPDATE email_jobs SET state='expired',body_encrypted=NULL WHERE id=? AND lease=?",
        )
          .bind(j.id, lease)
          .run();
        continue;
      }
      let encrypted = j.body_encrypted;
      if (!encrypted) {
        const mail: Mail = {
          from: env.EMAIL_FROM!,
          to: [b.email],
          subject: `Slotiva — ${labels[j.kind]}`,
          text: `Reserva: ${b.id}\nData: ${b.date.split("-").reverse().join("/")} às ${clock(b.start_min)} (Brasília)\nSituação: ${labels[j.kind]}\n\nConsulte o estado atual ou recupere o acesso com a identificação da reserva e este e-mail em:\n${env.PUBLIC_ORIGIN}/p/${b.slug}\n\nEsta mensagem não é um convite de calendário.`,
        };
        encrypted = await encryptCalendarToken(
          cipherEnv(env),
          j.professional_id,
          j.id,
          JSON.stringify(mail),
        );
        await env.DB.prepare(
          "UPDATE email_jobs SET body_encrypted=? WHERE id=? AND lease=?",
        )
          .bind(encrypted, j.id, lease)
          .run();
      }
      const body = await decryptCalendarToken(
        cipherEnv(env),
        j.professional_id,
        j.id,
        encrypted,
      );
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.EMAIL_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `slotiva/${j.id}`,
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("provider");
      const accepted = z
        .object({ id: z.string().min(1).max(200) })
        .parse(await response.json());
      await env.DB.prepare(
        "UPDATE email_jobs SET state='accepted',accepted_at=unixepoch(),provider_id=?,body_encrypted=NULL WHERE id=? AND lease=?",
      )
        .bind(accepted.id, j.id, lease)
        .run();
    } catch {
      await env.DB.prepare(
        "UPDATE email_jobs SET state='failed',attempts=attempts+1,next_attempt=unixepoch()+? WHERE id=? AND lease=?",
      )
        .bind(Math.min(3600, 60 * 2 ** Math.min(j.attempts, 6)), j.id, lease)
        .run();
    } finally {
      await env.DB.prepare(
        "UPDATE email_jobs SET lease=NULL,lease_until=0 WHERE id=? AND lease=?",
      )
        .bind(j.id, lease)
        .run();
    }
  }
}
export async function emailStatus(env: Env, owner: string) {
  const jobs = await env.DB.prepare(
    "SELECT j.id,j.kind,j.state,j.attempts,j.created_at,j.accepted_at,b.date,b.start_min FROM email_jobs j JOIN bookings b ON b.id=j.booking_id WHERE j.professional_id=? ORDER BY j.created_at DESC,j.id LIMIT 100",
  )
    .bind(owner)
    .all();
  return { enabled: emailEnabled(env), jobs: jobs.results };
}
