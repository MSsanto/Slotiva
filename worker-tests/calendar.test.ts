import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import {
  calendarScope,
  calendarFailure,
  calendarStatus,
  startCalendar,
  completeCalendar,
  disconnectCalendar,
  calendarBusy,
  encryptCalendarToken,
  decryptCalendarToken,
} from "../worker/calendar";
import { digest, randomToken, type Principal } from "../worker/security";
import type { Env } from "../worker/types";
import { today } from "../worker/booking";
let mf: Miniflare,
  db: D1Database,
  pair: Awaited<ReturnType<typeof generateKeyPair>>,
  keys: ReturnType<typeof createLocalJWKSet>;
const base = "http://localhost",
  secret = "fixture-refresh-value",
  session = randomToken();
const a: Principal = {
  provider: "google",
  role: "professional",
  professionalId: "cal-a",
  subject: "cal-sub-a",
};
const b: Principal = { ...a, professionalId: "cal-b", subject: "cal-sub-b" };
const env = (): Env => ({
  DB: db,
  ASSETS: {} as Fetcher,
  AUTH_MODE: "google",
  COOKIE_SECURE: "false",
  PUBLIC_ORIGIN: base,
  GOOGLE_CLIENT_ID: "calendar-client",
  GOOGLE_CLIENT_SECRET: "fixture-client-secret",
  CALENDAR_TOKEN_KEY: btoa("k".repeat(32)),
});
const request = (path: string, token = session) =>
  new Request(base + path, {
    headers: { Origin: base, Cookie: `slotiva_session=${token}` },
  });
async function begin(p = a, token = session) {
  const r = await startCalendar(
    request("/api/admin/calendar/start", token),
    env(),
    p,
  );
  return new URL(r.headers.get("Location")!);
}
async function grant(auth: URL, extra: Record<string, unknown> = {}) {
  const id = await new SignJWT({
    nonce: auth.searchParams.get("nonce"),
    ...extra,
  })
    .setProtectedHeader({ alg: "RS256", kid: "fixture" })
    .setSubject(a.subject)
    .setAudience("calendar-client")
    .setIssuer("https://accounts.google.com")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(pair.privateKey);
  return {
    id_token: id,
    refresh_token: secret,
    scope: `openid ${calendarScope}`,
    token_type: "Bearer",
  };
}
const callback = (auth: URL, token = session) =>
  request(
    `/api/admin/calendar/callback?state=${auth.searchParams.get("state")}&code=fixture-code`,
    token,
  );
