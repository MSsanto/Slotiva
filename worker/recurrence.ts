import { assertGoogleFree } from "./calendar-sync";
import { bookingService } from "./services";
import { z } from "zod";
import { bookingSchema, output, window } from "./booking";
import { digest, randomToken, type Principal } from "./security";
import { HttpError, type BookingRow, type Env } from "./types";
export const seriesSchema = bookingSchema
  .extend({
    email: z.union([z.email().max(200), z.literal("")]),
    requestId: z.uuid(),
    duration: z.number().int().min(15).max(240).multipleOf(5).optional(),
    frequency: z.enum(["once", "weekly", "fortnightly"]),
    count: z.number().int().min(1).max(26),
  })
  .strict()
  .refine((d) => d.frequency !== "once" || d.count === 1);
type SeriesInput = z.infer<typeof seriesSchema>;
async function existing(
  env: Env,
  professionalId: string,
  requestId: string,
  hash: string,
) {
  const row = await env.DB.prepare(
    "SELECT id,request_hash FROM booking_series WHERE professional_id=? AND request_id=?",
  )
    .bind(professionalId, requestId)
    .first<{ id: string; request_hash: string }>();
  if (!row) return null;
  if (row.request_hash !== hash)
    throw new HttpError(
      409,
      "Esta tentativa já foi usada com outros dados. Inicie um novo cadastro.",
    );
  const bookings = await env.DB.prepare(
    "SELECT * FROM bookings WHERE series_id=? AND professional_id=? ORDER BY starts_at",
  )
    .bind(row.id, professionalId)
    .all<BookingRow>();
  return { id: row.id, bookings: bookings.results.map(output) };
}
export async function createSeries(
  env: Env,
  principal: Principal,
  data: SeriesInput,
) {
  const professionalId = principal.professionalId!;
  const hash = await digest(JSON.stringify(data));
  const replay = await existing(env, professionalId, data.requestId, hash);
  if (replay) return replay;
  const service = await bookingService(
    env,
    professionalId,
    data.serviceId,
    data.serviceVersion,
  );
  if (service.duration_minutes !== null && data.duration !== undefined)
    throw new HttpError(
      422,
      "Este serviço já tem duração definida. Atualize o serviço para alterá-la.",
    );
  const duration = service.duration_minutes ?? data.duration;
  if (duration === undefined)
    throw new HttpError(
      422,
      "Informe a duração deste encontro para reservar o horário.",
    );
  const step =
    data.frequency === "fortnightly" ? 14 : data.frequency === "weekly" ? 7 : 0;
  const occurrences = Array.from({ length: data.count }, (_, i) => {
    const date = new Date(`${data.date}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i * step);
    const key = date.toISOString().slice(0, 10);
    return {
      date: key,
      ...window(key, data.time, duration, true),
    };
  });
  await assertGoogleFree(env, professionalId, occurrences);
  const id = crypto.randomUUID();
  const statements = [
    env.DB.prepare(
      "INSERT INTO booking_series(id,professional_id,request_id,request_hash,frequency,occurrence_count,actor_subject) VALUES(?,?,?,?,?,?,?)",
    ).bind(
      id,
      professionalId,
      data.requestId,
      hash,
      data.frequency,
      data.count,
      principal.subject,
    ),
  ];
  for (const w of occurrences)
    statements.push(
      env.DB.prepare(
        `INSERT INTO bookings(id,professional_id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,status,decided_at,source,series_id,service_name,service_description,service_duration,service_price_mode,service_price_cents,service_version)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'confirmed',unixepoch(),'professional',?,?,?,?,?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        professionalId,
        data.serviceId,
        w.date,
        w.weekday,
        w.startsAt,
        w.start,
        w.end,
        w.until,
        data.name,
        data.email,
        await digest(randomToken()),
        id,
        service.name,
        service.description,
        duration,
        service.price_mode,
        service.price_cents,
        service.version,
      ),
    );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const winner = await existing(env, professionalId, data.requestId, hash);
    if (winner) return winner;
    throw error;
  }
  return (await existing(env, professionalId, data.requestId, hash))!;
}
export async function cancelSeries(
  env: Env,
  professionalId: string,
  id: string,
  selection: { scope: "all" } | { scope: "from"; fromBookingId: string },
) {
  let cutoff = 0;
  if (selection.scope === "all") {
    const series = await env.DB.prepare(
      "SELECT id FROM booking_series WHERE id=? AND professional_id=?",
    )
      .bind(id, professionalId)
      .first();
    if (!series) throw new HttpError(404, "Série não encontrada.");
  } else {
    // Cancelled anchors remain resolvable for safe retries of earlier clients.
    const anchor = await env.DB.prepare(
      "SELECT starts_at FROM bookings WHERE id=? AND series_id=? AND professional_id=?",
    )
      .bind(selection.fromBookingId, id, professionalId)
      .first<{ starts_at: number }>();
    if (!anchor)
      throw new HttpError(404, "Ocorrência da série não encontrada.");
    cutoff = anchor.starts_at;
  }
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE bookings SET status='cancelled',cancelled=1,version=version+1,decided_at=unixepoch() WHERE series_id=? AND professional_id=? AND status='confirmed' AND starts_at>=? AND starts_at>unixepoch()",
    ).bind(id, professionalId, cutoff),
    env.DB.prepare(
      `UPDATE booking_series SET status=CASE WHEN EXISTS(
        SELECT 1 FROM bookings WHERE series_id=? AND professional_id=? AND status='confirmed' AND starts_at>unixepoch()
      ) THEN 'active' ELSE 'cancelled' END WHERE id=? AND professional_id=?`,
    ).bind(id, professionalId, id, professionalId),
  ]);
}
