import { z } from "zod";
import {
  availabilitySchema,
  bookingSchema,
  clock,
  hoursSchema,
  moveSchema,
  output,
  services,
  today,
  toMinutes,
  window,
} from "./booking";
import {
  cookieToken,
  digest,
  login,
  origin,
  randomToken,
  requireAdmin,
} from "./security";
import { HttpError, type Env, type BookingRow, type HoursRow } from "./types";
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers });
const noContent = (headers: HeadersInit = {}) =>
  new Response(null, { status: 204, headers });
async function read<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (Number(request.headers.get("content-length") || 0) > 8192)
    throw new HttpError(413, "Solicitação muito grande.");
  const text = await request.text();
  if (text.length > 8192) throw new HttpError(413, "Solicitação muito grande.");
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    throw new HttpError(422, "Confira os dados e tente novamente.");
  }
}
const bookingId = z.uuid();
function token(request: Request) {
  const value = request.headers.get("X-Cancel-Token") || "";
  if (!/^[a-f0-9]{64}$/.test(value))
    throw new HttpError(404, "Reserva não encontrada.");
  return value;
}
async function customer(request: Request, env: Env, id: string) {
  const hash = await digest(token(request));
  const row = await env.DB.prepare(
    "SELECT * FROM bookings WHERE id=? AND cancel_hash=? AND cancelled=0",
  )
    .bind(id, hash)
    .first<BookingRow>();
  if (!row) throw new HttpError(404, "Reserva não encontrada.");
  return row;
}
async function getHours(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT * FROM weekly_hours WHERE enabled=1 ORDER BY weekday",
  ).all<HoursRow>();
  return rows.results.map((r) => ({
    weekday: r.weekday,
    opens: clock(r.opens),
    closes: clock(r.closes),
  }));
}
async function route(request: Request, env: Env) {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
  if (path === "/api/services" && method === "GET") return json(services);
  if (path === "/api/calendar" && method === "GET")
    return json({
      today: today(),
      timezone: "America/Sao_Paulo",
      horizonDays: 14,
    });
  if (!env.DB)
    throw new HttpError(503, "Banco da agenda ainda não configurado.");
  if (path === "/api/health" && method === "GET") {
    await env.DB.prepare("SELECT 1 FROM weekly_hours LIMIT 1").first();
    return json({ status: "ok", storage: "D1" });
  }
  if (path === "/api/availability" && method === "GET") {
    const parsed = availabilitySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success)
      throw new HttpError(422, "Confira a data e o serviço.");
    const args = parsed.data;
    const { weekday } = window(args.date, "09:00", args.serviceId);
    const hours = await env.DB.prepare(
      "SELECT * FROM weekly_hours WHERE weekday=? AND enabled=1",
    )
      .bind(weekday)
      .first<HoursRow>();
    if (!hours) return json([]);
    const occupied = await env.DB.prepare(
      "SELECT minute FROM occupied_slots WHERE date=?",
    )
      .bind(args.date)
      .all<{ minute: number }>();
    const set = new Set(occupied.results.map((s) => s.minute));
    const duration =
      services.find((s) => s.id === args.serviceId)!.duration + 15;
    const result = [];
    for (
      let start = hours.opens;
      start + duration <= hours.closes;
      start += 30
    ) {
      let free = true;
      for (let m = start; m < start + duration; m += 15)
        if (set.has(m)) free = false;
      if (free) result.push(clock(start));
    }
    return json(result);
  }
  if (path === "/api/bookings" && method === "POST") {
    const data = await read(request, bookingSchema);
    const w = window(data.date, data.time, data.serviceId),
      id = crypto.randomUUID(),
      secret = randomToken();
    const row = await env.DB.prepare(
      `INSERT INTO bookings(id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
    )
      .bind(
        id,
        data.serviceId,
        data.date,
        w.weekday,
        w.startsAt,
        w.start,
        w.end,
        w.until,
        data.name,
        data.email,
        await digest(secret),
      )
      .first<BookingRow>();
    return json({ ...output(row!), cancelToken: secret }, 201);
  }
  const match = path.match(/^\/api\/bookings\/([^/]+)$/);
  if (match && (method === "DELETE" || method === "PUT")) {
    const id = bookingId.safeParse(match[1]);
    if (!id.success) throw new HttpError(404, "Reserva não encontrada.");
    const row = await customer(request, env, id.data);
    if (method === "DELETE") {
      const result = await env.DB.prepare(
        "UPDATE bookings SET cancelled=1 WHERE id=? AND cancel_hash=? AND cancelled=0",
      )
        .bind(id.data, row.cancel_hash)
        .run();
      if (!result.meta.changes)
        throw new HttpError(404, "Reserva não encontrada.");
      return noContent();
    }
    const data = await read(request, moveSchema),
      w = window(data.date, data.time, row.service_id);
    const moved = await env.DB.prepare(
      "UPDATE bookings SET date=?,weekday=?,starts_at=?,start_min=?,end_min=?,occupied_until=? WHERE id=? AND cancel_hash=? AND cancelled=0 RETURNING *",
    )
      .bind(
        data.date,
        w.weekday,
        w.startsAt,
        w.start,
        w.end,
        w.until,
        id.data,
        row.cancel_hash,
      )
      .first<BookingRow>();
    if (!moved) throw new HttpError(404, "Reserva não encontrada.");
    return json({ ...output(moved), cancelToken: token(request) });
  }
  const secure = env.COOKIE_SECURE !== "false" ? "; Secure" : "";
  if (path === "/api/admin/login" && method === "POST") {
    const data = await read(
      request,
      z.object({ password: z.string().min(1).max(200) }).strict(),
    );
    const value = await login(request, env, data.password);
    return noContent({
      "Set-Cookie": `slotiva_session=${value}; HttpOnly; SameSite=Lax; Path=/api/admin; Max-Age=28800${secure}`,
    });
  }
  if (path.startsWith("/api/admin/")) {
    if (method !== "GET") origin(request);
    if (path === "/api/admin/logout" && method === "POST") {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await digest(cookieToken(request)))
        .run();
      return noContent({
        "Set-Cookie": `slotiva_session=; HttpOnly; SameSite=Lax; Path=/api/admin; Max-Age=0${secure}`,
      });
    }
    await requireAdmin(request, env);
    if (path === "/api/admin/session" && method === "GET")
      return json({ authenticated: true });
    if (path === "/api/admin/bookings" && method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT * FROM bookings WHERE cancelled=0 ORDER BY date,start_min",
      ).all<BookingRow>();
      return json(rows.results.map(output));
    }
    if (path === "/api/admin/hours" && method === "GET")
      return json(await getHours(env));
    if (path === "/api/admin/hours" && method === "PUT") {
      const data = await read(request, hoursSchema);
      await env.DB.batch(
        Array.from({ length: 7 }, (_, day) =>
          env.DB.prepare(
            "UPDATE weekly_hours SET opens=?,closes=?,enabled=? WHERE weekday=?",
          ).bind(
            toMinutes(data.opens),
            toMinutes(data.closes),
            Number(data.weekdays.includes(day)),
            day,
          ),
        ),
      );
      return json(await getHours(env));
    }
    const cancel = path.match(/^\/api\/admin\/bookings\/([^/]+)$/);
    if (cancel && method === "DELETE") {
      const result = await env.DB.prepare(
        "UPDATE bookings SET cancelled=1 WHERE id=? AND cancelled=0",
      )
        .bind(cancel[1])
        .run();
      if (!result.meta.changes)
        throw new HttpError(404, "Reserva não encontrada.");
      return noContent();
    }
  }
  throw new HttpError(404, "Rota não encontrada.");
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try {
      response = await route(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (error instanceof HttpError)
        response = json({ detail: message }, error.status);
      else if (
        message.includes("occupied_slots.date") ||
        message.includes("occupied_slots.minute")
      )
        response = json(
          { detail: "Este horário não está mais disponível. Escolha outro." },
          409,
        );
      else if (message.includes("OUTSIDE_HOURS"))
        response = json({ detail: "Horário fora da disponibilidade." }, 422);
      else if (message.includes("EXISTING_BOOKINGS"))
        response = json(
          {
            detail:
              "Existem reservas fora do novo expediente. Reagende ou cancele antes de alterar.",
          },
          409,
        );
      else {
        console.error("slotiva request failed", new URL(request.url).pathname);
        response = json(
          { detail: "Serviço temporariamente indisponível. Tente novamente." },
          503,
        );
      }
    }
    if (new URL(request.url).pathname.startsWith("/api/")) {
      response = new Response(response.body, response);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Content-Type-Options", "nosniff");
    }
    return response;
  },
};