async function connection(p = a) {
  await db
    .prepare(
      "INSERT INTO calendar_connections(professional_id,subject,encrypted_refresh_token,generation) VALUES(?,?,?,?)",
    )
    .bind(
      p.professionalId,
      p.subject,
      await encryptCalendarToken(env(), p.professionalId!, p.subject, secret),
      crypto.randomUUID(),
    )
    .run();
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response('fixture')}}",
      compatibilityDate: "2026-10-19",
      d1Databases: ["DB"],
    }),
  );
  db = await mf.getD1Database("DB");
  for (const file of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(
      (await readFile(`migrations/${file}`, "utf8"))
        .replace(/--.*$/gm, "")
        .replace(/\s+/g, " "),
    );
  for (const p of [a, b])
    await db
      .prepare(
        "INSERT INTO professionals(id,slug,display_name,header_title,google_subject) VALUES(?,?,?,?,?)",
      )
      .bind(p.professionalId, p.professionalId, "Fixture", "Fixture", p.subject)
      .run();
  pair = await generateKeyPair("RS256");
  keys = createLocalJWKSet({
    keys: [
      { ...(await exportJWK(pair.publicKey)), alg: "RS256", kid: "fixture" },
    ],
  });
}, 30000);
beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM calendar_oauth_transactions"),
    db.prepare("DELETE FROM calendar_connections"),
    db.prepare("DELETE FROM sessions"),
    db.prepare(
      "UPDATE professionals SET status='active',version=version+1 WHERE id IN ('cal-a','cal-b')",
    ),
  ]);
  await db
    .prepare(
      "INSERT INTO sessions(token_hash,expires_at,provider,subject,role,professional_id) VALUES(?,unixepoch()+3600,'google',?,'professional',?)",
    )
    .bind(await digest(session), a.subject, a.professionalId)
    .run();
});
afterAll(async () => {
  await mf?.dispose();
});
it("requests only separate read-only consent with PKCE and offline access; configuration and role fail closed", async () => {
  const url = await begin();
  expect(url.searchParams.get("scope")).toBe(`openid ${calendarScope}`);
  expect(url.searchParams.get("access_type")).toBe("offline");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe(
    base + "/api/admin/calendar/callback",
  );
  expect(
    await calendarStatus({ ...env(), CALENDAR_TOKEN_KEY: undefined }, a),
  ).toMatchObject({ enabled: false, state: "disconnected" });
  await expect(
    startCalendar(request("/api/admin/calendar/start"), env(), {
      ...a,
      role: "master",
      professionalId: null,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    startCalendar(
      new Request(base + "/api/admin/calendar/start", {
        headers: { Origin: "https://evil.example" },
      }),
      env(),
      a,
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("encrypts credentials using a tenant/subject-bound authenticated envelope", async () => {
  const encrypted = await encryptCalendarToken(
    env(),
    a.professionalId!,
    a.subject,
    secret,
  );
  expect(encrypted).not.toContain(secret);
  expect(
    await decryptCalendarToken(env(), a.professionalId!, a.subject, encrypted),
  ).toBe(secret);
  await expect(
    decryptCalendarToken(env(), b.professionalId!, b.subject, encrypted),
  ).rejects.toThrow();
  await expect(
    decryptCalendarToken(
      { ...env(), CALENDAR_TOKEN_KEY: btoa("x".repeat(32)) },
      a.professionalId!,
      a.subject,
      encrypted,
    ),
  ).rejects.toThrow();
});
it("consumes state once, checks PKCE token exchange and stores only encrypted refresh credentials", async () => {
  const auth = await begin(),
    tokens = await grant(auth);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("code_verifier")).toBeTruthy();
      expect(body.get("redirect_uri")).toBe(
        base + "/api/admin/calendar/callback",
      );
      return Response.json(tokens);
    });
  await completeCalendar(callback(auth), env(), a, { fetch: fetcher, keys });
  const row = await db
    .prepare("SELECT * FROM calendar_connections")
    .first<{ encrypted_refresh_token: string }>();
  expect(row).toBeTruthy();
  expect(JSON.stringify(row)).not.toContain(secret);
  expect(await calendarStatus(env(), a)).toMatchObject({
    state: "connected",
    enabled: true,
  });
  expect(await calendarStatus(env(), b)).toMatchObject({
    state: "disconnected",
  });
  await expect(
    completeCalendar(callback(auth), env(), a, { fetch: fetcher, keys }),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejects a changed session or tenant before exchanging the code", async () => {
  const auth = await begin(),
    fetcher = vi.fn<typeof fetch>();
  await expect(
    completeCalendar(callback(auth, "wrong-session"), env(), a, {
      fetch: fetcher,
      keys,
    }),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    completeCalendar(callback(auth), env(), b, { fetch: fetcher, keys }),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects the wrong signed Google account without binding or storing credentials", async () => {
  const auth = await begin();
  const id = await new SignJWT({ nonce: auth.searchParams.get("nonce") })
    .setProtectedHeader({ alg: "RS256", kid: "fixture" })
    .setSubject(b.subject)
    .setAudience("calendar-client")
    .setIssuer("https://accounts.google.com")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(pair.privateKey);
  await expect(
    completeCalendar(callback(auth), env(), a, {
      keys,
      fetch: async () =>
        Response.json({ ...(await grant(auth)), id_token: id }),
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect((await calendarStatus(env(), a)).state).toBe("disconnected");
});
it("rejects denial, expired state, missing scope, absent refresh tokens and bad nonce", async () => {
  for (const kind of ["denied", "expired", "scope", "refresh", "nonce"]) {
    const auth = await begin(),
      tokens = await grant(auth, kind === "nonce" ? { nonce: "wrong" } : {});
    if (kind === "scope") tokens.scope = "openid";
    if (kind === "refresh") tokens.refresh_token = "";
    if (kind === "expired")
      await db
        .prepare("UPDATE calendar_oauth_transactions SET expires_at=0")
        .run();
    const req =
      kind === "denied"
        ? request(
            `/api/admin/calendar/callback?state=${auth.searchParams.get("state")}&error=access_denied`,
          )
        : callback(auth);
    await expect(
      completeCalendar(req, env(), a, {
        keys,
        fetch: async () => Response.json(tokens),
      }),
    ).rejects.toThrow();
    expect((await calendarStatus(env(), a)).state).toBe("disconnected");
  }
});
it("disconnect during an in-flight callback prevents reconnecting and preserves another tenant", async () => {
  await connection(b);
  const auth = await begin();
  await expect(
    completeCalendar(callback(auth), env(), a, {
      keys,
      fetch: async () => {
        await disconnectCalendar(env(), a);
        return Response.json(await grant(auth));
      },
    }),
  ).rejects.toMatchObject({ status: 401 });
  expect((await calendarStatus(env(), a)).state).toBe("disconnected");
  expect((await calendarStatus(env(), b)).state).toBe("connected");
});
it("logout during an in-flight callback prevents credential storage", async () => {
  const auth = await begin();
  await expect(
    completeCalendar(callback(auth), env(), a, {
      keys,
      fetch: async () => {
        await db.exec("DELETE FROM sessions");
        return Response.json(await grant(auth));
      },
    }),
  ).rejects.toMatchObject({ status: 401 });
  expect((await calendarStatus(env(), a)).state).toBe("disconnected");
});
it("returns only primary-calendar intervals and sends no event details or attendee requests", async () => {
  await connection();
  const date = today();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url, init) => {
      if (String(url).includes("oauth2"))
        return Response.json({
          access_token: "fixture-access",
          token_type: "Bearer",
        });
      expect(String(url)).toBe(
        "https://www.googleapis.com/calendar/v3/freeBusy",
      );
      expect(JSON.parse(String(init?.body))).toMatchObject({
        timeMin: `${date}T00:00:00-03:00`,
        items: [{ id: "primary" }],
      });
      return Response.json({
        calendars: {
          primary: {
            busy: [
              {
                start: `${date}T09:00:00-03:00`,
                end: `${date}T10:00:00-03:00`,
              },
            ],
          },
        },
      });
    });
  expect(await calendarBusy(env(), a, date, fetcher)).toMatchObject({
    date,
    busy: [{ start: expect.any(String), end: expect.any(String) }],
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("accepts a single canonical primary-calendar key without exposing its identifier", async () => {
  await connection();
  const result = await calendarBusy(env(), a, today(), async (url) =>
    String(url).includes("oauth2")
      ? Response.json({ access_token: "fixture", token_type: "Bearer" })
      : Response.json({ calendars: { "fixture@example.test": { busy: [] } } }),
  );
  expect(result.busy).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("fixture@example.test");
});

it("provider errors never mean free availability, and invalid_grant requires reconnection", async () => {
  for (const kind of ["invalid_grant", "http", "partial", "malformed"]) {
    await db.exec("DELETE FROM calendar_connections");
    await connection();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      String(url).includes("oauth2")
        ? kind === "invalid_grant"
          ? Response.json({ error: "invalid_grant" }, { status: 400 })
          : Response.json({ access_token: "fixture", token_type: "Bearer" })
        : kind === "http"
          ? new Response("provider details", { status: 500 })
          : kind === "partial"
            ? Response.json({
                calendars: {
                  primary: { errors: [{ reason: "notFound" }], busy: [] },
                },
              })
            : Response.json({ calendars: {} }),
    );
    await expect(
      calendarBusy(env(), a, today(), fetcher),
    ).rejects.toMatchObject({ status: 503 });
    expect((await calendarStatus(env(), a)).state).toBe(
      kind === "invalid_grant" ? "reconnect_required" : "connected",
    );
  }
});
it("disconnect and suspension invalidate credentials, including results already in flight", async () => {
  await connection();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    if (String(url).includes("oauth2"))
      return Response.json({ access_token: "fixture", token_type: "Bearer" });
    await disconnectCalendar(env(), a);
    return Response.json({ calendars: { primary: { busy: [] } } });
  });
  await expect(calendarBusy(env(), a, today(), fetcher)).rejects.toMatchObject({
    status: 409,
  });
  await connection();
  await begin();
  await db
    .prepare(
      "UPDATE professionals SET status='suspended',version=version+1 WHERE id=?",
    )
    .bind(a.professionalId)
    .run();
  expect((await calendarStatus(env(), a)).state).toBe("disconnected");
  expect(
    (await db.prepare("SELECT * FROM calendar_oauth_transactions").all())
      .results,
  ).toHaveLength(0);
});
it("rejects invalid dates and credentials encrypted under a different key", async () => {
  await connection();
  for (const date of ["invalid", "2000-01-01", "2100-01-01"])
    await expect(calendarBusy(env(), a, date)).rejects.toMatchObject({
      status: 422,
    });
  await expect(
    calendarBusy(
      { ...env(), CALENDAR_TOKEN_KEY: btoa("x".repeat(32)) },
      a,
      today(),
    ),
  ).rejects.toMatchObject({ status: 503 });
  expect((await calendarStatus(env(), a)).state).toBe("reconnect_required");
});

it("reports allowlisted exchange failures without leaking provider text and consumes state", async () => {
  for (const [provider, expected] of [
    ["invalid_client", "exchange_invalid_client"],
    ["invalid_grant", "exchange_invalid_grant"],
    ["unauthorized_client", "exchange_unauthorized_client"],
    ["redirect_uri_mismatch", "exchange_redirect_uri_mismatch"],
    ["secret-injected-text", "exchange"],
    ["__proto__", "exchange"],
  ]) {
    const auth = await begin();
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          error: provider,
          error_description: secret,
        },
        { status: 400 },
      ),
    );
    let failure: unknown;
    try {
      await completeCalendar(callback(auth), env(), a, {
        fetch: fetcher,
        keys,
      });
    } catch (error) {
      failure = error;
    }
    const response = calendarFailure(failure);
    expect(response.headers.get("Location")).toBe(
      `/admin?calendar=failed&calendar_reason=${expected}`,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(JSON.stringify([...response.headers])).not.toContain(secret);
    await expect(
      completeCalendar(callback(auth), env(), a, { fetch: fetcher, keys }),
    ).rejects.toMatchObject({ stage: "transaction" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await calendarStatus(env(), a)).state).toBe("disconnected");
  }
});
it("distinguishes consent, grant, scope, identity and account failures", async () => {
  for (const stage of ["consent", "grant", "scope", "identity", "account"]) {
    const auth = await begin();
    const tokens = await grant(
      auth,
      stage === "identity"
        ? { nonce: "wrong" }
        : stage === "account"
          ? { sub: b.subject }
          : {},
    );
    if (stage === "account")
      tokens.id_token = await new SignJWT({
        nonce: auth.searchParams.get("nonce"),
      })
        .setProtectedHeader({ alg: "RS256", kid: "fixture" })
        .setSubject(b.subject)
        .setAudience("calendar-client")
        .setIssuer("https://accounts.google.com")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(pair.privateKey);
    if (stage === "grant") tokens.refresh_token = "";
    if (stage === "scope") tokens.scope = "openid";
    const req =
      stage === "consent"
        ? request(
            `/api/admin/calendar/callback?state=${auth.searchParams.get("state")}&error=arbitrary-secret`,
          )
        : callback(auth);
    try {
      await completeCalendar(req, env(), a, {
        keys,
        fetch: async () => Response.json(tokens),
      });
      expect.unreachable();
    } catch (error) {
      expect(calendarFailure(error).headers.get("Location")).toBe(
        `/admin?calendar=failed&calendar_reason=${stage}`,
      );
    }
    expect((await calendarStatus(env(), a)).state).toBe("disconnected");
  }
});
it("does not reflect arbitrary failures or query text", () => {
  expect(calendarFailure(new Error(secret)).headers.get("Location")).toBe(
    "/admin?calendar=failed&calendar_reason=internal",
  );
});
