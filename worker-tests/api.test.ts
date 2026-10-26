import { readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { passwordHash } from "../worker/security";
import worker from "../worker/index";
import type { Env } from "../worker/types";
import { today } from "../worker/booking";
let mf: Miniflare;
let db: D1Database;
const base = "http://localhost";
const origin = { Origin: base };
function day() {
  const d = new Date(`${today()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 2);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while ([0, 6].includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}
const payload = (time = "09:00", serviceId = "consulting") => ({
  serviceId,
  serviceVersion: 1,
  date: day(),
  time,
  name: "Demo",
  email: "demo@example.com",
});
function request(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return mf.dispatchFetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function admin() {
  const r = await request(
    "/api/admin/login",
    "POST",
    { password: "test-password-long" },
    origin,
  );
  expect(r.status).toBe(204);
  return { ...origin, Cookie: r.headers.get("Set-Cookie")!.split(";")[0] };
}
beforeAll(async () => {
  const bundle = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-10-19",
      d1Databases: ["DB", "LEGACY"],
      bindings: {
        COOKIE_SECURE: "false",
        ADMIN_PASSWORD_HASH: await passwordHash("test-password-long"),
      },
      host: "127.0.0.1",
    }),
  );
  db = await mf.getD1Database("DB");
  // D1 exec treats newline-separated input as separate statements; keep the full migration on one line.
  for (const file of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(`migrations/${file}`, "utf8");
    await db.exec(sql.replace(/--.*$/gm, "").replace(/\s+/g, " "));
  }
}, 30000);
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM calendar_jobs"),
    db.prepare("DELETE FROM notification_outbox"),
    db.prepare("DELETE FROM booking_events"),
    db.prepare("DELETE FROM occupied_slots"),
    db.prepare("DELETE FROM bookings"),
    db.prepare("DELETE FROM sessions"),
    db.prepare("DELETE FROM login_attempts"),
    db.prepare(
      "UPDATE weekly_hours SET opens=540,closes=1020,enabled=CASE WHEN weekday<5 THEN 1 ELSE 0 END",
    ),
  ]);
});
describe("Cloudflare Worker + D1", () => {
  it("accepts only one of two simultaneous reservations", async () => {
    const results = await Promise.all([
      request("/api/bookings", "POST", payload()),
      request("/api/bookings", "POST", payload()),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      (await db
        .prepare("SELECT count(*) AS n FROM bookings")
        .first<{ n: number }>())!.n,
    ).toBe(1);
    expect(
      (await db
        .prepare("SELECT count(*) AS n FROM occupied_slots")
        .first<{ n: number }>())!.n,
    ).toBe(5);
  });
  it("rejects overlapping direct SQL inserts and rolls back their triggers", async () => {
    const statement = () =>
      db
        .prepare(
          `INSERT INTO bookings(id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,approval_expires_at,service_name,service_description,service_duration,service_price_mode,service_price_cents,service_version) VALUES (?,'consulting',?,0,9999999999,540,600,615,'Demo','demo@example.com','hash',unixepoch()+86400,'Consultoria individual','Tempo dedicado para transformar ideias em próximos passos.',60,'paid',15000,1)`,
        )
        .bind(crypto.randomUUID(), day());
    const results = await Promise.allSettled([
      statement().run(),
      statement().run(),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db
        .prepare("SELECT count(*) AS n FROM bookings")
        .first<{ n: number }>())!.n,
    ).toBe(1);
    expect(
      (await db
        .prepare("SELECT count(*) AS n FROM occupied_slots")
        .first<{ n: number }>())!.n,
    ).toBe(5);
  });
  it("includes buffer, rejects wrong token and releases cancelled slots", async () => {
    const first = (await (
      await request("/api/bookings", "POST", payload())
    ).json()) as { id: string; cancelToken: string };
    expect(
      (await request("/api/bookings", "POST", payload("10:00", "discovery")))
        .status,
    ).toBe(409);
    expect(
      (await request("/api/bookings", "POST", payload("10:30", "discovery")))
        .status,
    ).toBe(201);
    expect(
      (
        await request(`/api/bookings/${first.id}`, "DELETE", undefined, {
          "X-Cancel-Token": "a".repeat(64),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/api/bookings/${first.id}`, "DELETE", undefined, {
          "X-Cancel-Token": first.cancelToken,
        })
      ).status,
    ).toBe(204);
    expect((await request("/api/bookings", "POST", payload())).status).toBe(
      201,
    );
  });
  it("preserves the original booking and occupied intervals on reschedule conflict", async () => {
    const first = (await (
      await request("/api/bookings", "POST", payload())
    ).json()) as { id: string; cancelToken: string };
    await request("/api/bookings", "POST", payload("11:00"));
    const headers = { "X-Cancel-Token": first.cancelToken };
    expect(
      (
        await request(
          `/api/bookings/${first.id}`,
          "PUT",
          { date: day(), time: "11:00" },
          headers,
        )
      ).status,
    ).toBe(409);
    expect(
      (await db
        .prepare("SELECT start_min FROM bookings WHERE id=?")
        .bind(first.id)
        .first<{ start_min: number }>())!.start_min,
    ).toBe(540);
    expect(
      (await db
        .prepare("SELECT count(*) AS n FROM occupied_slots WHERE booking_id=?")
        .bind(first.id)
        .first<{ n: number }>())!.n,
    ).toBe(5);
    expect(
      (
        await request(
          `/api/bookings/${first.id}`,
          "PUT",
          { date: day(), time: "13:00" },
          headers,
        )
      ).status,
    ).toBe(200);
  });
  it("requires login and exact Origin, persists sessions and revokes logout", async () => {
    expect((await request("/api/admin/bookings")).status).toBe(401);
    expect(
      (
        await request("/api/admin/login", "POST", {
          password: "test-password-long",
        })
      ).status,
    ).toBe(403);
    const headers = await admin();
    expect(
      (await request("/api/admin/bookings", "GET", undefined, headers)).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/api/admin/hours",
          "PUT",
          { weekdays: [0, 1, 2, 3, 4], opens: "10:00", closes: "16:00" },
          { Cookie: headers.Cookie },
        )
      ).status,
    ).toBe(403);
    expect(
      (await request("/api/admin/logout", "POST", undefined, headers)).status,
    ).toBe(204);
    expect(
      (await request("/api/admin/bookings", "GET", undefined, headers)).status,
    ).toBe(401);
  });
  it("updates hours atomically and preserves existing reservations", async () => {
    await request("/api/bookings", "POST", payload());
    const headers = await admin();
    expect(
      (
        await request(
          "/api/admin/hours",
          "PUT",
          { weekdays: [0, 1, 2, 3, 4], opens: "10:00", closes: "17:00" },
          headers,
        )
      ).status,
    ).toBe(409);
    const hours = (await (
      await request("/api/admin/hours", "GET", undefined, headers)
    ).json()) as { opens: string }[];
    expect(hours.every((h) => h.opens === "09:00")).toBe(true);
  });
  it("rate limits password attempts", async () => {
    for (let i = 0; i < 5; i++)
      expect(
        (
          await request(
            "/api/admin/login",
            "POST",
            { password: "wrong" },
            origin,
          )
        ).status,
      ).toBe(401);
    expect(
      (await request("/api/admin/login", "POST", { password: "wrong" }, origin))
        .status,
    ).toBe(429);
  });
  it("validates dates, schedule, service, contact and no-store responses", async () => {
    expect(
      (await request("/api/bookings", "POST", { ...payload(), date: today() }))
        .status,
    ).toBe(422);
    expect(
      (await request("/api/bookings", "POST", payload("08:00"))).status,
    ).toBe(422);
    expect(
      (await request("/api/bookings", "POST", { ...payload(), email: "wrong" }))
        .status,
    ).toBe(422);
    const r = await request(
      `/api/availability?date=${day()}&serviceId=consulting`,
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
});

// Fixture historical deadlines without changing the runtime clock or weakening production guards.
async function expiredFixture(deadlineOffset = 0) {
  const trigger = await db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='approval_insert'",
    )
    .first<{ sql: string }>();
  await db.exec("DROP TRIGGER approval_insert");
  const id = crypto.randomUUID(),
    secret = "e".repeat(64);
  try {
    await db
      .prepare(
        `INSERT INTO bookings(id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,created_at,approval_expires_at,service_name,service_description,service_duration,service_price_mode,service_price_cents,service_version)
      VALUES (?,'consulting',?,0,9999999999,540,600,615,'Expired','expired@example.com',?,unixepoch()-86400+?,unixepoch()+?,'Consultoria individual','Tempo dedicado para transformar ideias em próximos passos.',60,'paid',15000,1)`,
      )
      .bind(
        id,
        day(),
        await (await import("../worker/security")).digest(secret),
        deadlineOffset,
        deadlineOffset,
      )
      .run();
  } finally {
    await db.exec(trigger!.sql.replace(/\s+/g, " "));
  }
  return { id, secret };
}
const counts = async (table: string) =>
  (await db
    .prepare(`SELECT count(*) AS n FROM ${table}`)
    .first<{ n: number }>())!.n;

