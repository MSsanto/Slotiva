import { calendarAccess } from "./calendar";
import { digest } from "./security";
import { HttpError, type BookingRow, type Env } from "./types";

type Transport = typeof fetch;
type Connection = {
  subject: string;
  generation: string;
  encrypted_refresh_token: string;
};
type Job = {
  booking_id: string;
  revision: number;
  attempts: number;
  subject: string | null;
  event_id: string | null;
};
const events =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
class SyncFailure extends Error {
  readonly reason: "provider" | "conflict" | "connection" | "event_changed";
  constructor(
    reason: "provider" | "conflict" | "connection" | "event_changed",
  ) {
    super(reason);
    this.reason = reason;
  }
}
async function active(env: Env, owner: string, generation: string) {
  return env.DB.prepare(
    "SELECT 1 FROM calendar_connections c JOIN professionals p ON p.id=c.professional_id AND p.google_subject=c.subject AND p.status='active' WHERE c.professional_id=? AND c.generation=? AND c.state='connected' AND c.can_write=1",
  )
    .bind(owner, generation)
    .first();
}
async function connection(env: Env, owner: string) {
  return env.DB.prepare(
    "SELECT c.subject,c.generation,c.encrypted_refresh_token FROM calendar_connections c JOIN professionals p ON p.id=c.professional_id AND p.google_subject=c.subject AND p.status='active' WHERE c.professional_id=? AND c.state='connected' AND c.can_write=1",
  )
    .bind(owner)
    .first<Connection>();
}
async function google(
  fetcher: Transport,
  token: string,
  url: string,
  init: RequestInit = {},
) {
  return fetcher(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });
}
export async function assertGoogleFree(
  env: Env,
  owner: string,
  intervals: { startsAt: number; end: number; start: number }[],
  fetcher: Transport = fetch,
) {
  const c = await connection(env, owner);
  // Calendar is optional; a previously connected but revoked grant fails closed.
  if (!c) {
    const saved = await env.DB.prepare(
      "SELECT 1 FROM calendar_connections WHERE professional_id=? AND can_write=1",
    )
      .bind(owner)
      .first();
    if (saved)
      throw new HttpError(
        409,
        "Autorize novamente Google Agenda antes de confirmar.",
      );
    return;
  }
  const token = await calendarAccess(env, owner, c, fetcher);
  await checkFree(fetcher, token.access_token, intervals);
  if (!(await active(env, owner, c.generation)))
    throw new HttpError(409, "A conexão mudou. Atualize o painel.");
}
async function checkFree(
  fetcher: Transport,
  token: string,
  intervals: { startsAt: number; end: number; start: number }[],
) {
  const ranges = intervals.map((i) => ({
    start: i.startsAt * 1000,
    end: (i.startsAt + (i.end - i.start) * 60) * 1000,
  }));
  const r = await google(
    fetcher,
    token,
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      body: JSON.stringify({
        timeMin: new Date(
          Math.min(...ranges.map((i) => i.start)),
        ).toISOString(),
        timeMax: new Date(Math.max(...ranges.map((i) => i.end))).toISOString(),
        items: [{ id: "primary" }],
      }),
    },
  );
  if (!r.ok) throw new SyncFailure("provider");
  const data = (await r.json()) as {
    calendars?: Record<
      string,
      { busy?: { start: string; end: string }[]; errors?: unknown[] }
    >;
  };
  const calendars = Object.values(data.calendars ?? {});
  if (
    calendars.length !== 1 ||
    calendars[0].errors?.length ||
    !Array.isArray(calendars[0].busy)
  )
    throw new SyncFailure("provider");
  for (const b of calendars[0].busy) {
    const start = Date.parse(b.start),
      end = Date.parse(b.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
      throw new SyncFailure("provider");
    if (ranges.some((i) => start < i.end && end > i.start))
      throw new HttpError(409, "Este horário está ocupado na Google Agenda.");
  }
}
async function syncJob(env: Env, job: Job, fetcher: Transport) {
  const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?")
    .bind(job.booking_id)
    .first<BookingRow>();
  if (!b || b.version !== job.revision) return;
  const owner = b.professional_id,
    c = await connection(env, owner);
  if (!c || (job.subject && job.subject !== c.subject))
    throw new SyncFailure("connection");
  const eventId =
    job.event_id ??
    (await digest(`slotiva-event-v1:${owner}:${c.subject}:${b.id}`));
  // Persist identity before I/O: a lost insert response followed by cancellation can still delete it.
  await env.DB.prepare(
    "UPDATE calendar_jobs SET subject=?,event_id=? WHERE booking_id=? AND revision=?",
  )
    .bind(c.subject, eventId, b.id, b.version)
    .run();
  const token = await calendarAccess(env, owner, c, fetcher);
  const url = `${events}/${eventId}`;
  const existing = await google(fetcher, token.access_token, url);
  let event: {
    id?: string;
    status?: string;
    etag?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    extendedProperties?: { private?: { slotivaBooking?: string } };
  } | null = null;
  if (existing.ok) {
    event = await existing.json();
    if (event?.extendedProperties?.private?.slotivaBooking !== b.id)
      throw new SyncFailure("event_changed");
  } else if (existing.status !== 404 && existing.status !== 410)
    throw new SyncFailure("provider");
  const latest = await env.DB.prepare("SELECT version FROM bookings WHERE id=?")
    .bind(b.id)
    .first<{ version: number }>();
  if (latest?.version !== b.version) return;
  if (!(await active(env, owner, c.generation)))
    throw new SyncFailure("connection");
  if (b.status !== "confirmed") {
    if (event && event.status !== "cancelled") {
      if (!event.etag) throw new SyncFailure("provider");
      const r = await google(
        fetcher,
        token.access_token,
        `${url}?sendUpdates=all`,
        { method: "DELETE", headers: { "If-Match": event.etag } },
      );
      if (!r.ok && r.status !== 404 && r.status !== 410)
        throw new SyncFailure("provider");
    }
  } else if (!event) {
    if (existing.status === 410) throw new SyncFailure("event_changed");
    if (b.starts_at <= Date.now() / 1000) {
      await env.DB.prepare(
        "UPDATE calendar_jobs SET state='skipped',last_error=NULL,updated_at=unixepoch() WHERE booking_id=? AND revision=?",
      )
        .bind(b.id, b.version)
        .run();
      return;
    }
    try {
      await checkFree(fetcher, token.access_token, [
        { startsAt: b.starts_at, start: b.start_min, end: b.end_min },
      ]);
    } catch (e) {
      if (e instanceof HttpError && e.status === 409)
        throw new SyncFailure("conflict");
      throw e;
    }
    // Recheck after the external availability request too.
    const current = await env.DB.prepare(
      "SELECT version FROM bookings WHERE id=?",
    )
      .bind(b.id)
      .first<{ version: number }>();
    if (
      current?.version !== b.version ||
      !(await active(env, owner, c.generation))
    )
      return;
    const r = await google(
      fetcher,
      token.access_token,
      `${events}?sendUpdates=all`,
      {
        method: "POST",
        body: JSON.stringify({
          id: eventId,
          summary: "Atendimento — Slotiva",
          visibility: "private",
          transparency: "opaque",
          start: {
            dateTime: new Date(b.starts_at * 1000).toISOString(),
            timeZone: "America/Sao_Paulo",
          },
          end: {
            dateTime: new Date(
              (b.starts_at + (b.end_min - b.start_min) * 60) * 1000,
            ).toISOString(),
            timeZone: "America/Sao_Paulo",
          },
          ...(b.email ? { attendees: [{ email: b.email }] } : {}),
          guestsCanInviteOthers: false,
          guestsCanModify: false,
          guestsCanSeeOtherGuests: false,
          extendedProperties: { private: { slotivaBooking: b.id } },
        }),
      },
    );
    // A concurrent insert or lost response is resolved by GET on the next attempt.
    if (!r.ok) throw new SyncFailure("provider");
    const created = (await r.json()) as {
      id?: string;
      extendedProperties?: { private?: { slotivaBooking?: string } };
    };
    if (
      created.id !== eventId ||
      created.extendedProperties?.private?.slotivaBooking !== b.id
    )
      throw new SyncFailure("provider");
  } else if (
    event.status === "cancelled" ||
    Date.parse(event.start?.dateTime ?? "") !== b.starts_at * 1000 ||
    Date.parse(event.end?.dateTime ?? "") !==
      (b.starts_at + (b.end_min - b.start_min) * 60) * 1000
  )
    throw new SyncFailure("event_changed");
  await env.DB.prepare(
    "UPDATE calendar_jobs SET state='synced',synced_revision=?,last_error=NULL,attempts=0,updated_at=unixepoch() WHERE booking_id=? AND revision=?",
  )
    .bind(b.version, b.id, b.version)
    .run();
}
export async function processCalendarJobs(
  env: Env,
  owner?: string,
  fetcher: Transport = fetch,
) {
  const due = await env.DB.prepare(
    `SELECT j.* FROM calendar_jobs j JOIN bookings b ON b.id=j.booking_id JOIN calendar_connections c ON c.professional_id=b.professional_id JOIN professionals p ON p.id=b.professional_id WHERE c.can_write=1 AND c.state='connected' AND p.status='active' AND p.google_subject=c.subject AND j.state NOT IN ('synced','skipped') AND j.next_attempt<=unixepoch() AND j.lease_until<=unixepoch() ${owner ? "AND b.professional_id=?" : ""} ORDER BY j.updated_at,j.booking_id LIMIT 3`,
  )
    .bind(...(owner ? [owner] : []))
    .all<Job>();
  for (const job of due.results) {
    const lease = crypto.randomUUID();
    const claim = await env.DB.prepare(
      "UPDATE calendar_jobs SET lease=?,lease_until=unixepoch()+180 WHERE booking_id=? AND revision=? AND lease_until<=unixepoch()",
    )
      .bind(lease, job.booking_id, job.revision)
      .run();
    if (!claim.meta.changes) continue;
    try {
      await syncJob(env, job, fetcher);
    } catch (e) {
      const reason = e instanceof SyncFailure ? e.reason : "provider";
      await env.DB.prepare(
        "UPDATE calendar_jobs SET state=?,last_error=?,attempts=attempts+1,next_attempt=unixepoch()+?,updated_at=unixepoch() WHERE booking_id=? AND revision=? AND lease=?",
      )
        .bind(
          reason === "conflict" ? "conflict" : "failed",
          reason,
          Math.min(3600, 60 * 2 ** Math.min(job.attempts, 6)),
          job.booking_id,
          job.revision,
          lease,
        )
        .run();
    } finally {
      await env.DB.prepare(
        "UPDATE calendar_jobs SET lease=NULL,lease_until=0 WHERE booking_id=? AND lease=?",
      )
        .bind(job.booking_id, lease)
        .run();
    }
  }
}
export async function calendarSyncStatus(env: Env, owner: string) {
  const rows = await env.DB.prepare(
    "SELECT b.id,b.date,b.start_min,j.state,j.last_error FROM calendar_jobs j JOIN bookings b ON b.id=j.booking_id WHERE b.professional_id=? AND (b.starts_at>unixepoch() OR j.state!='synced') ORDER BY b.starts_at LIMIT 200",
  )
    .bind(owner)
    .all();
  return rows.results;
}
