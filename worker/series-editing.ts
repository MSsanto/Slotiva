import { z } from "zod";
import { moveSchema, window, output } from "./booking";
import { digest, randomToken, type Principal } from "./security";
import { assertGoogleFreeForReplacement } from "./calendar-sync";
import { HttpError, type Env, type BookingRow } from "./types";

export const editSeriesSchema = moveSchema
  .extend({
    frequency: z.enum(["weekly", "fortnightly"]),
    count: z.number().int().min(1).max(26),
    requestId: z.uuid(),
    versions: z
      .array(
        z
          .object({ id: z.uuid(), version: z.number().int().positive() })
          .strict(),
      )
      .min(1)
      .max(26),
  })
  .strict()
  .refine(
    (data) =>
      new Set(data.versions.map((row) => row.id)).size === data.versions.length,
  );

export async function editableSeries(env: Env, owner: string) {
  const series = await env.DB.prepare(
    "SELECT id,frequency FROM booking_series WHERE professional_id=? AND status='active' AND frequency!='once' ORDER BY created_at DESC",
  )
    .bind(owner)
    .all<{ id: string; frequency: string }>();
  const bookings = await env.DB.prepare(
    "SELECT * FROM bookings WHERE professional_id=? AND source='professional' AND status='confirmed' AND starts_at>unixepoch() ORDER BY starts_at,id",
  )
    .bind(owner)
    .all<BookingRow>();
  return series.results
    .map((row) => ({
      ...row,
      bookings: bookings.results
        .filter((b) => b.series_id === row.id)
        .map(output),
    }))
    .filter((row) => row.bookings.length);
}

