import { createSeries, cancelSeries, seriesSchema } from "./recurrence";
import {
  professionalBySlug,
  professionalById,
  publicProfile,
  privateProfile,
  createProfessional,
  editProfessional,
  changeProfessionalStatus,
  createProfessionalSchema,
  editProfessionalSchema,
  professionalStatusSchema,
  versionSchema,
  type Professional,
} from "./professionals";
import {
  completeGoogleLogin,
  googleEnabled,
  googleFailure,
  startGoogleLogin,
} from "./google";
import { decide, expirePending } from "./approval";
import { z } from "zod";
import {
  availabilitySchema,
  bookingSchema,
  clock,
  hoursSchema,
  moveSchema,
  output,
  requireNotice,
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
  passwordEnabled,
  requireMaster,
  requireSession,
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
async function customer(request: Request, env: Env, id: string, active = true) {
  const hash = await digest(token(request));
  const row = await env.DB.prepare(
    "SELECT b.* FROM bookings b JOIN professionals p ON p.id=b.professional_id AND p.status='active' WHERE b.id=? AND b.cancel_hash=?",
  )
    .bind(id, hash)
    .first<BookingRow>();
  if (!row || (active && row.cancelled))
    throw new HttpError(404, "Reserva não encontrada.");
  return row;
}
async function getHours(env: Env, professionalId: string) {
  const rows = await env.DB.prepare(
    "SELECT * FROM weekly_hours WHERE professional_id=? AND enabled=1 ORDER BY weekday",
  )
    .bind(professionalId)
    .all<HoursRow>();
  return rows.results.map((r) => ({
    weekday: r.weekday,
    opens: clock(r.opens),
    closes: clock(r.closes),
  }));
}
async function route(request: Request, env: Env) {
  const url = new URL(request.url),
    method = request.method;
  let path = url.pathname;
  let professionalId = "demo";
  const publicMatch = path.match(
    /^\/api\/public\/([a-z0-9-]+)\/(profile|services|calendar|availability|bookings)$/,
  );
  if (publicMatch) {
    if (!env.DB) throw new HttpError(503, "Banco não configurado.");
    const professional = await professionalBySlug(env, publicMatch[1]);
    professionalId = professional.id;
    if (professional.id === "demo" && !passwordEnabled(env))
      throw new HttpError(404, "Profissional não encontrado.");
    if (publicMatch[2] === "profile" && method === "GET")
      return json(publicProfile(professional));
    path = "/api/" + publicMatch[2];
  } else if (
    env.AUTH_MODE !== undefined &&
    env.AUTH_MODE !== "demo" &&
    (["/api/services", "/api/calendar", "/api/availability"].includes(path) ||
      (path === "/api/bookings" && method === "POST"))
  ) {
    throw new HttpError(404, "Use o link do seu profissional.");
  }
  if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
  if (path === "/api/services" && method === "GET") return json(services);
  if (path === "/api/calendar" && method === "GET")
    return json({
      today: today(),
      timezone: "America/Sao_Paulo",
      horizonDays: 14,
      minimumNoticeHours: 48,
      approvalWindowHours: 24,
    });
  if (path === "/api/auth/config" && method === "GET")
    return json({
      googleEnabled: googleEnabled(env),
      passwordEnabled: passwordEnabled(env),
    });
  if (!env.DB)
    throw new HttpError(503, "Banco da agenda ainda não configurado.");
  if (path === "/api/health" && method === "GET") {
    await env.DB.prepare(
      "SELECT status,approval_expires_at,version FROM bookings LIMIT 1",
    ).first();
    await env.DB.prepare("SELECT 1 FROM notification_outbox LIMIT 1").first();
    await env.DB.prepare(
      "SELECT provider,subject FROM sessions LIMIT 1",
    ).first();
    await env.DB.prepare("SELECT 1 FROM oauth_transactions LIMIT 1").first();
    await env.DB.prepare(
      "SELECT professional_id FROM bookings LIMIT 1",
    ).first();
    await env.DB.prepare("SELECT 1 FROM professionals LIMIT 1").first();
    await env.DB.prepare(
      "SELECT source,series_id FROM bookings LIMIT 1",
    ).first();
    return json({ status: "ok", storage: "D1", approvalWorkflow: true });
  }
  await expirePending(env);
  if (path === "/api/admin/google/start" && method === "POST")
    return startGoogleLogin(request, env);
  if (path === "/api/admin/google/callback" && method === "GET") {
    try {
      return await completeGoogleLogin(request, env);
    } catch {
      return googleFailure(env);
    }
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
      "SELECT * FROM weekly_hours WHERE professional_id=? AND weekday=? AND enabled=1",
    )
      .bind(professionalId, weekday)
      .first<HoursRow>();
    if (!hours) return json([]);
    const occupied = await env.DB.prepare(
      "SELECT minute FROM occupied_slots WHERE professional_id=? AND date=?",
    )
      .bind(professionalId, args.date)
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
      const startsAt =
        Date.parse(`${args.date}T${clock(start)}:00-03:00`) / 1000;
      if (free && startsAt >= Math.floor(Date.now() / 1000) + 48 * 3600)
        result.push(clock(start));
    }
    return json(result);
  }
  if (path === "/api/bookings" && method === "POST") {
    const data = await read(request, bookingSchema);
    const w = window(data.date, data.time, data.serviceId),
      id = crypto.randomUUID(),
      secret = randomToken();
    requireNotice(w.startsAt);
    const row = await env.DB.prepare(
      `INSERT INTO bookings(id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,professional_id,approval_expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,unixepoch()+86400) RETURNING *`,
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
        professionalId,
      )
      .first<BookingRow>();
    return json({ ...output(row!), cancelToken: secret }, 201);
  }
  const match = path.match(/^\/api\/bookings\/([^/]+)$/);
  if (match && (method === "GET" || method === "DELETE" || method === "PUT")) {
    const id = bookingId.safeParse(match[1]);
    if (!id.success) throw new HttpError(404, "Reserva não encontrada.");
    const row = await customer(request, env, id.data, method !== "GET");
    professionalId = row.professional_id;
    if (method === "GET") return json(output(row));
    if (method === "DELETE") {
      const result = await env.DB.prepare(
        "UPDATE bookings SET cancelled=1,status='cancelled',version=version+1,decided_at=unixepoch() WHERE id=? AND cancel_hash=? AND cancelled=0",
      )
        .bind(id.data, row.cancel_hash)
        .run();
      if (!result.meta.changes)
        throw new HttpError(404, "Reserva não encontrada.");
      return noContent();
    }
    if (row.status !== "pending_approval")
      throw new HttpError(
        409,
        "Para remarcar uma reserva confirmada, entre em contato com o profissional.",
      );
    const data = await read(request, moveSchema),
      w = window(data.date, data.time, row.service_id);
    requireNotice(w.startsAt);
    const moved = await env.DB.prepare(
      "UPDATE bookings SET date=?,weekday=?,starts_at=?,start_min=?,end_min=?,occupied_until=?,version=version+1 WHERE id=? AND cancel_hash=? AND cancelled=0 AND status='pending_approval' AND version=? AND approval_expires_at>unixepoch() RETURNING *",
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
        row.version,
      )
      .first<BookingRow>();
    if (!moved)
      throw new HttpError(
        409,
        "A solicitação mudou ou expirou. Atualize a página.",
      );
    return json({ ...output(moved), cancelToken: token(request) });
  }
  if (path.startsWith("/api/master/")) {
    if (method !== "GET") origin(request);
    const principal = await requireMaster(request, env);
    if (path === "/api/master/session" && method === "GET")
      return json({ authenticated: true, role: "master" });
    if (path === "/api/master/professionals" && method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT * FROM professionals WHERE status!='deleted' ORDER BY created_at,id",
      ).all<Professional>();
      return json(rows.results.map(privateProfile));
    }
    if (path === "/api/master/professionals" && method === "POST") {
      const data = await read(request, createProfessionalSchema);
      return json(await createProfessional(env, data, principal.subject), 201);
    }
    const masterMatch = path.match(
      /^\/api\/master\/professionals\/([^/]+)(?:\/(status))?$/,
    );
    if (masterMatch) {
      if (method === "PUT" && !masterMatch[2])
        return json(
          await editProfessional(
            env,
            masterMatch[1],
            await read(request, editProfessionalSchema),
            principal.subject,
          ),
        );
      if (method === "PUT" && masterMatch[2]) {
        const data = await read(request, professionalStatusSchema);
        return json(
          await changeProfessionalStatus(
            env,
            masterMatch[1],
            data.status,
            data.version,
            principal.subject,
          ),
        );
      }
      if (method === "DELETE" && !masterMatch[2]) {
        const data = await read(request, versionSchema);
        await changeProfessionalStatus(
          env,
          masterMatch[1],
          "deleted",
          data.version,
          principal.subject,
        );
        return noContent();
      }
    }
    throw new HttpError(404, "Rota não encontrada.");
  }
  const secure = env.COOKIE_SECURE !== "false" ? "; Secure" : "";
  if (path === "/api/admin/login" && method === "POST") {
    const data = await read(
      request,
      z.object({ password: z.string().min(1).max(200) }).strict(),
    );
    const value = await login(request, env, data.password);
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      `slotiva_session=${value}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=28800${secure}`,
    );
    headers.append(
      "Set-Cookie",
      `slotiva_session=; HttpOnly; SameSite=Lax; Path=/api/admin; Max-Age=0${secure}`,
    );
    return noContent(headers);
  }
  if (path.startsWith("/api/admin/")) {
    if (method !== "GET") origin(request);
    if (path === "/api/admin/logout" && method === "POST") {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await digest(cookieToken(request)))
        .run();
      const headers = new Headers();
      for (const path of ["/api", "/api/admin"])
        headers.append(
          "Set-Cookie",
          `slotiva_session=; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=0${secure}`,
        );
      return noContent(headers);
    }
    if (path === "/api/admin/session" && method === "GET") {
      const principal = await requireSession(request, env);
      return json({
        authenticated: true,
        role: principal.role,
        professionalId: principal.professionalId,
      });
    }
    const principal = await requireAdmin(request, env);
    professionalId = principal.professionalId!;
    if (path === "/api/admin/series" && method === "POST")
      return json(
        await createSeries(env, principal, await read(request, seriesSchema)),
        201,
      );
    const seriesMatch = path.match(/^\/api\/admin\/series\/([^/]+)$/);
    if (seriesMatch && method === "DELETE") {
      await cancelSeries(env, professionalId, seriesMatch[1]);
      return noContent();
    }
    if (path === "/api/admin/services" && method === "GET")
      return json(services);
    if (path === "/api/admin/profile" && method === "GET")
      return json(privateProfile(await professionalById(env, professionalId)));
    if (path === "/api/admin/profile" && method === "PUT")
      return json(
        await editProfessional(
          env,
          professionalId,
          await read(request, editProfessionalSchema),
          principal.subject,
        ),
      );
    if (path === "/api/admin/bookings" && method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT * FROM bookings WHERE professional_id=? ORDER BY date,start_min",
      )
        .bind(professionalId)
        .all<BookingRow>();
      return json(rows.results.map(output));
    }
    if (path === "/api/admin/hours" && method === "GET")
      return json(await getHours(env, professionalId));
    if (path === "/api/admin/hours" && method === "PUT") {
      const data = await read(request, hoursSchema);
      await env.DB.batch(
        Array.from({ length: 7 }, (_, day) =>
          env.DB.prepare(
            "UPDATE weekly_hours SET opens=?,closes=?,enabled=? WHERE professional_id=? AND weekday=?",
          ).bind(
            toMinutes(data.opens),
            toMinutes(data.closes),
            Number(data.weekdays.includes(day)),
            professionalId,
            day,
          ),
        ),
      );
      return json(await getHours(env, professionalId));
    }
    const decision = path.match(
      /^\/api\/admin\/bookings\/([^/]+)\/(approve|reject)$/,
    );
    if (decision && method === "POST") {
      if (!bookingId.safeParse(decision[1]).success)
        throw new HttpError(404, "Solicitação não encontrada.");
      const data = await read(
        request,
        z.object({ version: z.number().int().positive() }).strict(),
      );
      return json(
        output(
          await decide(
            env,
            decision[1],
            decision[2] as "approve" | "reject",
            data.version,
            professionalId,
          ),
        ),
      );
    }
    const cancel = path.match(/^\/api\/admin\/bookings\/([^/]+)$/);
    if (cancel && method === "DELETE") {
      const result = await env.DB.prepare(
        "UPDATE bookings SET cancelled=1,status='cancelled',version=version+1,decided_at=unixepoch() WHERE id=? AND professional_id=? AND cancelled=0",
      )
        .bind(cancel[1], professionalId)
        .run();
      if (!result.meta.changes)
        throw new HttpError(404, "Reserva não encontrada.");
      return noContent();
    }
  }
  throw new HttpError(404, "Rota não encontrada.");
}
export default {
  async scheduled(_controller: ScheduledController, env: Env) {
    await expirePending(env);
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try {
      response = await route(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (error instanceof HttpError)
        response = json({ detail: message }, error.status);
      else if (
        message.includes("occupied_slots.professional_id") ||
        message.includes("occupied_slots.date") ||
        message.includes("occupied_slots.minute")
      )
        response = json(
          { detail: "Este horário não está mais disponível. Escolha outro." },
          409,
        );
      else if (
        message.includes("professionals.slug") ||
        message.includes("professionals.invited_email") ||
        message.includes("professionals.google_subject")
      )
        response = json(
          { detail: "Endereço ou identidade já cadastrado." },
          409,
        );
      else if (message.includes("PROFESSIONAL_UNAVAILABLE"))
        response = json({ detail: "Profissional indisponível." }, 404);
      else if (message.includes("INVALID_TRANSITION"))
        response = json(
          { detail: "A solicitação mudou ou expirou. Atualize a página." },
          409,
        );
      else if (message.includes("MINIMUM_NOTICE"))
        response = json(
          { detail: "Solicite com pelo menos 48 horas de antecedência." },
          422,
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
