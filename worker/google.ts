import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import {
  masterGoogleSubjects,
  authorizeGoogleAccount,
  cookieToken,
  digest,
  equal,
  origin,
  randomToken,
} from "./security";
import { HttpError, now, type Env } from "./types";

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  { timeoutDuration: 5000 },
);
const callbackPath = "/api/admin/google/callback";
const oauthCookie = "slotiva_oauth";

function settings(env: Env) {
  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.PUBLIC_ORIGIN ||
    !masterGoogleSubjects(env).length
  )
    throw new HttpError(503, "Acesso Google ainda não configurado.");
  let url: URL;
  try {
    url = new URL(env.PUBLIC_ORIGIN);
  } catch {
    throw new HttpError(503, "Origem pública não configurada.");
  }
  const local =
    env.COOKIE_SECURE === "false" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.origin !== env.PUBLIC_ORIGIN ||
    url.username ||
    url.password
  )
    throw new HttpError(503, "Origem pública inválida.");
  return {
    origin: url.origin,
    redirect: url.origin + callbackPath,
    clientId: env.GOOGLE_CLIENT_ID,
    secret: env.GOOGLE_CLIENT_SECRET,
  };
}
export function googleEnabled(env: Env) {
  try {
    settings(env);
    return true;
  } catch {
    return false;
  }
}
function cookie(request: Request) {
  return (
    request.headers
      .get("Cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(oauthCookie + "="))
      ?.slice(oauthCookie.length + 1) || ""
  );
}
function secure(env: Env) {
  return env.COOKIE_SECURE === "false" ? "" : "; Secure";
}
type LoginStage =
  | "configuration"
  | "origin"
  | "transaction"
  | "exchange"
  | "exchange_invalid_client"
  | "exchange_invalid_grant"
  | "exchange_unauthorized_client"
  | "exchange_redirect_uri_mismatch"
  | "exchange_invalid_request"
  | "exchange_unavailable"
  | "identity"
  | "authorization"
  | "session";

class GoogleLoginFailure extends HttpError {
  readonly stage: LoginStage;
  constructor(stage: LoginStage, error: unknown) {
    super(
      error instanceof HttpError ? error.status : 500,
      "Não foi possível concluir o acesso Google.",
    );
    this.stage = stage;
  }
}

export function googleFailure(env: Env, error?: unknown) {
  // Only a fixed stage is exposed; never propagate provider responses or errors.
  const reason = error instanceof GoogleLoginFailure ? error.stage : "internal";
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/admin?google=failed&reason=${reason}`,
      "Cache-Control": "no-store",
      "Set-Cookie": `${oauthCookie}=; HttpOnly; SameSite=Lax; Path=/api/admin/google; Max-Age=0${secure(env)}`,
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function startGoogleLogin(request: Request, env: Env) {
  origin(request);
  const cfg = settings(env);
  if (new URL(request.url).origin !== cfg.origin)
    throw new HttpError(403, "Origem não autorizada.");
  const at = now();
  const client = await digest(
    request.headers.get("CF-Connecting-IP") || "local",
  );
  const attempt = await env.DB.prepare(
    `INSERT INTO oauth_attempts VALUES (?,1,?) ON CONFLICT(client_key) DO UPDATE SET
    attempts=CASE WHEN started_at<? THEN 1 ELSE attempts+1 END,
    started_at=CASE WHEN started_at<? THEN ? ELSE started_at END RETURNING attempts`,
  )
    .bind(client, at, at - 900, at - 900, at)
    .first<{ attempts: number }>();
  if (attempt!.attempts > 10)
    throw new HttpError(429, "Muitas tentativas. Aguarde 15 minutos.");
  const state = randomToken(),
    browser = randomToken(),
    nonce = randomToken(),
    verifier = randomToken();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_transactions WHERE expires_at<=?").bind(
      at,
    ),
    env.DB.prepare("DELETE FROM oauth_attempts WHERE started_at<?").bind(
      at - 900,
    ),
    env.DB.prepare("INSERT INTO oauth_transactions VALUES (?,?,?,?,?)").bind(
      await digest(state),
      await digest(browser),
      nonce,
      verifier,
      at + 600,
    ),
  ]);
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  const challengeBytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const challenge = btoa(String.fromCharCode(...challengeBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  auth.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirect,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return new Response(null, {
    status: 303,
    headers: {
      Location: auth.toString(),
      "Set-Cookie": `${oauthCookie}=${browser}; HttpOnly; SameSite=Lax; Path=/api/admin/google; Max-Age=600${secure(env)}`,
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function verifyGoogleIdentity(
  token: string,
  env: Env,
  nonce: string,
  keys: JWTVerifyGetKey = googleKeys,
) {
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"],
      audience: env.GOOGLE_CLIENT_ID,
      issuer: ["accounts.google.com", "https://accounts.google.com"],
      requiredClaims: ["sub", "iat", "exp", "nonce"],
      maxTokenAge: "10m",
    });
    if (
      typeof payload.sub !== "string" ||
      !payload.sub ||
      typeof payload.nonce !== "string" ||
      !equal(payload.nonce, nonce) ||
      ((payload.azp !== undefined ||
        (Array.isArray(payload.aud) && payload.aud.length > 1)) &&
        payload.azp !== env.GOOGLE_CLIENT_ID)
    )
      throw new Error("Invalid identity");
    return await authorizeGoogleAccount(env, { ...payload, sub: payload.sub });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      401,
      "Não foi possível validar o acesso Google. Tente novamente.",
    );
  }
}

// Dependency injection is used by offline tests only, never selected through HTTP or env values.
export async function completeGoogleLogin(
  request: Request,
  env: Env,
  deps: { fetch: typeof fetch; keys: JWTVerifyGetKey } = {
    fetch,
    keys: googleKeys,
  },
) {
  let stage: LoginStage = "configuration";
  try {
    const cfg = settings(env),
      url = new URL(request.url);
    stage = "origin";
    if (url.origin !== cfg.origin)
      throw new HttpError(403, "Origem não autorizada.");
    stage = "transaction";
    const state = url.searchParams.get("state") || "",
      browser = cookie(request),
      code = url.searchParams.get("code") || "";
    if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(browser))
      throw new HttpError(401, "Acesso expirado ou inválido.");
    const transaction = await env.DB.prepare(
      "DELETE FROM oauth_transactions WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING nonce,verifier",
    )
      .bind(await digest(state), await digest(browser), now())
      .first<{ nonce: string; verifier: string }>();
    if (
      !transaction ||
      !code ||
      code.length > 4096 ||
      url.searchParams.has("error")
    )
      throw new HttpError(401, "Acesso expirado ou inválido.");
    stage = "exchange";
    let response: Response;
    try {
      response = await deps.fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        signal: AbortSignal.timeout(8000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: cfg.clientId,
          client_secret: cfg.secret,
          redirect_uri: cfg.redirect,
          grant_type: "authorization_code",
          code_verifier: transaction.verifier,
        }),
      });
    } catch {
      stage = "exchange_unavailable";
      throw new HttpError(503, "Google temporariamente indisponível.");
    }
    if (!response.ok) {
      // The provider body is untrusted. Reflect only these exact fixed codes,
      // never error_description, error_uri or any other response value.
      const providerError: unknown = await response.json().catch(() => null);
      const code =
        providerError &&
        typeof providerError === "object" &&
        "error" in providerError
          ? providerError.error
          : undefined;
      switch (code) {
        case "invalid_client":
          stage = "exchange_invalid_client";
          break;
        case "invalid_grant":
          stage = "exchange_invalid_grant";
          break;
        case "unauthorized_client":
          stage = "exchange_unauthorized_client";
          break;
        case "redirect_uri_mismatch":
          stage = "exchange_redirect_uri_mismatch";
          break;
        case "invalid_request":
          stage = "exchange_invalid_request";
          break;
        default:
          if (response.status >= 500 || response.status === 429)
            stage = "exchange_unavailable";
      }
      throw new HttpError(401, "Acesso Google recusado. Tente novamente.");
    }
    let idToken: unknown;
    try {
      idToken = ((await response.json()) as { id_token?: unknown }).id_token;
    } catch {
      throw new HttpError(401, "Resposta Google inválida.");
    }
    if (typeof idToken !== "string" || idToken.length > 16384)
      throw new HttpError(401, "Resposta Google inválida.");
    stage = "identity";
    const principal = await verifyGoogleIdentity(
      idToken,
      env,
      transaction.nonce,
      deps.keys,
    );
    stage = "session";
    const session = randomToken();
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM sessions WHERE token_hash=? OR expires_at<=?",
      ).bind(await digest(cookieToken(request)), now()),
      env.DB.prepare(
        "INSERT INTO sessions(token_hash,expires_at,provider,subject,role,professional_id) VALUES (?,?,'google',?,?,?)",
      ).bind(
        await digest(session),
        now() + 28800,
        principal.subject,
        principal.role,
        principal.professionalId,
      ),
    ]);
    const headers = new Headers({
      Location:
        cfg.origin + (principal.role === "master" ? "/master" : "/admin"),
      "Referrer-Policy": "no-referrer",
    });
    headers.append(
      "Set-Cookie",
      `slotiva_session=${session}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=28800${secure(env)}`,
    );
    headers.append(
      "Set-Cookie",
      `slotiva_session=; HttpOnly; SameSite=Lax; Path=/api/admin; Max-Age=0${secure(env)}`,
    );
    headers.append(
      "Set-Cookie",
      `${oauthCookie}=; HttpOnly; SameSite=Lax; Path=/api/admin/google; Max-Age=0${secure(env)}`,
    );
    return new Response(null, { status: 303, headers });
  } catch (error) {
    // Identity verification grants authorization only after cryptographic checks.
    // A denied principal has a fixed 403; no subject/email is exposed.
    if (
      stage === "identity" &&
      error instanceof HttpError &&
      error.status === 403
    )
      stage = "authorization";
    throw new GoogleLoginFailure(stage, error);
  }
}