export async function editSeries(
  env: Env,
  principal: Principal,
  id: string,
  data: z.infer<typeof editSeriesSchema>,
) {
  const owner = principal.professionalId!,
    hash = await digest(JSON.stringify({ original: id, ...data }));
  async function replay() {
    const saved = await env.DB.prepare(
      "SELECT id,request_hash FROM booking_series WHERE professional_id=? AND request_id=?",
    )
      .bind(owner, data.requestId)
      .first<{ id: string; request_hash: string }>();
    if (!saved) return null;
    if (saved.request_hash !== hash)
      throw new HttpError(409, "Esta tentativa já foi usada com outros dados.");
    const rows = await env.DB.prepare(
      "SELECT * FROM bookings WHERE series_id=? AND professional_id=? ORDER BY starts_at",
    )
      .bind(saved.id, owner)
      .all<BookingRow>();
    return { id: saved.id, bookings: rows.results.map(output) };
  }
  const saved = await replay();
  if (saved) return saved;
  const rows = await env.DB.prepare(
    "SELECT * FROM bookings WHERE series_id=? AND professional_id=? AND status='confirmed' AND starts_at>unixepoch() ORDER BY starts_at,id",
  )
    .bind(id, owner)
    .all<BookingRow>();
  const original = rows.results,
    first = original[0];
  if (
    !first ||
    original.length !== data.versions.length ||
    original.some(
      (b) =>
        !data.versions.some((v) => v.id === b.id && v.version === b.version),
    )
  )
    throw new HttpError(409, "A série mudou. Atualize antes de editar.");
  if (
    original.some(
      (b) =>
        b.service_id !== first.service_id ||
        b.service_version !== first.service_version ||
        b.service_duration !== first.service_duration ||
        b.name !== first.name ||
        b.email !== first.email,
    )
  )
    throw new HttpError(
      409,
      "Edite separadamente encontros com contatos ou condições diferentes.",
    );
  const links = await env.DB.prepare(
    "SELECT bc.client_id FROM booking_clients bc JOIN bookings b ON b.id=bc.booking_id WHERE b.series_id=? AND b.professional_id=? AND b.status='confirmed' AND b.starts_at>unixepoch()",
  )
    .bind(id, owner)
    .all<{ client_id: string }>();
  if (new Set(links.results.map((row) => row.client_id)).size !== 1)
    throw new HttpError(
      409,
      "Esta série tem cadastros de clientes diferentes. Edite os encontros separadamente.",
    );
  const clientId = links.results[0].client_id;
  const occurrences = Array.from({ length: data.count }, (_, index) => {
    const day = new Date(data.date + "T12:00:00Z");
    day.setUTCDate(
      day.getUTCDate() + index * (data.frequency === "weekly" ? 7 : 14),
    );
    const date = day.toISOString().slice(0, 10);
    return { date, ...window(date, data.time, first.service_duration, true) };
  });
  await assertGoogleFreeForReplacement(
    env,
    owner,
    occurrences,
    original.map((b) => b.id),
  );
  const replacement = crypto.randomUUID();
  const guard =
    "INSERT INTO booking_series(id,professional_id,request_id,request_hash,frequency,occurrence_count,actor_subject) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM booking_series WHERE id=? AND professional_id=? AND status='active' AND frequency!='once') AND (SELECT count(*) FROM bookings WHERE series_id=? AND professional_id=? AND status='confirmed' AND starts_at>unixepoch())=? AND (SELECT count(*) FROM booking_clients bc JOIN bookings b ON b.id=bc.booking_id WHERE b.series_id=? AND b.professional_id=? AND b.status='confirmed' AND b.starts_at>unixepoch() AND bc.client_id=?)=? AND NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM bookings b WHERE b.id=json_extract(e.value,'$.id') AND b.version=json_extract(e.value,'$.version') AND b.series_id=? AND b.professional_id=? AND b.status='confirmed' AND b.starts_at>unixepoch()))";
  const statements = [
    env.DB.prepare(guard).bind(
      replacement,
      owner,
      data.requestId,
      hash,
      data.frequency,
      data.count,
      principal.subject,
      id,
      owner,
      id,
      owner,
      original.length,
      id,
      owner,
      clientId,
      original.length,
      JSON.stringify(data.versions),
      id,
      owner,
    ),
    env.DB.prepare(
      "INSERT INTO series_replacements(replacement_id,original_series_id,original_booking_id,professional_id) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM booking_series WHERE id=?)",
    ).bind(replacement, id, first.id, owner, replacement),
    env.DB.prepare(
      "UPDATE bookings SET status='cancelled',cancelled=1,version=version+1,decided_at=unixepoch() WHERE series_id=? AND professional_id=? AND status='confirmed' AND starts_at>unixepoch() AND EXISTS(SELECT 1 FROM booking_series WHERE id=?)",
    ).bind(id, owner, replacement),
    env.DB.prepare(
      "UPDATE booking_series SET status='cancelled' WHERE id=? AND professional_id=? AND EXISTS(SELECT 1 FROM booking_series WHERE id=?)",
    ).bind(id, owner, replacement),
  ];
  for (const [index, occurrence] of occurrences.entries()) {
    const booking = crypto.randomUUID();
    statements.push(
      env.DB.prepare(
        "INSERT INTO bookings(id,professional_id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,status,decided_at,source,series_id,service_name,service_description,service_duration,service_price_mode,service_price_cents,service_version) SELECT ?,b.professional_id,b.service_id,?,?,?,?,?,?,b.name,b.email,?,'confirmed',unixepoch(),'professional',?,b.service_name,b.service_description,b.service_duration,b.service_price_mode,b.service_price_cents,b.service_version FROM bookings b WHERE b.id=? AND b.professional_id=? AND EXISTS(SELECT 1 FROM booking_series WHERE id=?)",
      ).bind(
        booking,
        occurrence.date,
        occurrence.weekday,
        occurrence.startsAt,
        occurrence.start,
        occurrence.end,
        occurrence.until,
        await digest(randomToken()),
        replacement,
        first.id,
        owner,
        replacement,
      ),
    );
    statements.push(
      env.DB.prepare(
        "UPDATE booking_clients SET client_id=?,version=version+1 WHERE booking_id=?",
      ).bind(clientId, booking),
    );
    if (original[index])
      statements.push(
        env.DB.prepare(
          "INSERT INTO customer_grants(session_hash,booking_id,expires_at) SELECT session_hash,?,expires_at FROM customer_grants WHERE booking_id=? AND expires_at>unixepoch() AND EXISTS(SELECT 1 FROM bookings WHERE id=?)",
        ).bind(booking, original[index].id, booking),
      );
  }
  statements.push(
    env.DB.prepare(
      "DELETE FROM clients WHERE id=? AND professional_id=? AND NOT EXISTS(SELECT 1 FROM booking_clients WHERE client_id=clients.id)",
    ).bind(replacement, owner),
  );
  try {
    const result = await env.DB.batch(statements);
    if (!result[0].meta.changes)
      throw new HttpError(409, "A série mudou. Atualize antes de editar.");
  } catch (error) {
    const winner = await replay();
    if (winner) return winner;
    throw error;
  }
  return (await replay())!;
}
