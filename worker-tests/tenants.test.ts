import { readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { authorizeGoogleAccount, digest } from "../worker/security";
import { today } from "../worker/booking";
import type { Env } from "../worker/types";
let mf: Miniflare, db: D1Database;
const base = "http://localhost";
type Profile = { id: string; slug: string; version: number };
let a: Profile,
  b: Profile,
  master: Record<string, string>,
  authA: Record<string, string>,
  authB: Record<string, string>;
function request(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return mf.dispatchFetch(base + path, {
    method,
    headers: { Origin: base, "Content-Type": "application/json", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function session(subject: string, professionalId: string | null) {
  const token = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO sessions(token_hash,expires_at,provider,subject,role,professional_id) VALUES(?,unixepoch()+28800,'google',?,?,?)",
    )
    .bind(
      await digest(token),
      subject,
      professionalId ? "professional" : "master",
      professionalId,
    )
    .run();
  return { Cookie: `slotiva_session=${token}` };
}
function date(offset = 3) {
  const d = new Date(`${today()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function payload(time = "09:00") {
  return {
    date: date(),
    time,
    serviceId: "discovery",
    name: "Fictional client",
    email: "",
  };
}
const series = (extra: Record<string, unknown> = {}) => ({
  ...payload(),
  requestId: crypto.randomUUID(),
  frequency: "weekly",
  count: 4,
  ...extra,
});
const profileData = (slug: string) => ({
  slug,
  displayName: "Fictional Professional",
  headerTitle: "Appointments",
  headerSubtitle: "Personal header",
  theme: "forest",
  invitedEmail: `${slug}@gmail.com`,
  googleSubject: slug,
});
async function create(slug: string) {
  const r = await request(
    "/api/master/professionals",
    "POST",
    profileData(slug),
    master,
  );
  expect(r.status).toBe(201);
  return (await r.json()) as Profile;
}
const publicBooking = (p: Profile) =>
  request(`/api/public/${p.slug}/bookings`, "POST", {
    ...payload(),
    email: "fictional@example.com",
  });
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
      d1Databases: ["DB"],
      bindings: {
        COOKIE_SECURE: "false",
        AUTH_MODE: "google",
        MASTER_GOOGLE_SUBS: "master-1",
      },
      host: "127.0.0.1",
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
}, 30000);
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  master = await session("master-1", null);
  const suffix = crypto.randomUUID().slice(0, 8);
  a = await create(`alice-${suffix}`);
  b = await create(`bob-${suffix}`);
  authA = await session(a.slug, a.id);
  authB = await session(b.slug, b.id);
});
describe("Master and professional tenant boundaries", () => {
  it("requires Google master access and exact mutation origins", async () => {
    expect((await request("/api/master/professionals")).status).toBe(401);
    expect(
      (await request("/api/master/professionals", "GET", undefined, authA))
        .status,
    ).toBe(403);
    expect(
      (await request("/api/admin/bookings", "GET", undefined, master)).status,
    ).toBe(403);
    expect(
      (
        await request(
          "/api/master/professionals",
          "POST",
          profileData("evil-prof"),
          { ...master, Origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    expect(
      (await request("/api/admin/login", "POST", { password: "test" })).status,
    ).toBe(403);
  });
  it("publishes only safe header data and enforces unique retired slugs", async () => {
    const p = (await (
      await request(`/api/public/${a.slug}/profile`)
    ).json()) as Record<string, unknown>;
    expect(p.headerTitle).toBe("Appointments");
    expect(p).not.toHaveProperty("googleSubject");
    expect(p).not.toHaveProperty("invitedEmail");
    expect(
      (
        await request(
          "/api/master/professionals",
          "POST",
          profileData(a.slug),
          master,
        )
      ).status,
    ).toBe(409);
    const edit = {
      displayName: "Saide Example",
      headerTitle: "My agenda",
      headerSubtitle: "Weekly sessions",
      theme: "plum",
      version: 1,
    };
    expect(
      (await request("/api/admin/profile", "PUT", edit, authA)).status,
    ).toBe(200);
    expect(
      (await request("/api/admin/profile", "PUT", edit, authA)).status,
    ).toBe(409);
    expect(
      (
        (await (await request(`/api/public/${a.slug}/profile`)).json()) as {
          headerTitle: string;
        }
      ).headerTitle,
    ).toBe("My agenda");
    expect(
      (
        (await (await request(`/api/public/${b.slug}/profile`)).json()) as {
          headerTitle: string;
        }
      ).headerTitle,
    ).toBe("Appointments");
  });
  it("allows the same time across professionals and hides other agendas and decisions", async () => {
    const ra = await publicBooking(a),
      rb = await publicBooking(b);
    expect(ra.status).toBe(201);
    expect(rb.status).toBe(201);
    const ba = (await ra.json()) as { id: string; cancelToken: string };
    const bb = (await rb.json()) as { id: string };
    const list = (await (
      await request("/api/admin/bookings", "GET", undefined, authA)
    ).json()) as { id: string }[];
    expect(list.map((x) => x.id)).toEqual([ba.id]);
    expect(
      (
        await request(
          `/api/admin/bookings/${bb.id}/approve`,
          "POST",
          { version: 1 },
          authA,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/api/admin/bookings/${bb.id}`,
          "DELETE",
          undefined,
          authA,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/api/bookings/${bb.id}`, "GET", undefined, {
          "X-Cancel-Token": ba.cancelToken,
        })
      ).status,
    ).toBe(404);
    expect((await publicBooking(a)).status).toBe(409);
    await expect(
      db
        .prepare(
          "UPDATE bookings SET professional_id=?,version=version+1 WHERE id=?",
        )
        .bind(b.id, ba.id)
        .run(),
    ).rejects.toThrow();
  });
  it("scopes hours and prevents a professional from editing protected fields", async () => {
    const r = await request(
      "/api/admin/hours",
      "PUT",
      { weekdays: [0, 1, 2, 3, 4], opens: "10:00", closes: "16:00" },
      authA,
    );
    expect(r.status).toBe(200);
    const other = (await (
      await request("/api/admin/hours", "GET", undefined, authB)
    ).json()) as { opens: string }[];
    expect(other[0].opens).toBe("09:00");
    expect(
      (
        await request(
          "/api/admin/profile",
          "PUT",
          { ...profileData("changed-slug"), version: 1 },
          authA,
        )
      ).status,
    ).toBe(422);
  });
  it("suspends, revokes sessions, reactivates and deletes while preserving history", async () => {
    const booking = (await (await publicBooking(a)).json()) as { id: string };
    expect(
      (
        await request(
          `/api/master/professionals/${a.id}/status`,
          "PUT",
          { status: "suspended", version: 1 },
          master,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("/api/admin/bookings", "GET", undefined, authA)).status,
    ).toBe(401);
    expect((await request(`/api/public/${a.slug}/profile`)).status).toBe(404);
    expect(
      (
        await request(
          `/api/master/professionals/${a.id}/status`,
          "PUT",
          { status: "active", version: 2 },
          master,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("/api/admin/bookings", "GET", undefined, authA)).status,
    ).toBe(401);
    expect(
      (
        await request(
          `/api/master/professionals/${a.id}`,
          "DELETE",
          { version: 3 },
          master,
        )
      ).status,
    ).toBe(204);
    expect(
      await db
        .prepare("SELECT status FROM bookings WHERE id=?")
        .bind(booking.id)
        .first("status"),
    ).toBe("cancelled");
    expect(
      await db
        .prepare("SELECT count(*) n FROM occupied_slots WHERE booking_id=?")
        .bind(booking.id)
        .first("n"),
    ).toBe(0);
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM professional_events WHERE professional_id=?",
        )
        .bind(a.id)
        .first("n"),
    ).toBe(4);
    expect(
      (
        await request(
          "/api/master/professionals",
          "POST",
          profileData(a.slug),
          master,
        )
      ).status,
    ).toBe(409);
    await expect(
      db.prepare("DELETE FROM professionals WHERE id=?").bind(a.id).run(),
    ).rejects.toThrow();
  });
  it("binds only a verified authoritative invited identity, then requires its immutable subject", async () => {
    const slug = `invited-${crypto.randomUUID().slice(0, 8)}`;
    const data = profileData(slug);
    const { googleSubject: _, ...invite } = data;
    expect(
      (await request("/api/master/professionals", "POST", invite, master))
        .status,
    ).toBe(201);
    const env = { DB: db, MASTER_GOOGLE_SUBS: "master-1" } as Env;
    await expect(
      authorizeGoogleAccount(env, {
        sub: "new-identity",
        email: data.invitedEmail,
        email_verified: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      authorizeGoogleAccount(env, {
        sub: "new-identity",
        email: data.invitedEmail,
        email_verified: true,
      }),
    ).resolves.toMatchObject({ role: "professional" });
    await expect(
      authorizeGoogleAccount(env, {
        sub: "attacker",
        email: data.invitedEmail,
        email_verified: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      authorizeGoogleAccount(env, {
        sub: "new-identity",
        email: "changed@gmail.com",
        email_verified: true,
      }),
    ).resolves.toMatchObject({ role: "professional" });
  });
});
describe("Professional-entered fixed recurrence", () => {
  it.each([
    ["weekly", 7],
    ["fortnightly", 14],
  ])(
    "confirms a finite %s sequence, blocks public slots and isolates tenants",
    async (frequency, days) => {
      const r = await request(
        "/api/admin/series",
        "POST",
        series({ frequency }),
        authA,
      );
      expect(r.status).toBe(201);
      const value = (await r.json()) as {
        id: string;
        bookings: {
          id: string;
          status: string;
          date: string;
          seriesId: string;
        }[];
      };
      expect(value.bookings).toHaveLength(4);
      for (let i = 0; i < 4; i++) {
        expect(value.bookings[i].status).toBe("confirmed");
        expect(value.bookings[i].seriesId).toBe(value.id);
        if (i)
          expect(
            (Date.parse(value.bookings[i].date) -
              Date.parse(value.bookings[i - 1].date)) /
              86400000,
          ).toBe(days);
      }
      expect((await publicBooking(a)).status).toBe(409);
      expect((await publicBooking(b)).status).toBe(201);
      expect(
        (
          await request(
            `/api/admin/series/${value.id}?fromBookingId=${value.bookings[0].id}`,
            "DELETE",
            undefined,
            authB,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await request(
            `/api/admin/series/${value.id}?fromBookingId=${value.bookings[0].id}`,
            "DELETE",
            undefined,
            authA,
          )
        ).status,
      ).toBe(204);
      expect((await publicBooking(a)).status).toBe(201);
    },
  );
  it.each(["weekly", "fortnightly"])(
    "cancels %s from the selected occurrence and preserves earlier future bookings",
    async (frequency) => {
      const created = await request(
        "/api/admin/series",
        "POST",
        series({ frequency }),
        authA,
      );
      const value = (await created.json()) as {
        id: string;
        bookings: { id: string }[];
      };
      const ids = value.bookings.map((b) => b.id);
      await request(
        `/api/admin/bookings/${ids[0]}`,
        "DELETE",
        undefined,
        authA,
      );
      const cutoff = `/api/admin/series/${value.id}?fromBookingId=${ids[2]}`;
      expect((await request(cutoff, "DELETE", undefined, authA)).status).toBe(
        204,
      );
      const states = async () =>
        (
          await db
            .prepare(
              "SELECT id,status,version FROM bookings WHERE series_id=? ORDER BY starts_at",
            )
            .bind(value.id)
            .all<{ id: string; status: string; version: number }>()
        ).results;
      const after = await states();
      expect(after.map((b) => b.status)).toEqual([
        "cancelled",
        "confirmed",
        "cancelled",
        "cancelled",
      ]);
      expect(after.map((b) => b.version)).toEqual([2, 1, 2, 2]);
      expect(
        await db
          .prepare("SELECT count(*) n FROM occupied_slots WHERE booking_id=?")
          .bind(ids[1])
          .first("n"),
      ).toBeGreaterThan(0);
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM occupied_slots WHERE booking_id IN (?,?)",
          )
          .bind(ids[2], ids[3])
          .first("n"),
      ).toBe(0);
      expect(
        await db
          .prepare("SELECT status FROM booking_series WHERE id=?")
          .bind(value.id)
          .first("status"),
      ).toBe("active");
      expect((await request(cutoff, "DELETE", undefined, authA)).status).toBe(
        204,
      );
      expect(await states()).toEqual(after);
      expect(
        (
          await request(
            `/api/admin/series/${value.id}?fromBookingId=${ids[1]}`,
            "DELETE",
            undefined,
            authA,
          )
        ).status,
      ).toBe(204);
      expect((await states()).every((b) => b.status === "cancelled")).toBe(
        true,
      );
      expect(
        await db
          .prepare("SELECT status FROM booking_series WHERE id=?")
          .bind(value.id)
          .first("status"),
      ).toBe("cancelled");
    },
  );
  it("requires an explicit valid anchor owned by this professional and series before cancelling", async () => {
    const created = await request("/api/admin/series", "POST", series(), authA);
    const value = (await created.json()) as {
      id: string;
      bookings: { id: string }[];
    };
    const another = (await (
      await request(
        "/api/admin/series",
        "POST",
        series({ time: "11:00" }),
        authA,
      )
    ).json()) as { bookings: { id: string }[] };
    for (const suffix of ["", "?fromBookingId=bad"]) {
      expect(
        (
          await request(
            `/api/admin/series/${value.id}${suffix}`,
            "DELETE",
            undefined,
            authA,
          )
        ).status,
      ).toBe(422);
    }
    for (const anchor of [crypto.randomUUID(), another.bookings[0].id]) {
      expect(
        (
          await request(
            `/api/admin/series/${value.id}?fromBookingId=${anchor}`,
            "DELETE",
            undefined,
            authA,
          )
        ).status,
      ).toBe(404);
    }
    expect(
      (
        await request(
          `/api/admin/series/${value.id}?fromBookingId=${value.bookings[1].id}`,
          "DELETE",
          undefined,
          authB,
        )
      ).status,
    ).toBe(404);
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM bookings WHERE series_id=? AND status='confirmed'",
        )
        .bind(value.id)
        .first("n"),
    ).toBe(4);
  });
  it("rolls back the whole series, slots, outbox and events if any later occurrence conflicts", async () => {
    const later = date();
    const d = new Date(`${later}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    expect(
      (
        await request(
          "/api/admin/series",
          "POST",
          series({
            date: d.toISOString().slice(0, 10),
            frequency: "once",
            count: 1,
          }),
          authA,
        )
      ).status,
    ).toBe(201);
    const body = series();
    expect(
      (await request("/api/admin/series", "POST", body, authA)).status,
    ).toBe(409);
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM booking_series WHERE professional_id=?",
        )
        .bind(a.id)
        .first("n"),
    ).toBe(1);
    expect(
      await db
        .prepare("SELECT count(*) n FROM bookings WHERE professional_id=?")
        .bind(a.id)
        .first("n"),
    ).toBe(1);
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM notification_outbox WHERE booking_id IN (SELECT id FROM bookings WHERE professional_id=?)",
        )
        .bind(a.id)
        .first("n"),
    ).toBe(1);
    expect((await publicBooking(a)).status).toBe(201);
  });
  it("permits explicitly agreed appointments under public notice while keeping public restrictions", async () => {
    await request(
      "/api/admin/hours",
      "PUT",
      { weekdays: [0, 1, 2, 3, 4, 5, 6], opens: "09:00", closes: "17:00" },
      authA,
    );
    const d = new Date(`${today()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    const near = d.toISOString().slice(0, 10);
    expect(
      (
        await request(
          "/api/admin/series",
          "POST",
          series({ date: near, frequency: "once", count: 1 }),
          authA,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await request(`/api/public/${a.slug}/bookings`, "POST", {
          ...payload(),
          date: near,
          email: "fictional@example.com",
        })
      ).status,
    ).toBe(422);
    d.setUTCDate(d.getUTCDate() + 367);
    expect(
      (
        await request(
          "/api/admin/series",
          "POST",
          series({
            date: d.toISOString().slice(0, 10),
            frequency: "once",
            count: 1,
          }),
          authA,
        )
      ).status,
    ).toBe(422);
  });
  it("removing a professional cancels every confirmed series occurrence without erasing history", async () => {
    expect(
      (await request("/api/admin/series", "POST", series(), authA)).status,
    ).toBe(201);
    expect(
      (
        await request(
          `/api/master/professionals/${a.id}`,
          "DELETE",
          { version: 1 },
          master,
        )
      ).status,
    ).toBe(204);
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM bookings WHERE professional_id=? AND status='cancelled'",
        )
        .bind(a.id)
        .first("n"),
    ).toBe(4);
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM occupied_slots WHERE professional_id=?",
        )
        .bind(a.id)
        .first("n"),
    ).toBe(0);
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM booking_events WHERE booking_id IN (SELECT id FROM bookings WHERE professional_id=?)",
        )
        .bind(a.id)
        .first("n"),
    ).toBe(8);
  });
  it("deduplicates simultaneous retries and rejects reuse with changed contents", async () => {
    const body = series();
    const results = await Promise.all([
      request("/api/admin/series", "POST", body, authA),
      request("/api/admin/series", "POST", body, authA),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    const values = (await Promise.all(results.map((r) => r.json()))) as {
      id: string;
    }[];
    expect(values[0].id).toBe(values[1].id);
    expect(
      await db
        .prepare("SELECT count(*) n FROM bookings WHERE professional_id=?")
        .bind(a.id)
        .first("n"),
    ).toBe(4);
    expect(
      (
        await request(
          "/api/admin/series",
          "POST",
          { ...body, time: "11:00" },
          authA,
        )
      ).status,
    ).toBe(409);
  });
  it("enforces finite bounds, hours, public approval and rejects unauthenticated or master creation", async () => {
    expect((await request("/api/admin/series", "POST", series())).status).toBe(
      401,
    );
    expect(
      (await request("/api/admin/series", "POST", series(), master)).status,
    ).toBe(403);
    for (const extra of [
      { count: 27 },
      { frequency: "monthly" },
      { frequency: "once", count: 2 },
      { date: "2020-01-01" },
      { time: "09:15" },
      { email: "invalid" },
    ])
      expect(
        (await request("/api/admin/series", "POST", series(extra), authA))
          .status,
      ).toBe(422);
    expect(
      (
        await request(
          "/api/admin/series",
          "POST",
          series({ time: "23:00" }),
          authA,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await request(`/api/public/${a.slug}/bookings`, "POST", {
          ...payload(),
          email: "fictional@example.com",
          source: "professional",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(
          "/api/admin/series",
          "POST",
          series({ frequency: "once", count: 1 }),
          authA,
        )
      ).status,
    ).toBe(201);
  });
});
