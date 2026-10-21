import { HttpError, now, type Env } from "./types";
export const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++)
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
export function origin(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    throw new HttpError(403, "Origem não autorizada.");
}
export const cookieToken = (request: Request) =>
  request.headers
    .get("Cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("slotiva_session="))
    ?.slice("slotiva_session=".length) ?? "";
export function passwordEnabled(env: Env) {
  return env.AUTH_MODE === undefined || env.AUTH_MODE === "demo";
}
export type Principal = {
  provider: "password" | "google";
  subject: string;
  role: "master" | "professional";
  professionalId: string | null;
};
export function masterGoogleSubjects(env: Env) {
  return (env.MASTER_GOOGLE_SUBS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
export async function googlePrincipal(
  env: Env,
  subject: string,
): Promise<Principal> {
  if (masterGoogleSubjects(env).includes(subject))
    return {
      provider: "google",
      subject,
      role: "master",
      professionalId: null,
    };
  const row = await env.DB.prepare(
    "SELECT id FROM professionals WHERE google_subject=? AND status='active'",
  )
    .bind(subject)
    .first<{ id: string }>();
  if (!row)
    throw new HttpError(
      403,
      "Conta não autorizada ou profissional indisponível.",
    );
  return {
    provider: "google",
    subject,
    role: "professional",
    professionalId: row.id,
  };
}
export async function authorizeGoogleAccount(
  env: Env,
  claims: {
    sub: string;
    email?: unknown;
    email_verified?: unknown;
    hd?: unknown;
  },
) {
  try {
    return await googlePrincipal(env, claims.sub);
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 403) throw error;
  }
  // Only Google-authoritative, verified Gmail/Workspace addresses bootstrap an invitation.
  const email =
    typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  const authoritative =
    email.endsWith("@gmail.com") ||
    (typeof claims.hd === "string" && claims.hd.length > 0);
  if (!authoritative || claims.email_verified !== true)
    throw new HttpError(403, "Conta não autorizada para este profissional.");
  await env.DB.prepare(
    "UPDATE professionals SET google_subject=?,version=version+1,last_actor=? WHERE invited_email=? AND google_subject IS NULL AND status='active'",
  )
    .bind(claims.sub, claims.sub, email)
    .run();
  return googlePrincipal(env, claims.sub);
}
export async function requireSession(
  request: Request,
  env: Env,
): Promise<Principal> {
  const row = await env.DB.prepare(
    "SELECT provider,subject,role,professional_id FROM sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await digest(cookieToken(request)), now())
    .first<{
      provider: string;
      subject: string | null;
      role: string;
      professional_id: string | null;
    }>();
  if (!row) throw new HttpError(401, "Entre para acessar a agenda.");
  if (row.provider === "password") {
    if (
      !passwordEnabled(env) ||
      row.role !== "professional" ||
      row.professional_id !== "demo"
    )
      throw new HttpError(401, "Entre para acessar a agenda.");
    const p = await env.DB.prepare(
      "SELECT 1 FROM professionals WHERE id='demo' AND status='active'",
    ).first();
    if (!p) throw new HttpError(401, "Profissional indisponível.");
    return {
      provider: "password",
      subject: "demo-admin",
      role: "professional",
      professionalId: "demo",
    };
  }
  if (!row.subject) throw new HttpError(401, "Entre para acessar a agenda.");
  let principal: Principal;
  try {
    principal = await googlePrincipal(env, row.subject);
  } catch {
    throw new HttpError(401, "Sessão revogada ou profissional indisponível.");
  }
  if (
    principal.role !== row.role ||
    principal.professionalId !== row.professional_id
  )
    throw new HttpError(401, "Entre novamente para atualizar suas permissões.");
  return principal;
}
export async function requireAdmin(request: Request, env: Env) {
  const principal = await requireSession(request, env);
  if (principal.role !== "professional")
    throw new HttpError(403, "Acesso restrito ao profissional.");
  return principal;
}
export async function requireMaster(request: Request, env: Env) {
  const principal = await requireSession(request, env);
  if (principal.role !== "master" || principal.provider !== "google")
    throw new HttpError(403, "Acesso restrito à administração master.");
  return principal;
}
export async function passwordHash(password: string, salt = randomToken()) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
    },
    key,
    256,
  );
  const hex = Array.from(new Uint8Array(derived), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `pbkdf2-sha256:100000:${salt}:${hex}`;
}
export async function login(request: Request, env: Env, password: string) {
  origin(request);
  if (!passwordEnabled(env))
    throw new HttpError(403, "Use o acesso Google do profissional.");
  const stored = env.ADMIN_PASSWORD_HASH;
  if (
    !stored ||
    !/^pbkdf2-sha256:100000:[a-f0-9]{64}:[a-f0-9]{64}$/.test(stored)
  )
    throw new HttpError(503, "Acesso administrativo não configurado.");
  const key = await digest(request.headers.get("CF-Connecting-IP") || "local");
  const attempt = await env.DB.prepare(
    `INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(client_key) DO UPDATE SET
    attempts=CASE WHEN started_at<? THEN 1 ELSE attempts+1 END,
    started_at=CASE WHEN started_at<? THEN ? ELSE started_at END RETURNING attempts`,
  )
    .bind(key, now(), now() - 900, now() - 900, now())
    .first<{ attempts: number }>();
  if (attempt!.attempts > 5)
    throw new HttpError(429, "Muitas tentativas. Aguarde 15 minutos.");
  if (!equal(await passwordHash(password, stored.split(":")[2]), stored))
    throw new HttpError(401, "Senha inválida.");
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_attempts WHERE client_key=?").bind(key),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(now()),
    env.DB.prepare(
      "INSERT INTO sessions(token_hash,expires_at,professional_id) VALUES (?,?,'demo')",
    ).bind(await digest(token), now() + 28800),
  ]);
  return token;
}
