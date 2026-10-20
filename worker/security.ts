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
export async function requireAdmin(request: Request, env: Env) {
  const result = await env.DB.prepare(
    "SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await digest(cookieToken(request)), now())
    .first();
  if (!result) throw new HttpError(401, "Entre para acessar a agenda.");
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
    env.DB.prepare("INSERT INTO sessions VALUES (?,?)").bind(
      await digest(token),
      now() + 28800,
    ),
  ]);
  return token;
}
