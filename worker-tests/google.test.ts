import worker from "../worker/index";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
} from "jose";
import {
  startGoogleLogin,
  completeGoogleLogin,
  verifyGoogleIdentity,
  googleEnabled,
  googleFailure,
} from "../worker/google";
import {
  digest,
  login,
  passwordEnabled,
  requireAdmin,
} from "../worker/security";
import type { Env } from "../worker/types";

let mf: Miniflare;
let db: D1Database;
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let keys: ReturnType<typeof createLocalJWKSet>;
const base = "http://localhost";
const env = (): Env => ({
  DB: db,
  ASSETS: {} as Fetcher,
  COOKIE_SECURE: "false",
  AUTH_MODE: "google",
  PUBLIC_ORIGIN: base,
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret-not-live",
  MASTER_GOOGLE_SUBS: "master-1",
});
const startRequest = (headers = { Origin: base }) =>
  new Request(base + "/api/admin/google/start", { method: "POST", headers });
async function signed(
  nonce: string,
  overrides: JWTPayload = {},
  key = pair.privateKey,
) {
  return new SignJWT({
    iss: "https://accounts.google.com",
    aud: "test-client",
    sub: "professional-1",
    nonce,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .sign(key);
}
async function begin() {
  const response = await startGoogleLogin(startRequest(), env());
  const location = new URL(response.headers.get("Location")!);
  const cookie = response.headers.get("Set-Cookie")!.split(";")[0];
  const state = location.searchParams.get("state")!;
  const transaction = await db
    .prepare("SELECT nonce,verifier FROM oauth_transactions WHERE state_hash=?")
    .bind(await digest(state))
    .first<{ nonce: string; verifier: string }>();
  return {
    response,
    location,
    cookie,
    state,
    transaction: transaction!,
    request: new Request(
      base +
        "/api/admin/google/callback?" +
        new URLSearchParams({ state, code: "offline-test-code" }),
      { headers: { Cookie: cookie } },
    ),
  };
}
function transport(token: string) {
  return vi.fn<typeof fetch>(async () => Response.json({ id_token: token }));
}
beforeAll(async () => {
  pair = await generateKeyPair("RS256", { extractable: true });
  keys = createLocalJWKSet({
    keys: [
      {
        ...(await exportJWK(pair.publicKey)),
        kid: "test-key",
        alg: "RS256",
        use: "sig",
      },
    ],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('test'); } };",
      compatibilityDate: "2026-10-19",
      d1Databases: ["DB"],
      host: "127.0.0.1",
    }),
  );
  db = await mf.getD1Database("DB");
  for (const path of (await readdir("migrations"))
    .filter((p) => p.endsWith(".sql"))
    .sort())
    await db.exec(
      (await readFile("migrations/" + path, "utf8"))
        .replace(/--.*$/gm, "")
        .replace(/\s+/g, " "),
    );
}, 30000);
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await db
    .prepare(
      "UPDATE professionals SET status='active',google_subject='professional-1',version=version+1 WHERE id='demo'",
    )
    .run();
  await db.batch([
    db.prepare("DELETE FROM oauth_transactions"),
    db.prepare("DELETE FROM oauth_attempts"),
    db.prepare("DELETE FROM sessions"),
  ]);
});

