import { z } from "zod";
import { verifyGoogleClaims } from "./google";
import {
  cookieToken,
  digest,
  randomToken,
  origin,
  type Principal,
} from "./security";
import { HttpError, now, type Env } from "./types";
import { moveSchema, today } from "./booking";
import type { JWTVerifyGetKey } from "jose";
export const calendarScope =
  "https://www.googleapis.com/auth/calendar.freebusy";
const callback = "/api/admin/calendar/callback";
const unavailable = () =>
  new HttpError(
    503,
    "Não foi possível consultar Google Agenda. Tente novamente.",
  );
function configuration(env: Env) {
  const origin = new URL(env.PUBLIC_ORIGIN || "https://invalid.local");
  const local =
    env.COOKIE_SECURE === "false" &&
    ["localhost", "127.0.0.1"].includes(origin.hostname);
  if (
    env.AUTH_MODE !== "google" ||
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    origin.origin !== env.PUBLIC_ORIGIN ||
    (origin.protocol !== "https:" && !(local && origin.protocol === "http:")) ||
    origin.username ||
    origin.password
  )
    throw new HttpError(
      503,
      "Conexão com Google Agenda ainda não configurada.",
    );
  return { origin: origin.origin, redirect: origin.origin + callback };
}
const bytes = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const base64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));
async function key(env: Env) {
  const value = env.CALENDAR_TOKEN_KEY ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new HttpError(
      503,
      "Conexão com Google Agenda ainda não configurada.",
    );
  return crypto.subtle.importKey("raw", bytes(value), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
function aad(owner: string, subject: string) {
  return new TextEncoder().encode(`slotiva-calendar-v1:${owner}:${subject}`);
}
export async function encryptCalendarToken(
  env: Env,
  owner: string,
  subject: string,
  token: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(owner, subject) },
    await key(env),
    new TextEncoder().encode(token),
  );
  return `v1.${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}
export async function decryptCalendarToken(
  env: Env,
  owner: string,
  subject: string,
  envelope: string,
) {
  const [version, iv, ciphertext, ...rest] = envelope.split(".");
  if (
    version !== "v1" ||
    !iv ||
    !ciphertext ||
    rest.length ||
    bytes(iv).length !== 12
  )
    throw unavailable();
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes(iv), additionalData: aad(owner, subject) },
      await key(env),
      bytes(ciphertext),
    ),
  );
}
function professional(p: Principal) {
  if (p.role !== "professional" || p.provider !== "google" || !p.professionalId)
    throw new HttpError(403, "Conecte usando a conta Google do profissional.");
  return p.professionalId;
}
export async function calendarStatus(env: Env, p: Principal) {
  const owner = professional(p);
  let enabled = false;
  try {
    configuration(env);
    await key(env);
    enabled = true;
  } catch {
    /* Configuration values never leave the server. */
  }
  const row = await env.DB.prepare(
    "SELECT state,connected_at FROM calendar_connections WHERE professional_id=? AND subject=?",
  )
    .bind(owner, p.subject)
    .first<{ state: string; connected_at: number }>();
  return {
    enabled,
    state: row?.state ?? "disconnected",
    connectedAt: row?.connected_at ?? null,
    mode: "availability_only",
  };
}
export async function startCalendar(request: Request, env: Env, p: Principal) {
  origin(request);
  const owner = professional(p),
    cfg = configuration(env);
  await key(env);
  if (new URL(request.url).origin !== cfg.origin)
    throw new HttpError(403, "Origem não autorizada.");
  const state = randomToken(),
    nonce = randomToken(),
    verifier = randomToken();
  const challenge = base64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM calendar_oauth_transactions WHERE expires_at<=? OR professional_id=?",
    ).bind(now(), owner),
    env.DB.prepare(
      "INSERT INTO calendar_oauth_transactions(state_hash,professional_id,subject,session_hash,nonce,verifier,expires_at) VALUES(?,?,?,?,?,?,?)",
    ).bind(
      await digest(state),
      owner,
      p.subject,
      await digest(cookieToken(request)),
      nonce,
      verifier,
      now() + 600,
    ),
  ]);
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: cfg.redirect,
    response_type: "code",
    scope: `openid ${calendarScope}`,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent select_account",
  }).toString();
  return new Response(null, {
    status: 303,
    headers: { Location: auth.toString(), "Referrer-Policy": "no-referrer" },
  });
}
type Transport = typeof fetch;
const transport: Transport = (input, init) => globalThis.fetch(input, init);
async function post(url: string, body: URLSearchParams, fetcher: Transport) {
  return fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8000),
    redirect: "error",
  });
}
export async function completeCalendar(
  request: Request,
  env: Env,
  p: Principal,
  deps: { fetch: Transport; keys?: JWTVerifyGetKey } = { fetch: transport },
) {
  const owner = professional(p),
    cfg = configuration(env);
  await key(env);
  const url = new URL(request.url),
    state = url.searchParams.get("state") ?? "";
  if (url.origin !== cfg.origin || !/^[a-f0-9]{64}$/.test(state))
    throw new HttpError(401, "Conexão expirada. Reinicie a conexão.");
  const stateHash = await digest(state),
    sessionHash = await digest(cookieToken(request));
  const txn = await env.DB.prepare(
    "UPDATE calendar_oauth_transactions SET consumed=1 WHERE state_hash=? AND professional_id=? AND subject=? AND session_hash=? AND expires_at>? AND consumed=0 RETURNING nonce,verifier",
  )
    .bind(stateHash, owner, p.subject, sessionHash, now())
    .first<{ nonce: string; verifier: string }>();
  if (!txn) throw new HttpError(401, "Conexão expirada. Reinicie a conexão.");
  try {
    const code = url.searchParams.get("code") ?? "";
    if (url.searchParams.has("error") || !code || code.length > 4096)
      throw new HttpError(401, "Conexão não autorizada.");
    const response = await post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        code,
        code_verifier: txn.verifier,
        redirect_uri: cfg.redirect,
        grant_type: "authorization_code",
      }),
      deps.fetch,
    );
    if (!response.ok) throw unavailable();
    const tokens = z
      .object({
        id_token: z.string().min(1).max(16384),
        refresh_token: z.string().min(1).max(8192),
        token_type: z.literal("Bearer"),
        scope: z.string().max(4096),
      })
      .parse(await response.json());
    if (!tokens.scope.split(" ").includes(calendarScope))
      throw new HttpError(403, "Permissão de disponibilidade não concedida.");
    const claims = await verifyGoogleClaims(
      tokens.id_token,
      env,
      txn.nonce,
      deps.keys,
    );
    if (claims.sub !== p.subject)
      throw new HttpError(
        403,
        "Escolha a mesma conta Google usada no painel profissional.",
      );
    const encrypted = await encryptCalendarToken(
      env,
      owner,
      p.subject,
      tokens.refresh_token,
    );
    const result = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO calendar_connections(professional_id,subject,encrypted_refresh_token,generation)
        SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM calendar_oauth_transactions WHERE state_hash=? AND consumed=1 AND expires_at>unixepoch())
        AND EXISTS(SELECT 1 FROM professionals WHERE id=? AND google_subject=? AND status='active')
        AND EXISTS(SELECT 1 FROM sessions WHERE token_hash=? AND subject=? AND professional_id=? AND role='professional' AND expires_at>unixepoch())
        ON CONFLICT(professional_id) DO UPDATE SET subject=excluded.subject,encrypted_refresh_token=excluded.encrypted_refresh_token,generation=excluded.generation,state='connected',connected_at=unixepoch()`,
      ).bind(
        owner,
        p.subject,
        encrypted,
        crypto.randomUUID(),
        stateHash,
        owner,
        p.subject,
        sessionHash,
        p.subject,
        owner,
      ),
      env.DB.prepare(
        "DELETE FROM calendar_oauth_transactions WHERE state_hash=?",
      ).bind(stateHash),
    ]);
    if (!result[0].meta.changes)
      throw new HttpError(
        401,
        "Conexão cancelada ou acesso revogado. Reinicie no painel.",
      );
  } finally {
    await env.DB.prepare(
      "DELETE FROM calendar_oauth_transactions WHERE state_hash=?",
    )
      .bind(stateHash)
      .run();
  }
}
export async function disconnectCalendar(env: Env, p: Principal) {
  const owner = professional(p);
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM calendar_connections WHERE professional_id=?",
    ).bind(owner),
    env.DB.prepare(
      "DELETE FROM calendar_oauth_transactions WHERE professional_id=?",
    ).bind(owner),
  ]);
}
const tokenResponse = z.object({
  access_token: z.string().min(1).max(8192),
  token_type: z.literal("Bearer"),
});
const busyResponse = z.object({
  calendars: z.record(
    z.string(),
    z.object({
      errors: z.array(z.unknown()).optional(),
      busy: z
        .array(
          z.object({
            start: z.iso.datetime({ offset: true }),
            end: z.iso.datetime({ offset: true }),
          }),
        )
        .max(5000),
    }),
  ),
});
export async function calendarBusy(
  env: Env,
  p: Principal,
  date: string,
  fetcher: Transport = transport,
) {
  const owner = professional(p);
  configuration(env);
  await key(env);
  if (!moveSchema.pick({ date: true }).safeParse({ date }).success)
    throw new HttpError(422, "Confira a data.");
  const last = new Date(`${today()}T12:00:00Z`);
  last.setUTCDate(last.getUTCDate() + 14);
  if (date < today() || date > last.toISOString().slice(0, 10))
    throw new HttpError(422, "Escolha uma data nos próximos 14 dias.");
  const row = await env.DB.prepare(
    "SELECT subject,encrypted_refresh_token,generation FROM calendar_connections WHERE professional_id=? AND subject=? AND state='connected'",
  )
    .bind(owner, p.subject)
    .first<{
      subject: string;
      encrypted_refresh_token: string;
      generation: string;
    }>();
  if (!row) throw new HttpError(409, "Conecte novamente sua Google Agenda.");
  try {
    let refresh: string;
    try {
      refresh = await decryptCalendarToken(
        env,
        owner,
        p.subject,
        row.encrypted_refresh_token,
      );
    } catch {
      await env.DB.prepare(
        "UPDATE calendar_connections SET state='reconnect_required' WHERE professional_id=? AND generation=?",
      )
        .bind(owner, row.generation)
        .run();
      throw unavailable();
    }
    const response = await post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refresh,
        grant_type: "refresh_token",
      }),
      fetcher,
    );
    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      if (response.status === 400 && result?.error === "invalid_grant")
        await env.DB.prepare(
          "UPDATE calendar_connections SET state='reconnect_required' WHERE professional_id=? AND generation=?",
        )
          .bind(owner, row.generation)
          .run();
      throw unavailable();
    }
    const token = tokenResponse.parse(await response.json());
    const timeMin = `${date}T00:00:00-03:00`,
      next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const timeMax = `${next.toISOString().slice(0, 10)}T00:00:00-03:00`;
    const result = await fetcher(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          timeZone: "America/Sao_Paulo",
          items: [{ id: "primary" }],
        }),
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      },
    );
    if (!result.ok) throw unavailable();
    const data = busyResponse.parse(await result.json());
    // Only one primary calendar was requested; accept its canonical response key too.
    const calendars = Object.values(data.calendars);
    if (calendars.length !== 1) throw unavailable();
    const cal = calendars[0];
    if (
      !cal ||
      cal.errors?.length ||
      cal.busy.some((b) => Date.parse(b.start) >= Date.parse(b.end))
    )
      throw unavailable();
    const active = await env.DB.prepare(
      "SELECT 1 FROM calendar_connections c JOIN professionals p ON p.id=c.professional_id AND p.status='active' AND p.google_subject=c.subject WHERE c.professional_id=? AND c.generation=? AND c.state='connected'",
    )
      .bind(owner, row.generation)
      .first();
    if (!active)
      throw new HttpError(409, "A conexão mudou. Atualize o painel.");
    return { date, timezone: "America/Sao_Paulo", busy: cal.busy };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw unavailable();
  }
}
