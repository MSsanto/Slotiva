import { editSeriesSchema, editableSeries, editSeries } from "./series-editing";
import {
  clientSchema,
  listClients,
  saveClient,
  assignClient,
  exportClient,
  exportCustomerBooking,
  requestPrivacy,
  privacyRequests,
} from "./clients";
import {
  emailEnabled,
  requestRecovery,
  recoverySchema,
  processEmailJobs,
  emailStatus,
} from "./email";
import {
  proposeChange,
  changeStatus,
  pendingChanges,
  decideChange,
} from "./booking-changes";
import { dateHours, saveDateHours, dateHoursSchema } from "./date-hours";
import {
  customerBooking as customer,
  customerBookings,
  prepareGrant,
  customerCookie,
  accessCookie,
  createCustomerLink,
  redeemCustomerLink,
} from "./customer-access";
import {
  assertGoogleFree,
  filterGoogleSlots,
  processCalendarJobs,
  calendarSyncStatus,
} from "./calendar-sync";
import {
  calendarStatus,
  calendarFailure,
  startCalendar,
  completeCalendar,
  disconnectCalendar,
  calendarBusy,
} from "./calendar";
import {
  listServices,
  bookingService,
  saveService,
  createServiceSchema,
  editServiceSchema,
} from "./services";
import { createSeries, cancelSeries, seriesSchema } from "./recurrence";
import {
  professionalBySlug,
  professionalById,
  publicProfile,
  saveWhatsApp,
  whatsappSchema,
  privateProfile,
  createProfessional,
  restoreProfessional,
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
async function available(
  env: Env,
  professionalId: string,
  date: string,
  durationMinutes: number,
) {
  const { weekday } = window(date, "09:00", durationMinutes);
  const exception = await env.DB.prepare(
    "SELECT opens,closes,enabled FROM date_hours WHERE professional_id=? AND date=?",
  )
    .bind(professionalId, date)
    .first<HoursRow>();
  const hours = exception
    ? exception.enabled
      ? exception
      : null
    : await env.DB.prepare(
        "SELECT * FROM weekly_hours WHERE professional_id=? AND weekday=? AND enabled=1",
      )
        .bind(professionalId, weekday)
        .first<HoursRow>();
  if (!hours) return [];
  const occupied = await env.DB.prepare(
    "SELECT minute FROM occupied_slots WHERE professional_id=? AND date=?",
  )
    .bind(professionalId, date)
    .all<{ minute: number }>();
  const set = new Set(occupied.results.map((s) => s.minute));
  const duration = durationMinutes + 15;
  const result = [];
  for (let start = hours.opens; start + duration <= hours.closes; start += 30) {
    let free = true;
    for (let m = start; m < start + duration; m += 15)
      if (set.has(m)) free = false;
    const startsAt = Date.parse(`${date}T${clock(start)}:00-03:00`) / 1000;
    if (free && startsAt >= Math.floor(Date.now() / 1000) + 48 * 3600)
      result.push(clock(start));
  }
  return filterGoogleSlots(env, professionalId, date, result, durationMinutes);
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
  if (path.startsWith("/api/customer/")) {
    if (method !== "GET") origin(request);
    if (path === "/api/customer/delivery" && method === "GET")
      return json({ enabled: emailEnabled(env) });
    if (path === "/api/customer/recovery" && method === "POST") {
      await requestRecovery(request, env, await read(request, recoverySchema));
      return json(
        {
          detail:
            "Se a identificação e o e-mail corresponderem à reserva, você receberá um link de acesso.",
        },
        202,
      );
    }
    if (path === "/api/customer/bookings" && method === "GET")
      return json(
        (
          await customerBookings(
            request,
            env,
            url.searchParams.get("slug") ?? "demo",
          )
        ).map(output),
      );
    if (path === "/api/customer/session" && method === "DELETE") {
      await env.DB.prepare("DELETE FROM customer_grants WHERE session_hash=?")
        .bind(await digest(customerCookie(request)))
        .run();
      return new Response(null, {
        status: 204,
        headers: { "Set-Cookie": accessCookie(env, "", 0) },
      });
    }
    if (path === "/api/customer/access" && method === "POST") {
      const data = await read(
        request,
        z.object({ token: z.string().max(64) }).strict(),
      );
      const redeemed = await redeemCustomerLink(request, env, data.token);
      const response = json({ bookingId: redeemed.bookingId });
      response.headers.set("Set-Cookie", redeemed.cookie);
      return response;
    }
  }
  const privacy = path.match(/^\/api\/bookings\/([^/]+)\/(export|privacy)$/);
  if (privacy) {
    if (!bookingId.safeParse(privacy[1]).success)
      throw new HttpError(404, "Reserva não encontrada.");
    if (privacy[2] === "export" && method === "GET")
      return json(await exportCustomerBooking(request, env, privacy[1]));
    if (privacy[2] === "privacy" && method === "POST") {
      origin(request);
      const data = await read(
        request,
        z.object({ kind: z.enum(["export", "delete"]) }).strict(),
      );
      return json(
        await requestPrivacy(request, env, privacy[1], data.kind),
        202,
      );
    }
  }
  const customerChange = path.match(/^\/api\/bookings\/([^/]+)\/change$/);
  if (customerChange && ["GET", "POST"].includes(method)) {
    if (!bookingId.safeParse(customerChange[1]).success)
      throw new HttpError(404, "Reserva não encontrada.");
    if (method === "GET")
      return json(await changeStatus(request, env, customerChange[1]));
    origin(request);
    return json(
      await proposeChange(
        request,
        env,
        customerChange[1],
        await read(request, moveSchema),
      ),
      201,
    );
  }
  const accessLink = path.match(/^\/api\/bookings\/([^/]+)\/access$/);
  if (accessLink && method === "POST") {
    origin(request);
    if (!bookingId.safeParse(accessLink[1]).success)
      throw new HttpError(404, "Reserva não encontrada.");
    return json(await createCustomerLink(request, env, accessLink[1]));
  }
  if (path === "/api/services" && method === "GET")
    return json(await listServices(env, professionalId));
  if (path === "/api/health" && method === "GET") {
    await env.DB.prepare(
      "SELECT can_write FROM calendar_connections LIMIT 1",
    ).first();
    await env.DB.prepare("SELECT 1 FROM calendar_jobs LIMIT 1").first();
    await env.DB.prepare("SELECT 1 FROM customer_grants LIMIT 1").first();
    await env.DB.prepare("SELECT 1 FROM date_hours LIMIT 1").first();
    await env.DB.prepare("SELECT 1 FROM email_jobs LIMIT 1").first();
    await env.DB.prepare("SELECT 1 FROM clients LIMIT 1").first();
    await env.DB.prepare("SELECT 1 FROM series_replacements LIMIT 1").first();
    await env.DB.prepare(
      "SELECT 1 FROM calendar_oauth_transactions LIMIT 1",
    ).first();
    await env.DB.prepare(
      "SELECT service_name,service_duration,service_price_mode,service_price_cents,service_version FROM bookings LIMIT 1",
    ).first();
    await env.DB.prepare("SELECT 1 FROM professional_services LIMIT 1").first();
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
    await env.DB.prepare(
      "SELECT whatsapp_number,whatsapp_enabled FROM professionals LIMIT 1",
    ).first();
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
    } catch (error) {
      return googleFailure(env, error);
    }
  }
  if (path === "/api/admin/calendar/callback" && method === "GET") {
    try {
      await completeCalendar(request, env, await requireAdmin(request, env));
    } catch (error) {
      return calendarFailure(error);
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/admin?calendar=connected",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  if (path === "/api/availability" && method === "GET") {
    const parsed = availabilitySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success)
      throw new HttpError(422, "Confira a data e o serviço.");
    const args = parsed.data;
    const service = await bookingService(env, professionalId, args.serviceId);
    window(args.date, "09:00", service.duration_minutes ?? 15);
    if (service.duration_minutes === null) return json([]);
    return json(
      await available(env, professionalId, args.date, service.duration_minutes),
    );
  }
  if (path === "/api/bookings" && method === "POST") {
    const data = await read(request, bookingSchema);
    const service = await bookingService(
      env,
      professionalId,
      data.serviceId,
      data.serviceVersion,
    );
    if (service.duration_minutes === null)
      throw new HttpError(
        422,
        "Combine a duração e o horário diretamente com o profissional.",
      );
    const w = window(data.date, data.time, service.duration_minutes),
      id = crypto.randomUUID(),
      secret = randomToken();
    requireNotice(w.startsAt);
    const grant = await prepareGrant(request, env, id);
    const result = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO bookings(id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,professional_id,service_name,service_description,service_duration,service_price_mode,service_price_cents,service_version,approval_expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch()+86400) RETURNING *`,
      ).bind(
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
        service.name,
        service.description,
        service.duration_minutes,
        service.price_mode,
        service.price_cents,
        service.version,
      ),
      grant.statement,
    ]);
    const row = result[0].results[0] as unknown as BookingRow;
    const response = json({ ...output(row), cancelToken: secret }, 201);
    response.headers.set("Set-Cookie", grant.cookie);
    return response;
  }
  const moveAvailability = path.match(
    /^\/api\/bookings\/([^/]+)\/availability$/,
  );
  if (moveAvailability && method === "GET") {
    if (!bookingId.safeParse(moveAvailability[1]).success)
      throw new HttpError(404, "Reserva não encontrada.");
    const row = await customer(request, env, moveAvailability[1]);
    if (row.status !== "pending_approval")
      throw new HttpError(409, "Solicitação indisponível para alteração.");
    const data = moveSchema
      .pick({ date: true })
      .safeParse(Object.fromEntries(url.searchParams));
    if (!data.success) throw new HttpError(422, "Confira a data.");
    return json(
      await available(
        env,
        row.professional_id,
        data.data.date,
        row.service_duration,
      ),
    );
  }
  const match = path.match(/^\/api\/bookings\/([^/]+)$/);
  if (match && (method === "GET" || method === "DELETE" || method === "PUT")) {
    const id = bookingId.safeParse(match[1]);
    if (!id.success) throw new HttpError(404, "Reserva não encontrada.");
    if (method !== "GET" && !request.headers.has("X-Cancel-Token"))
      origin(request);
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
      w = window(data.date, data.time, row.service_duration);
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
    return json(output(moved));
  }
  if (path.startsWith("/api/master/")) {
    if (method !== "GET") origin(request);
    const principal = await requireMaster(request, env);
    if (path === "/api/master/session" && method === "GET")
      return json({ authenticated: true, role: "master" });
    if (path === "/api/master/professionals" && method === "GET") {
      const filter = url.searchParams.get("status");
      if (filter !== null && filter !== "deleted")
        throw new HttpError(422, "Filtro de profissionais inválido.");
      const rows = await env.DB.prepare(
        filter === "deleted"
          ? "SELECT * FROM professionals WHERE status='deleted' ORDER BY created_at,id"
          : "SELECT * FROM professionals WHERE status!='deleted' ORDER BY created_at,id",
      ).all<Professional>();
      return json(rows.results.map(privateProfile));
    }
    if (path === "/api/master/professionals" && method === "POST") {
      const data = await read(request, createProfessionalSchema);
      return json(await createProfessional(env, data, principal.subject), 201);
    }
    const restoreMatch = path.match(
      /^\/api\/master\/professionals\/([^/]+)\/restore$/,
    );
    if (restoreMatch && method === "POST") {
      const data = await read(request, versionSchema);
      return json(
        await restoreProfessional(
          env,
          restoreMatch[1],
          data.version,
          principal.subject,
        ),
      );
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
    if (path === "/api/admin/client-links" && method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT bc.booking_id,bc.client_id,bc.version FROM booking_clients bc JOIN bookings b ON b.id=bc.booking_id WHERE b.professional_id=?",
      )
        .bind(professionalId)
        .all();
      return json(rows.results);
    }
    if (path === "/api/admin/clients" && method === "GET") {
      const query = z
        .object({
          q: z.string().max(100).default(""),
          archived: z.enum(["true", "false"]).default("false"),
        })
        .strict()
        .safeParse(Object.fromEntries(url.searchParams));
      if (!query.success)
        throw new HttpError(422, "Confira os filtros de clientes.");
      return json(
        await listClients(
          env,
          professionalId,
          query.data.q,
          query.data.archived === "true",
        ),
      );
    }
    if (path === "/api/admin/clients" && method === "POST") {
      await saveClient(
        env,
        professionalId,
        undefined,
        await read(request, clientSchema),
      );
      return noContent();
    }
    const clientRoute = path.match(
      /^\/api\/admin\/clients\/([^/]+)(?:\/(export|assign))?$/,
    );
    if (clientRoute) {
      if (!bookingId.safeParse(clientRoute[1]).success)
        throw new HttpError(404, "Cadastro não encontrado.");
      if (clientRoute[2] === "export" && method === "GET")
        return json(await exportClient(env, professionalId, clientRoute[1]));
      if (clientRoute[2] === "assign" && method === "POST") {
        const data = await read(
          request,
          z
            .object({
              bookingId: bookingId,
              version: z.number().int().positive(),
            })
            .strict(),
        );
        await assignClient(
          env,
          professionalId,
          clientRoute[1],
          data.bookingId,
          data.version,
        );
        return noContent();
      }
      if (!clientRoute[2] && method === "DELETE") {
        const data = await read(
          request,
          z.object({ version: z.number().int().positive() }).strict(),
        );
        const result = await env.DB.prepare(
          "DELETE FROM clients WHERE id=? AND professional_id=? AND version=? AND NOT EXISTS(SELECT 1 FROM booking_clients WHERE client_id=clients.id)",
        )
          .bind(clientRoute[1], professionalId, data.version)
          .run();
        if (!result.meta.changes)
          throw new HttpError(
            409,
            "Cadastros com histórico devem ser arquivados. Atualize a lista para conferir a versão.",
          );
        return noContent();
      }
      if (!clientRoute[2] && method === "PUT") {
        await saveClient(
          env,
          professionalId,
          clientRoute[1],
          await read(request, clientSchema),
        );
        return noContent();
      }
    }
    if (path === "/api/admin/privacy" && method === "GET")
      return json(await privacyRequests(env, professionalId));
    const privacyDecision = path.match(/^\/api\/admin\/privacy\/([^/]+)$/);
    if (privacyDecision && method === "PUT") {
      const data = await read(
        request,
        z
          .object({
            state: z.enum(["reviewing", "closed"]),
            version: z.number().int().positive(),
          })
          .strict(),
      );
      const result = await env.DB.prepare(
        "UPDATE privacy_requests SET state=?,version=version+1,reviewed_by=? WHERE id=? AND professional_id=? AND version=? AND state!='closed'",
      )
        .bind(
          data.state,
          principal.subject,
          privacyDecision[1],
          professionalId,
          data.version,
        )
        .run();
      if (!result.meta.changes)
        throw new HttpError(409, "O pedido mudou. Atualize a lista.");
      return noContent();
    }
    if (path === "/api/admin/delivery" && method === "GET")
      return json(await emailStatus(env, professionalId));
    if (path === "/api/admin/delivery/retry" && method === "POST") {
      await env.DB.prepare(
        "UPDATE email_jobs SET next_attempt=0 WHERE professional_id=? AND state='failed' AND expires_at>unixepoch()",
      )
        .bind(professionalId)
        .run();
      await processEmailJobs(env, professionalId);
      return json(await emailStatus(env, professionalId));
    }
    if (path === "/api/admin/booking-changes" && method === "GET")
      return json(await pendingChanges(env, professionalId));
    const changeDecision = path.match(
      /^\/api\/admin\/booking-changes\/([^/]+)\/(approve|reject)$/,
    );
    if (changeDecision && method === "POST") {
      const data = await read(
        request,
        z.object({ version: z.number().int().positive() }).strict(),
      );
      return json(
        await decideChange(
          env,
          professionalId,
          principal.subject,
          changeDecision[1],
          changeDecision[2] as "approve" | "reject",
          data.version,
        ),
      );
    }
    if (path === "/api/admin/calendar" && method === "GET")
      return json(await calendarStatus(env, principal));
    if (path === "/api/admin/calendar/sync" && principal.provider !== "google")
      throw new HttpError(
        403,
        "Conecte usando a conta Google do profissional.",
      );
    if(path==="/api/admin/calendar/reconcile" && method==="POST"){
      if(principal.provider!=="google")throw new HttpError(403,"Conecte usando a conta Google do profissional.");
      await env.DB.prepare("UPDATE calendar_jobs SET state='pending',next_attempt=0 WHERE state='synced' AND booking_id IN (SELECT id FROM bookings WHERE professional_id=? AND status='confirmed' AND starts_at>unixepoch())").bind(professionalId).run();
      await processCalendarJobs(env,professionalId);
      return json(await calendarSyncStatus(env,professionalId));
    }
    if (path === "/api/admin/calendar/sync" && method === "GET")
      return json(await calendarSyncStatus(env, professionalId));
    if (path === "/api/admin/calendar/sync" && method === "POST") {
      await env.DB.prepare(
        "UPDATE calendar_jobs SET next_attempt=0 WHERE booking_id IN (SELECT id FROM bookings WHERE professional_id=?) AND state!='synced'",
      )
        .bind(professionalId)
        .run();
      await processCalendarJobs(env, professionalId);
      return json(await calendarSyncStatus(env, professionalId));
    }
    if (path === "/api/admin/calendar/start" && method === "POST")
      return startCalendar(request, env, principal);
    if (path === "/api/admin/calendar" && method === "DELETE") {
      await disconnectCalendar(env, principal);
      return noContent();
    }
    if (path === "/api/admin/calendar/busy" && method === "GET") {
      const data = moveSchema
        .pick({ date: true })
        .safeParse(Object.fromEntries(url.searchParams));
      if (!data.success) throw new HttpError(422, "Confira a data.");
      return json(await calendarBusy(env, principal, data.data.date));
    }
    if(path==="/api/admin/series" && method==="GET")return json(await editableSeries(env,professionalId));
    if (path === "/api/admin/series" && method === "POST")
      return json(
        await createSeries(env, principal, await read(request, seriesSchema)),
        201,
      );
    const seriesMatch = path.match(/^\/api\/admin\/series\/([^/]+)$/);
    if(seriesMatch && method==="PUT")return json(await editSeries(env,principal,seriesMatch[1],await read(request,editSeriesSchema)));
    if (seriesMatch && method === "DELETE") {
      const anchors = url.searchParams.getAll("fromBookingId");
      const scopes = url.searchParams.getAll("scope");
      const anchor = bookingId.safeParse(anchors[0]);
      if (scopes.length === 1 && scopes[0] === "all" && anchors.length === 0) {
        await cancelSeries(env, professionalId, seriesMatch[1], {
          scope: "all",
        });
      } else if (
        scopes.length === 0 &&
        anchors.length === 1 &&
        anchor.success
      ) {
        await cancelSeries(env, professionalId, seriesMatch[1], {
          scope: "from",
          fromBookingId: anchor.data,
        });
      } else {
        throw new HttpError(
          422,
          "Escolha explicitamente quais encontros cancelar.",
        );
      }
      return noContent();
    }
    if (path === "/api/admin/services" && method === "GET")
      return json(await listServices(env, professionalId, true));
    if (path === "/api/admin/services" && method === "POST")
      return json(
        await saveService(
          env,
          professionalId,
          principal.subject,
          await read(request, createServiceSchema),
        ),
        201,
      );
    const serviceMatch = path.match(/^\/api\/admin\/services\/([^/]+)$/);
    if (serviceMatch && method === "PUT")
      return json(
        await saveService(
          env,
          professionalId,
          principal.subject,
          await read(request, editServiceSchema),
          serviceMatch[1],
        ),
      );
    if (path === "/api/admin/whatsapp" && method === "PUT")
      return json(
        await saveWhatsApp(
          env,
          professionalId,
          await read(request, whatsappSchema),
          principal.subject,
        ),
      );
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
    if (path === "/api/admin/date-hours" && method === "GET")
      return json(await dateHours(env, professionalId));
    if (path === "/api/admin/date-hours" && method === "PUT")
      return json(
        await saveDateHours(
          env,
          professionalId,
          await read(request, dateHoursSchema),
        ),
      );
    if (path === "/api/admin/date-hours" && method === "DELETE") {
      const data = await read(
        request,
        moveSchema
          .pick({ date: true })
          .extend({ version: z.number().int().positive() })
          .strict(),
      );
      const result = await env.DB.prepare(
        "DELETE FROM date_hours WHERE professional_id=? AND date=? AND version=?",
      )
        .bind(professionalId, data.date, data.version)
        .run();
      if (!result.meta.changes)
        throw new HttpError(409, "A exceção mudou. Atualize a lista.");
      return noContent();
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
      if (decision[2] === "approve") {
        const pending = await env.DB.prepare(
          "SELECT * FROM bookings WHERE id=? AND professional_id=? AND status='pending_approval' AND version=?",
        )
          .bind(decision[1], professionalId, data.version)
          .first<BookingRow>();
        if (pending)
          await assertGoogleFree(env, professionalId, [
            {
              startsAt: pending.starts_at,
              start: pending.start_min,
              end: pending.end_min,
            },
          ]);
      }
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
    await env.DB.prepare(
      "UPDATE booking_changes SET state='expired',version=version+1 WHERE state='pending' AND expires_at<=unixepoch()",
    ).run();
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM customer_grants WHERE expires_at<=unixepoch()",
      ),
      env.DB.prepare(
        "DELETE FROM customer_links WHERE expires_at<=unixepoch()",
      ),
    ]);
    await Promise.all([processCalendarJobs(env), processEmailJobs(env)]);
  },
  async fetch(
    request: Request,
    env: Env,
    ctx?: ExecutionContext,
  ): Promise<Response> {
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
      else if (
        message.includes("SERVICE_CHANGED") ||
        message.includes("SERVICE_SNAPSHOT_IMMUTABLE")
      )
        response = json(
          {
            detail:
              "O serviço mudou. Atualize a página e confira os novos dados.",
          },
          409,
        );
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
    if (
      ctx &&
      response.ok &&
      request.method !== "GET" &&
      new URL(request.url).pathname.startsWith("/api/")
    )
      ctx.waitUntil(
        Promise.all([processCalendarJobs(env), processEmailJobs(env)]).catch(
          () => console.error("external delivery unavailable"),
        ),
      );
    return response;
  },
};