describe("Google professional authentication", () => {
  it("reports Google-only setup without exposing secrets or enabling the password endpoint", async () => {
    const configuration = { ...env(), GOOGLE_CLIENT_SECRET: undefined };
    const response = await worker.fetch(
      new Request(base + "/api/auth/config"),
      configuration,
    );
    expect(await response.json()).toEqual({
      googleEnabled: false,
      passwordEnabled: false,
    });
    const loginResponse = await worker.fetch(
      new Request(base + "/api/admin/login", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({ password: "test-password-long" }),
      }),
      configuration,
    );
    expect(loginResponse.status).toBe(403);
    const startResponse = await worker.fetch(startRequest(), configuration);
    expect(startResponse.status).toBe(503);
  });

  it("fails closed without complete settings or an HTTPS public origin", async () => {
    expect(googleEnabled({ ...env(), GOOGLE_CLIENT_SECRET: undefined })).toBe(
      false,
    );
    expect(googleEnabled({ ...env(), MASTER_GOOGLE_SUBS: "" })).toBe(false);
    expect(
      googleEnabled({ ...env(), PUBLIC_ORIGIN: "https://example.com/path" }),
    ).toBe(false);
    expect(
      googleEnabled({ ...env(), PUBLIC_ORIGIN: "http://example.com" }),
    ).toBe(false);
    expect(
      googleEnabled({
        ...env(),
        PUBLIC_ORIGIN: "https://example.com",
        COOKIE_SECURE: "true",
      }),
    ).toBe(true);
    expect(passwordEnabled(env())).toBe(false);
    expect(passwordEnabled({ ...env(), AUTH_MODE: "typo" })).toBe(false);
    await expect(
      startGoogleLogin(startRequest(), {
        ...env(),
        GOOGLE_CLIENT_SECRET: undefined,
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("binds state to browser, adds nonce/PKCE, and requests identity scopes only", async () => {
    const b = await begin();
    expect(b.response.status).toBe(303);
    expect(b.location.origin).toBe("https://accounts.google.com");
    expect(b.location.searchParams.get("scope")).toBe("openid email profile");
    expect(b.location.searchParams.get("redirect_uri")).toBe(
      base + "/api/admin/google/callback",
    );
    expect(b.location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(b.location.searchParams.get("code_challenge")).toHaveLength(43);
    expect(b.location.searchParams.get("nonce")).toBe(b.transaction.nonce);
    const stored = await db
      .prepare(
        "SELECT state_hash,browser_hash,expires_at FROM oauth_transactions",
      )
      .first<{
        state_hash: string;
        browser_hash: string;
        expires_at: number;
      }>();
    expect(stored!.state_hash).not.toBe(b.state);
    expect(stored!.browser_hash).not.toBe(b.cookie.split("=")[1]);
    expect(stored!.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(b.response.headers.get("Set-Cookie")).toContain(
      "HttpOnly; SameSite=Lax; Path=/api/admin/google",
    );
  });
  it("rejects missing Origin, cross-origin start and mismatched canonical host", async () => {
    await expect(
      startGoogleLogin(
        startRequest({ Origin: "https://attacker.test" }),
        env(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      startGoogleLogin(startRequest({ Origin: "" }), env()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      startGoogleLogin(startRequest(), {
        ...env(),
        PUBLIC_ORIGIN: "https://example.com",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("validates the signature and identity, exchanges PKCE, rotates session, and supports logout revocation", async () => {
    const b = await begin(),
      fetcher = transport(await signed(b.transaction.nonce));
    await db
      .prepare(
        "INSERT INTO sessions(token_hash,expires_at,professional_id) VALUES (?,?,'demo')",
      )
      .bind(await digest("old-session"), Math.floor(Date.now() / 1000) + 3600)
      .run();
    const req = new Request(b.request.url, {
      headers: { Cookie: b.cookie + "; slotiva_session=old-session" },
    });
    const response = await completeGoogleLogin(req, env(), {
      fetch: fetcher,
      keys,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(base + "/admin");
    const body = fetcher.mock.calls[0][1]!.body as URLSearchParams;
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://oauth2.googleapis.com/token",
    );
    expect(body.get("code_verifier")).toBe(b.transaction.verifier);
    const sessionCookie = response.headers
      .getSetCookie()
      .find((c) => c.startsWith("slotiva_session="))!
      .split(";")[0];
    const row = await db
      .prepare("SELECT provider,subject,token_hash FROM sessions")
      .first<{ provider: string; subject: string; token_hash: string }>();
    expect(row!.provider).toBe("google");
    expect(row!.subject).toBe("professional-1");
    expect(row!.token_hash).not.toBe(sessionCookie.split("=")[1]);
    expect(
      await db
        .prepare("SELECT 1 FROM sessions WHERE token_hash=?")
        .bind(await digest("old-session"))
        .first(),
    ).toBeNull();
    const reqSession = new Request(base + "/api/admin/session", {
      headers: { Cookie: sessionCookie },
    });
    await expect(requireAdmin(reqSession, env())).resolves.toMatchObject({
      role: "professional",
    });
    await expect(
      requireAdmin(reqSession, {
        ...env(),
        MASTER_GOOGLE_SUBS: "professional-1",
      }),
    ).rejects.toMatchObject({ status: 401 });
    await db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(row!.token_hash)
      .run();
    await expect(requireAdmin(reqSession, env())).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      completeGoogleLogin(b.request, env(), { fetch: fetcher, keys }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["wrong audience", { aud: "other-client" }, 401],
    ["wrong issuer", { iss: "https://attacker.test" }, 401],
    ["expired token", { exp: 1 }, 401],
    ["wrong nonce", { nonce: "wrong" }, 401],
    ["uninvited subject", { sub: "someone-else" }, 403],
    [
      "email match is not authorization",
      { sub: "someone-else", email: "owner@example.com", email_verified: true },
      403,
    ],
    ["missing expiration", { exp: undefined }, 401],
    ["multiple audiences without azp", { aud: ["test-client", "other"] }, 401],
    ["wrong authorized party", { azp: "other" }, 401],
  ])("rejects %s", async (_, claims, status) => {
    await expect(
      verifyGoogleIdentity(
        await signed("expected", claims as JWTPayload),
        env(),
        "expected",
        keys,
      ),
    ).rejects.toMatchObject({ status });
  });
  it("rejects forged signatures even with matching issuer/audience/subject", async () => {
    const other = await generateKeyPair("RS256");
    await expect(
      verifyGoogleIdentity(
        await signed("expected", {}, other.privateKey),
        env(),
        "expected",
        keys,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("rejects another browser and an expired state before exchanging any code", async () => {
    const b = await begin(),
      fetcher = transport(await signed(b.transaction.nonce));
    await expect(
      completeGoogleLogin(
        new Request(b.request.url, {
          headers: { Cookie: "slotiva_oauth=" + "0".repeat(64) },
        }),
        env(),
        { fetch: fetcher, keys },
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
    await db.prepare("UPDATE oauth_transactions SET expires_at=1").run();
    await expect(
      completeGoogleLogin(b.request, env(), { fetch: fetcher, keys }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("consumes concurrent callbacks once", async () => {
    const b = await begin(),
      fetcher = transport(await signed(b.transaction.nonce));
    const responses = await Promise.allSettled([
      completeGoogleLogin(b.request, env(), { fetch: fetcher, keys }),
      completeGoogleLogin(b.request, env(), { fetch: fetcher, keys }),
    ]);
    expect(responses.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      (await db
        .prepare("SELECT count(*) as n FROM sessions")
        .first<{ n: number }>())!.n,
    ).toBe(1);
  });
  it.each([
    ["expired state", "transaction"],
    ["provider rejection", "exchange"],
    ["network failure", "exchange_unavailable"],
    ["invalid identity", "identity"],
    ["unauthorized account", "authorization"],
    ["session storage failure", "session"],
    ["missing configuration", "configuration"],
    ["wrong callback origin", "origin"],
  ])(
    "reports a safe callback stage for %s without leaking credentials",
    async (scenario, stage) => {
      const b = await begin();
      const current = env();
      let request = b.request;
      let fetcher: typeof fetch = transport(await signed(b.transaction.nonce));
      if (scenario === "expired state")
        await db.prepare("UPDATE oauth_transactions SET expires_at=1").run();
      if (scenario === "provider rejection")
        fetcher = vi.fn(
          async () => new Response("sensitive-provider-body", { status: 400 }),
        );
      if (scenario === "network failure")
        fetcher = vi.fn(async () => {
          throw new Error("private-network-error");
        });
      if (scenario === "invalid identity")
        fetcher = transport(await signed("wrong-nonce"));
      if (scenario === "unauthorized account")
        fetcher = transport(
          await signed(b.transaction.nonce, { sub: "uninvited-account" }),
        );
      if (scenario === "session storage failure")
        current.DB = new Proxy(db, {
          get(target, prop) {
            if (prop === "batch")
              return () => {
                throw new Error("sensitive-database-error");
              };
            const value = Reflect.get(target, prop);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      if (scenario === "missing configuration")
        delete current.GOOGLE_CLIENT_SECRET;
      if (scenario === "wrong callback origin")
        request = new Request(
          b.request.url.replace(base, "http://other.test"),
          { headers: { Cookie: b.cookie } },
        );
      const error = await completeGoogleLogin(request, current, {
        fetch: fetcher,
        keys,
      }).catch((error) => error);
      expect(error).toBeInstanceOf(Error);
      const response = googleFailure(current, error);
      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe(
        `/admin?google=failed&reason=${stage}`,
      );
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
      expect(await db.prepare("SELECT 1 FROM sessions").first()).toBeNull();
    },
  );
  it.each([
    ["invalid_client", 401, "exchange_invalid_client"],
    ["invalid_grant", 400, "exchange_invalid_grant"],
    ["unauthorized_client", 400, "exchange_unauthorized_client"],
    ["redirect_uri_mismatch", 400, "exchange_redirect_uri_mismatch"],
    ["invalid_request", 400, "exchange_invalid_request"],
    ["unrecognized-private-value", 400, "exchange"],
    ["invalid_client&token=private", 400, "exchange"],
    [null, 400, "exchange"],
    ["server_error", 503, "exchange_unavailable"],
    ["rate_limited", 429, "exchange_unavailable"],
  ])(
    "allowlists token endpoint error %s with HTTP %s",
    async (providerCode, status, stage) => {
      const b = await begin();
      const fetcher = vi.fn(async () =>
        Response.json(
          {
            error: providerCode,
            error_description: "private-provider-description",
            access_token: "private-token",
            error_uri: "https://private.example",
          },
          { status },
        ),
      );
      const error = await completeGoogleLogin(b.request, env(), {
        fetch: fetcher,
        keys,
      }).catch((error) => error);
      expect(googleFailure(env(), error).headers.get("Location")).toBe(
        `/admin?google=failed&reason=${stage}`,
      );
      expect(await db.prepare("SELECT 1 FROM sessions").first()).toBeNull();
      expect(
        await db.prepare("SELECT 1 FROM oauth_transactions").first(),
      ).toBeNull();
      await expect(
        completeGoogleLogin(b.request, env(), { fetch: fetcher, keys }),
      ).rejects.toMatchObject({ stage: "transaction" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("does not reflect arbitrary errors or query text in failure redirects", async () => {
    const error = new Error("sensitive-token code=private&reason=attacker");
    expect(googleFailure(env(), error).headers.get("Location")).toBe(
      "/admin?google=failed&reason=internal",
    );
    const response = await worker.fetch(
      new Request(
        base +
          "/api/admin/google/callback?state=private&code=secret&reason=attacker",
      ),
      env(),
    );
    expect(response.headers.get("Location")).toBe(
      "/admin?google=failed&reason=transaction",
    );
  });
  it("closes password login and legacy password sessions in Google mode", async () => {
    await expect(
      login(startRequest(), env(), "any-password"),
    ).rejects.toMatchObject({ status: 403 });
    await db
      .prepare(
        "INSERT INTO sessions(token_hash,expires_at,professional_id) VALUES (?,?,'demo')",
      )
      .bind(await digest("legacy"), Math.floor(Date.now() / 1000) + 3600)
      .run();
    await expect(
      requireAdmin(
        new Request(base, { headers: { Cookie: "slotiva_session=legacy" } }),
        env(),
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      requireAdmin(
        new Request(base, { headers: { Cookie: "slotiva_session=legacy" } }),
        { ...env(), AUTH_MODE: "demo" },
      ),
    ).resolves.toMatchObject({ role: "professional" });
  });
  it("limits starts and does not create a session when the provider fails", async () => {
    const b = await begin();
    await expect(
      completeGoogleLogin(b.request, env(), {
        fetch: vi.fn(async () => {
          throw new Error("provider unavailable");
        }),
        keys,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(await db.prepare("SELECT 1 FROM sessions").first()).toBeNull();
    for (let i = 1; i < 10; i++) await startGoogleLogin(startRequest(), env());
    await expect(startGoogleLogin(startRequest(), env())).rejects.toMatchObject(
      { status: 429 },
    );
  });
});