describe("professional approval lifecycle", () => {
  it("enforces minimum notice at the database boundary and reports migrated health", async () => {
    await expect(
      db
        .prepare(
          `INSERT INTO bookings(id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,approval_expires_at,service_name,service_description,service_duration,service_price_mode,service_price_cents,service_version)
      VALUES (?,'consulting',?,0,unixepoch()+172799,540,600,615,'Demo','demo@example.com','hash',unixepoch()+86400,'Consultoria individual','Tempo dedicado para transformar ideias em próximos passos.',60,'paid',15000,1)`,
        )
        .bind(crypto.randomUUID(), day())
        .run(),
    ).rejects.toThrow("MINIMUM_NOTICE");
    expect(await counts("occupied_slots")).toBe(0);
    expect((await request("/api/health")).status).toBe(200);
  });

  it("creates pending requests with 24h expiry and 48h notice, with no notification before approval", async () => {
    const response = await request("/api/bookings", "POST", payload());
    const b = (await response.json()) as {
      id: string;
      status: string;
      approvalExpiresAt: number;
      version: number;
      cancelToken: string;
    };
    expect(response.status).toBe(201);
    expect(b.status).toBe("pending_approval");
    expect(b.version).toBe(1);
    const stored = await db
      .prepare("SELECT created_at,approval_expires_at FROM bookings WHERE id=?")
      .bind(b.id)
      .first<{ created_at: number; approval_expires_at: number }>();
    expect(stored!.approval_expires_at - stored!.created_at).toBe(86400);
    expect(await counts("notification_outbox")).toBe(0);
    const status = await request(`/api/bookings/${b.id}`, "GET", undefined, {
      "X-Cancel-Token": b.cancelToken,
    });
    expect(((await status.json()) as { status: string }).status).toBe(
      "pending_approval",
    );
    expect((await request(`/api/bookings/${b.id}`)).status).toBe(404);
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    expect(
      (
        await request("/api/bookings", "POST", {
          ...payload(),
          date: d.toISOString().slice(0, 10),
        })
      ).status,
    ).toBe(422);
  });
  it("allows only authenticated same-origin professional decisions, and queues approval once", async () => {
    const b = (await (
      await request("/api/bookings", "POST", payload())
    ).json()) as { id: string; version: number; cancelToken: string };
    const url = `/api/admin/bookings/${b.id}/approve`;
    expect(
      (
        await request(
          url,
          "POST",
          { version: 1 },
          { ...origin, "X-Cancel-Token": b.cancelToken },
        )
      ).status,
    ).toBe(401);
    const headers = await admin();
    expect(
      (await request(url, "POST", { version: 1 }, { Cookie: headers.Cookie }))
        .status,
    ).toBe(403);
    expect((await request(url, "POST", { version: 2 }, headers)).status).toBe(
      409,
    );
    const r = await request(url, "POST", { version: 1 }, headers);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { status: string }).status).toBe("confirmed");
    expect((await request(url, "POST", { version: 1 }, headers)).status).toBe(
      200,
    );
    expect(await counts("booking_events")).toBe(1);
    expect(await counts("notification_outbox")).toBe(1);
    const job = await db
      .prepare("SELECT state,kind FROM notification_outbox")
      .first<{ state: string; kind: string }>();
    expect(job).toEqual({ state: "awaiting_integration", kind: "confirmed" });
    expect(
      (
        await request(
          `/api/bookings/${b.id}`,
          "PUT",
          { date: day(), time: "13:00" },
          { "X-Cancel-Token": b.cancelToken },
        )
      ).status,
    ).toBe(409);
  });
  it("serializes simultaneous approve/reject decisions and permits no second outcome", async () => {
    const b = (await (
      await request("/api/bookings", "POST", payload())
    ).json()) as { id: string };
    const headers = await admin();
    const responses = await Promise.all(
      ["approve", "reject"].map((action) =>
        request(
          `/api/admin/bookings/${b.id}/${action}`,
          "POST",
          { version: 1 },
          headers,
        ),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await counts("booking_events")).toBe(1);
    expect(await counts("notification_outbox")).toBe(1);
  });
  it("rejects a request, releases its intervals and does not approve it later", async () => {
    const b = (await (
      await request("/api/bookings", "POST", payload())
    ).json()) as { id: string };
    const headers = await admin();
    const url = `/api/admin/bookings/${b.id}`;
    expect(
      (await request(url + "/reject", "POST", { version: 1 }, headers)).status,
    ).toBe(200);
    expect(await counts("occupied_slots")).toBe(0);
    expect(
      (await request(url + "/reject", "POST", { version: 1 }, headers)).status,
    ).toBe(200);
    expect(
      (await request(url + "/approve", "POST", { version: 1 }, headers)).status,
    ).toBe(409);
    expect((await request("/api/bookings", "POST", payload())).status).toBe(
      201,
    );
    expect(await counts("notification_outbox")).toBe(1);
  });
  it("expires at the exact deadline, releases intervals and queues an expiry notice only once", async () => {
    const { id, secret } = await expiredFixture();
    expect(await counts("occupied_slots")).toBe(5);
    const headers = await admin();
    const results = await Promise.all([
      request(
        `/api/admin/bookings/${id}/approve`,
        "POST",
        { version: 1 },
        headers,
      ),
      request(`/api/availability?date=${day()}&serviceId=consulting`),
    ]);
    expect(results[0].status).toBe(409);
    expect(await counts("occupied_slots")).toBe(0);
    const r = await request(`/api/bookings/${id}`, "GET", undefined, {
      "X-Cancel-Token": secret,
    });
    expect(((await r.json()) as { status: string }).status).toBe("expired");
    expect(await counts("booking_events")).toBe(1);
    expect(await counts("notification_outbox")).toBe(1);
    expect(
      (await db
        .prepare("SELECT kind FROM notification_outbox")
        .first<{ kind: string }>())!.kind,
    ).toBe("expired");
    expect((await request("/api/bookings", "POST", payload())).status).toBe(
      201,
    );
  });
  it("keeps approval valid before the deadline and enforces expiry at DB level", async () => {
    const { id } = await expiredFixture(60);
    const headers = await admin();
    expect(
      (
        await request(
          `/api/admin/bookings/${id}/approve`,
          "POST",
          { version: 1 },
          headers,
        )
      ).status,
    ).toBe(200);
    await request(`/api/admin/bookings/${id}`, "DELETE", undefined, headers);
    const { id: expired } = await expiredFixture(-1);
    await expect(
      db
        .prepare(
          "UPDATE bookings SET status='confirmed',version=version+1 WHERE id=?",
        )
        .bind(expired)
        .run(),
    ).rejects.toThrow("INVALID_TRANSITION");
  });
  it("does not extend pending deadlines when changing the requested time", async () => {
    const b = (await (
      await request("/api/bookings", "POST", payload())
    ).json()) as { id: string; cancelToken: string; approvalExpiresAt: number };
    const response = await request(
      `/api/bookings/${b.id}`,
      "PUT",
      { date: day(), time: "13:00" },
      { "X-Cancel-Token": b.cancelToken },
    );
    const moved = (await response.json()) as {
      status: string;
      approvalExpiresAt: number;
      version: number;
    };
    expect(response.status).toBe(200);
    expect(moved.status).toBe("pending_approval");
    expect(moved.approvalExpiresAt).toBe(b.approvalExpiresAt);
    expect(moved.version).toBe(2);
  });

  it("only treats the original decision version as an idempotent replay", async () => {
    const b = (await (
      await request("/api/bookings", "POST", payload())
    ).json()) as {
      id: string;
      cancelToken: string;
    };
    const moved = await request(
      `/api/bookings/${b.id}`,
      "PUT",
      { date: day(), time: "13:00" },
      { "X-Cancel-Token": b.cancelToken },
    );
    expect(moved.status).toBe(200);
    const headers = await admin();
    const url = `/api/admin/bookings/${b.id}/approve`;
    expect((await request(url, "POST", { version: 2 }, headers)).status).toBe(
      200,
    );
    expect((await request(url, "POST", { version: 2 }, headers)).status).toBe(
      200,
    );
    expect((await request(url, "POST", { version: 1 }, headers)).status).toBe(
      409,
    );
    expect((await request(url, "POST", { version: 999 }, headers)).status).toBe(
      409,
    );
    expect(await counts("booking_events")).toBe(1);
    expect(await counts("notification_outbox")).toBe(1);
  });

  it("rolls back rejection, audit and released occupancy when outbox insertion fails", async () => {
    const b = (await (
      await request("/api/bookings", "POST", payload())
    ).json()) as { id: string };
    const headers = await admin();
    await db.exec(
      "CREATE TRIGGER simulate_outbox_failure BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT,'SIMULATED_OUTBOX_FAILURE'); END;",
    );
    try {
      expect(
        (
          await request(
            `/api/admin/bookings/${b.id}/reject`,
            "POST",
            { version: 1 },
            headers,
          )
        ).status,
      ).toBe(503);
      const row = await db
        .prepare("SELECT status,version,cancelled FROM bookings WHERE id=?")
        .bind(b.id)
        .first();
      expect(row).toEqual({
        status: "pending_approval",
        version: 1,
        cancelled: 0,
      });
      expect(await counts("occupied_slots")).toBe(5);
      expect(await counts("booking_events")).toBe(0);
      expect(await counts("notification_outbox")).toBe(0);
    } finally {
      await db.exec("DROP TRIGGER simulate_outbox_failure");
    }
    expect(
      (
        await request(
          `/api/admin/bookings/${b.id}/reject`,
          "POST",
          { version: 1 },
          headers,
        )
      ).status,
    ).toBe(200);
    expect(await counts("occupied_slots")).toBe(0);
    expect(await counts("booking_events")).toBe(1);
    expect(await counts("notification_outbox")).toBe(1);
  });

  it("allows one effective result when the customer edits while the professional approves", async () => {
    const b = (await (
      await request("/api/bookings", "POST", payload())
    ).json()) as { id: string; cancelToken: string };
    const headers = await admin();
    const responses = await Promise.all([
      request(
        `/api/bookings/${b.id}`,
        "PUT",
        { date: day(), time: "13:00" },
        { "X-Cancel-Token": b.cancelToken },
      ),
      request(
        `/api/admin/bookings/${b.id}/approve`,
        "POST",
        { version: 1 },
        headers,
      ),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const row = await db
      .prepare("SELECT status,version,start_min FROM bookings WHERE id=?")
      .bind(b.id)
      .first<{ status: string; version: number; start_min: number }>();
    expect(row!.version).toBe(2);
    if (row!.status === "confirmed") {
      expect(row!.start_min).toBe(540);
      expect(await counts("notification_outbox")).toBe(1);
    } else {
      expect(row!.status).toBe("pending_approval");
      expect(row!.start_min).toBe(780);
      expect(await counts("notification_outbox")).toBe(0);
    }
    expect(await counts("occupied_slots")).toBe(5);
  });
});

describe("migration and scheduled expiry", () => {
  it("preserves pre-approval live and cancelled reservations", async () => {
    const legacy = await mf.getD1Database("LEGACY");
    const apply = async (file: string) =>
      legacy.exec(
        (await readFile(file, "utf8"))
          .replace(/--.*$/gm, "")
          .replace(/\s+/g, " "),
      );
    await apply("migrations/0001_initial.sql");
    await legacy
      .prepare(
        `INSERT INTO bookings(id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash)
      VALUES ('legacy','consulting',?,0,9999999999,540,600,615,'Legacy','legacy@example.com','hash')`,
      )
      .bind(day())
      .run();
    await legacy
      .prepare(
        `INSERT INTO bookings(id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,cancelled)
      VALUES ('cancelled','consulting',?,0,9999999999,540,600,615,'Legacy','legacy@example.com','hash',1)`,
      )
      .bind(day())
      .run();
    await apply("migrations/0002_professional_approval.sql");
    await apply("migrations/0003_google_login.sql");
    await apply("migrations/0004_professional_tenants.sql");
    await apply("migrations/0005_professional_recurrence.sql");
    await legacy.exec(
      "INSERT INTO booking_series(id,professional_id,request_id,request_hash,frequency,occurrence_count,actor_subject) VALUES('migration-series','demo','migration-request','hash','once',1,'fixture')",
    );
    await legacy
      .prepare(
        `INSERT INTO bookings(id,professional_id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,status,decided_at,source,series_id)
      VALUES('manual-legacy','demo','discovery',?,0,9999999999,660,690,705,'Fixture','','original-hash','confirmed',unixepoch(),'professional','migration-series')`,
      )
      .bind(day())
      .run();
    const tables = [
      "bookings",
      "occupied_slots",
      "booking_series",
      "booking_events",
      "notification_outbox",
    ];
    const before = await Promise.all(
      tables.map((t) => legacy.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()),
    );
    await apply("migrations/0006_professional_services.sql");
    for (let i = 0; i < tables.length; i++) {
      const after = await legacy
        .prepare(`SELECT * FROM ${tables[i]} ORDER BY 1`)
        .all();
      expect(after.results).toEqual(
        before[i].results.map((row) =>
          tables[i] === "bookings" ? expect.objectContaining(row) : row,
        ),
      );
    }
    expect(
      (await legacy.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    expect(
      await legacy
        .prepare(
          "SELECT service_name,service_duration,service_price_cents FROM bookings WHERE id='legacy'",
        )
        .first(),
    ).toMatchObject({
      service_name: "Consultoria individual",
      service_duration: 60,
      service_price_cents: 15000,
    });
    expect(
      (await legacy
        .prepare("SELECT status FROM bookings WHERE id='legacy'")
        .first<{ status: string }>())!.status,
    ).toBe("confirmed");
    expect(
      (await legacy
        .prepare("SELECT status FROM bookings WHERE id='cancelled'")
        .first<{ status: string }>())!.status,
    ).toBe("cancelled");
    expect(
      (await legacy
        .prepare("SELECT count(*) AS n FROM occupied_slots")
        .first<{ n: number }>())!.n,
    ).toBe(8);
    expect(
      (await legacy
        .prepare("SELECT count(*) AS n FROM notification_outbox")
        .first<{ n: number }>())!.n,
    ).toBe(1);
    // Upgrade a populated v6 catalog, including terms already edited since booking.
    await legacy.exec(
      "UPDATE professional_services SET name='Edited catalog',version=version+1 WHERE professional_id='demo' AND id='consulting'",
    );
    await legacy.exec(
      "INSERT INTO professional_services(professional_id,id,name,description,duration_minutes,price_mode,price_cents) VALUES('demo','custom-50','Custom session','Fixture',50,'paid',17550)",
    );
    await legacy
      .prepare(
        `INSERT INTO bookings(id,professional_id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,approval_expires_at,service_name,service_description,service_duration,service_price_mode,service_price_cents,service_version)
      SELECT 'custom-legacy','demo',id,?,0,9999999999,840,890,905,'Fixture','fixture@example.com','custom-hash',unixepoch()+86400,name,description,duration_minutes,price_mode,price_cents,version FROM professional_services WHERE professional_id='demo' AND id='custom-50'`,
      )
      .bind(day())
      .run();
    const upgradedTables = [...tables, "professional_services"];
    const before7 = await Promise.all(
      upgradedTables.map((t) =>
        legacy.prepare(`SELECT * FROM ${t} ORDER BY 1,2`).all(),
      ),
    );
    await apply("migrations/0007_optional_service_terms.sql");
    for (let i = 0; i < upgradedTables.length; i++)
      expect(
        (
          await legacy
            .prepare(`SELECT * FROM ${upgradedTables[i]} ORDER BY 1,2`)
            .all()
        ).results,
      ).toEqual(before7[i].results);
    expect(
      (await legacy.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });
  it("expires without an HTTP request and remains safe on repeated scheduled execution", async () => {
    const { id } = await expiredFixture(-1);
    await worker.scheduled({} as ScheduledController, { DB: db } as Env);
    await worker.scheduled({} as ScheduledController, { DB: db } as Env);
    expect(
      (await db
        .prepare("SELECT status FROM bookings WHERE id=?")
        .bind(id)
        .first<{ status: string }>())!.status,
    ).toBe("expired");
    expect(await counts("occupied_slots")).toBe(0);
    expect(await counts("notification_outbox")).toBe(1);
  });
});
