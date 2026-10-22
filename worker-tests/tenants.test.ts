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
    serviceVersion: 1,
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
  it.each(["weekly", "fortnightly"])(
    "offers isolated single and explicit all cancellation for %s series",
    async (frequency) => {
      const create = async (headers: Record<string, string>, extra = {}) =>
        (await (
          await request(
            "/api/admin/series",
            "POST",
            series({ frequency, ...extra }),
            headers,
          )
        ).json()) as { id: string; bookings: { id: string }[] };
      const value = await create(authA);
      const other = await create(authA, { time: "11:00" });
      const foreign = await create(authB);
      const states = async (id: string) =>
        (
          await db
            .prepare(
              "SELECT id,status,version FROM bookings WHERE series_id=? ORDER BY starts_at",
            )
            .bind(id)
            .all<{ id: string; status: string; version: number }>()
        ).results;
      expect(
        (
          await request(
            `/api/admin/bookings/${value.bookings[2].id}`,
            "DELETE",
            undefined,
            authA,
          )
        ).status,
      ).toBe(204);
      expect((await states(value.id)).map((b) => b.status)).toEqual([
        "confirmed",
        "confirmed",
        "cancelled",
        "confirmed",
      ]);
      expect(
        await db
          .prepare("SELECT count(*) n FROM occupied_slots WHERE booking_id=?")
          .bind(value.bookings[2].id)
          .first("n"),
      ).toBe(0);
      expect(
        await db
          .prepare("SELECT count(*) n FROM occupied_slots WHERE booking_id=?")
          .bind(value.bookings[0].id)
          .first("n"),
      ).toBeGreaterThan(0);
      const path = `/api/admin/series/${value.id}?scope=all`;
      expect((await request(path, "DELETE", undefined, authB)).status).toBe(
        404,
      );
      expect((await request(path, "DELETE", undefined, authA)).status).toBe(
        204,
      );
      const after = await states(value.id);
      expect(after.map((b) => b.status)).toEqual([
        "cancelled",
        "cancelled",
        "cancelled",
        "cancelled",
      ]);
      expect(after.map((b) => b.version)).toEqual([2, 2, 2, 2]);
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM occupied_slots WHERE booking_id IN (SELECT id FROM bookings WHERE series_id=?)",
          )
          .bind(value.id)
          .first("n"),
      ).toBe(0);
      expect(
        await db
          .prepare("SELECT status FROM booking_series WHERE id=?")
          .bind(value.id)
          .first("status"),
      ).toBe("cancelled");
      expect((await request(path, "DELETE", undefined, authA)).status).toBe(
        204,
      );
      expect(await states(value.id)).toEqual(after);
      expect(
        (await states(other.id)).every((b) => b.status === "confirmed"),
      ).toBe(true);
      expect(
        (await states(foreign.id)).every((b) => b.status === "confirmed"),
      ).toBe(true);
    },
  );
  it("rejects ambiguous bulk cancellation scopes without changing bookings", async () => {
    const value = (await (
      await request("/api/admin/series", "POST", series(), authA)
    ).json()) as { id: string; bookings: { id: string }[] };
    for (const query of [
      "scope=",
      "scope=unknown",
      "scope=all&scope=all",
      `scope=all&fromBookingId=${value.bookings[0].id}`,
    ])
      expect(
        (
          await request(
            `/api/admin/series/${value.id}?${query}`,
            "DELETE",
            undefined,
            authA,
          )
        ).status,
      ).toBe(422);
    expect(
      (
        await request(
          `/api/admin/series/${crypto.randomUUID()}?scope=all`,
          "DELETE",
          undefined,
          authA,
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

const serviceData = (extra: Record<string, unknown> = {}) => ({
  name: "Psicoterapia",
  description: "Encontro individual",
  duration: 50,
  priceMode: "paid",
  priceCents: 17550,
  active: true,
  ...extra,
});
async function newService(extra: Record<string, unknown> = {}) {
  const response = await request(
    "/api/admin/services",
    "POST",
    serviceData(extra),
    authA,
  );
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; version: number };
}
describe("professional service catalog and immutable booking terms", () => {
  it("seeds independent catalogs and authorizes all service writes by tenant and role", async () => {
    const own = (await (
      await request("/api/admin/services", "GET", undefined, authA)
    ).json()) as unknown[];
    expect(own).toHaveLength(3);
    expect(
      (await request("/api/admin/services", "POST", serviceData())).status,
    ).toBe(401);
    expect(
      (await request("/api/admin/services", "POST", serviceData(), master))
        .status,
    ).toBe(403);
    const s = await newService();
    expect(
      (
        await request(
          `/api/admin/services/${s.id}`,
          "PUT",
          serviceData({ version: 1 }),
          authB,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/api/admin/services/${s.id}`,
          "PUT",
          serviceData({ version: 1 }),
          { ...authA, Origin: "http://evil.example" },
        )
      ).status,
    ).toBe(403);
    const other = (await (
      await request(`/api/public/${b.slug}/services`)
    ).json()) as { id: string }[];
    expect(other.some((x) => x.id === s.id)).toBe(false);
    expect(
      (
        await request(`/api/public/${b.slug}/bookings`, "POST", {
          ...payload(),
          email: "fixture@example.com",
          serviceId: s.id,
        })
      ).status,
    ).toBe(404);
  });
  it("validates durations, explicit price modes, bounds and strict payloads", async () => {
    for (const extra of [
      { duration: 14 },
      { duration: 51 },
      { duration: 245 },
      { priceCents: 0 },
      { priceCents: 1.5 },
      { priceMode: "free", priceCents: 1 },
      { priceMode: "hidden", priceCents: 0 },
      { name: " " },
      { professionalId: b.id },
    ])
      expect(
        (
          await request(
            "/api/admin/services",
            "POST",
            serviceData(extra),
            authA,
          )
        ).status,
      ).toBe(422);
    for (const [duration, cents] of [
      [50.2, 100],
      [50, 100.5],
    ])
      await expect(
        db
          .prepare(
            "INSERT INTO professional_services(professional_id,id,name,duration_minutes,price_mode,price_cents) VALUES(?,?,?,?,'paid',?)",
          )
          .bind(a.id, crypto.randomUUID(), "Fixture", duration, cents)
          .run(),
      ).rejects.toThrow("CHECK constraint failed");
    await newService({ priceMode: "free", priceCents: 0 });
    await newService({ priceMode: "hidden", priceCents: null });
    const publicServices = (await (
      await request(`/api/public/${a.slug}/services`)
    ).json()) as { priceMode: string; price: number | null }[];
    expect(publicServices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ priceMode: "free", price: 0 }),
        expect.objectContaining({ priceMode: "hidden", price: null }),
      ]),
    );
  });
  it("rejects stale edits and stale booking versions without occupying a slot", async () => {
    const s = await newService();
    expect(
      (
        await request(
          `/api/admin/services/${s.id}`,
          "PUT",
          serviceData({ version: 1, name: "Novo atendimento" }),
          authA,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/api/admin/services/${s.id}`,
          "PUT",
          serviceData({ version: 1 }),
          authA,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(`/api/public/${a.slug}/bookings`, "POST", {
          ...payload(),
          email: "fixture@example.com",
          serviceId: s.id,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          "/api/admin/series",
          "POST",
          series({ serviceId: s.id }),
          authA,
        )
      ).status,
    ).toBe(409);
    const slots = await db
      .prepare("SELECT count(*) n FROM occupied_slots WHERE professional_id=?")
      .bind(a.id)
      .first<{ n: number }>();
    expect(slots!.n).toBe(0);
  });
  it("snapshots names, durations and cents, preserves rescheduling after deactivation, and rejects snapshot tampering", async () => {
    const s = await newService();
    const response = await request(`/api/public/${a.slug}/bookings`, "POST", {
      ...payload(),
      email: "fixture@example.com",
      serviceId: s.id,
    });
    expect(response.status).toBe(201);
    const booking = (await response.json()) as {
      id: string;
      cancelToken: string;
      serviceName: string;
      serviceDuration: number;
      servicePrice: number;
    };
    expect(booking).toMatchObject({
      serviceName: "Psicoterapia",
      serviceDuration: 50,
      servicePrice: 175.5,
    });
    expect(
      (
        await request(
          `/api/admin/services/${s.id}`,
          "PUT",
          serviceData({
            version: 1,
            name: "Outro nome",
            duration: 90,
            priceMode: "hidden",
            priceCents: null,
            active: false,
          }),
          authA,
        )
      ).status,
    ).toBe(200);
    const publicList = (await (
      await request(`/api/public/${a.slug}/services`)
    ).json()) as { id: string }[];
    expect(publicList.some((x) => x.id === s.id)).toBe(false);
    expect(
      (
        await request(`/api/public/${a.slug}/bookings`, "POST", {
          ...payload("12:00"),
          email: "fixture@example.com",
          serviceId: s.id,
          serviceVersion: 2,
        })
      ).status,
    ).toBe(404);
    const capability = { "X-Cancel-Token": booking.cancelToken };
    const slots = (await (
      await request(
        `/api/bookings/${booking.id}/availability?date=${date()}`,
        "GET",
        undefined,
        capability,
      )
    ).json()) as string[];
    expect(slots).toContain("15:30"); // original 50+15 fits; edited 90+15 would not.
    const moved = await request(
      `/api/bookings/${booking.id}`,
      "PUT",
      { date: date(), time: "15:30" },
      capability,
    );
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({
      serviceName: "Psicoterapia",
      serviceDuration: 50,
      servicePrice: 175.5,
    });
    await expect(
      db
        .prepare(
          "UPDATE bookings SET service_name='Changed',version=version+1 WHERE id=?",
        )
        .bind(booking.id)
        .run(),
    ).rejects.toThrow("SERVICE_SNAPSHOT_IMMUTABLE");
    await expect(
      db
        .prepare(
          `INSERT INTO bookings(id,professional_id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,approval_expires_at,service_name,service_description,service_duration,service_price_mode,service_price_cents,service_version)
      SELECT ?,professional_id,service_id,date,weekday,starts_at,780,830,845,name,email,cancel_hash,unixepoch()+86400,service_name,service_description,service_duration,service_price_mode,service_price_cents,service_version FROM bookings WHERE id=?`,
        )
        .bind(crypto.randomUUID(), booking.id)
        .run(),
    ).rejects.toThrow("SERVICE_CHANGED");
    const row = await db
      .prepare("SELECT end_min,occupied_until FROM bookings WHERE id=?")
      .bind(booking.id)
      .first();
    expect(row).toMatchObject({ end_min: 980, occupied_until: 995 });
  });
  it("reserves all 17 occupancy units for a 240-minute service and releases them on cancellation", async () => {
    const s = await newService({ duration: 240 });
    const r = await request(
      "/api/admin/series",
      "POST",
      series({ serviceId: s.id, frequency: "once", count: 1 }),
      authA,
    );
    expect(r.status).toBe(201);
    const result = (await r.json()) as {
      bookings: { id: string; serviceDuration: number }[];
    };
    expect(result.bookings[0].serviceDuration).toBe(240);
    const count = async () =>
      (await db
        .prepare(
          "SELECT count(*) n FROM occupied_slots WHERE professional_id=?",
        )
        .bind(a.id)
        .first<{ n: number }>())!.n;
    expect(await count()).toBe(17);
    expect(
      (
        await request(
          "/api/admin/series",
          "POST",
          series({ time: "13:00", frequency: "once", count: 1 }),
          authA,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/api/admin/bookings/${result.bookings[0].id}`,
          "DELETE",
          undefined,
          authA,
        )
      ).status,
    ).toBe(204);
    expect(await count()).toBe(0);
  });
  it("keeps series retries and original terms stable after a catalog edit", async () => {
    const s = await newService();
    const input = series({ serviceId: s.id });
    const first = await request("/api/admin/series", "POST", input, authA);
    expect(first.status).toBe(201);
    const original = await first.json();
    await request(
      `/api/admin/services/${s.id}`,
      "PUT",
      serviceData({ version: 1, duration: 90, priceCents: 20000 }),
      authA,
    );
    const replay = await request("/api/admin/series", "POST", input, authA);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(original);
  });
});

describe("catalog absence and closed working days", () => {
  it("returns an empty array for closed days and after deactivating every service", async () => {
    const d = new Date(`${date()}T12:00:00Z`);
    while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
    const closed = await request(
      `/api/public/${a.slug}/availability?date=${d.toISOString().slice(0, 10)}&serviceId=discovery`,
    );
    expect(closed.status).toBe(200);
    expect(await closed.json()).toEqual([]);
    for (const id of ["discovery", "consulting", "review"])
      expect(
        (
          await request(
            `/api/admin/services/${id}`,
            "PUT",
            serviceData({ version: 1, active: false }),
            authA,
          )
        ).status,
      ).toBe(200);
    expect(
      await (await request(`/api/public/${a.slug}/services`)).json(),
    ).toEqual([]);
  });
});

describe("optional service duration and paid amount", () => {
  it("persists omitted terms, distinguishes paid-to-agree from free, and avoids public occupancy without a duration", async () => {
    const { duration: _duration, priceCents: _price, ...input } = serviceData();
    const response = await request("/api/admin/services", "POST", input, authA);
    expect(response.status).toBe(201);
    const service = (await response.json()) as { id: string; version: number };
    expect(service).toMatchObject({
      duration: null,
      price: null,
      priceMode: "paid",
    });
    const availability = await request(
      `/api/public/${a.slug}/availability?date=${date()}&serviceId=${service.id}`,
    );
    expect(availability.status).toBe(200);
    expect(await availability.json()).toEqual([]);
    const publicRequest = await request(
      `/api/public/${a.slug}/bookings`,
      "POST",
      { ...payload(), serviceId: service.id, email: "fixture@example.com" },
    );
    expect(publicRequest.status).toBe(422);
    expect(
      (
        await request(
          "/api/admin/series",
          "POST",
          series({ serviceId: service.id }),
          authA,
        )
      ).status,
    ).toBe(422);
    const before = await db
      .prepare("SELECT count(*) n FROM occupied_slots WHERE professional_id=?")
      .bind(a.id)
      .first<{ n: number }>();
    expect(before!.n).toBe(0);
    const r = await request(
      "/api/admin/series",
      "POST",
      series({ serviceId: service.id, duration: 50 }),
      authA,
    );
    expect(r.status).toBe(201);
    const result = (await r.json()) as {
      bookings: {
        serviceDuration: number;
        servicePrice: null;
        servicePriceMode: string;
      }[];
    };
    expect(result.bookings).toHaveLength(4);
    for (const booking of result.bookings)
      expect(booking).toMatchObject({
        serviceDuration: 50,
        servicePrice: null,
        servicePriceMode: "paid",
      });
  });
  it("allows public bookings with known duration and no paid amount, preserves them across edits, and validates manual overrides", async () => {
    const s = await newService({ priceCents: null });
    const response = await request(`/api/public/${a.slug}/bookings`, "POST", {
      ...payload(),
      serviceId: s.id,
      email: "fixture@example.com",
    });
    expect(response.status).toBe(201);
    const receipt = (await response.json()) as {
      id: string;
      cancelToken: string;
    };
    expect(receipt).toMatchObject({
      serviceDuration: 50,
      servicePrice: null,
      servicePriceMode: "paid",
    });
    expect(
      (
        await request(
          "/api/admin/series",
          "POST",
          series({ serviceId: s.id, duration: 30 }),
          authA,
        )
      ).status,
    ).toBe(422);
    await request(
      `/api/admin/services/${s.id}`,
      "PUT",
      serviceData({ version: 1, duration: null, priceCents: 20000 }),
      authA,
    );
    const stored = await request(
      `/api/bookings/${receipt.id}`,
      "GET",
      undefined,
      { "X-Cancel-Token": receipt.cancelToken },
    );
    expect(await stored.json()).toMatchObject({
      serviceDuration: 50,
      servicePrice: null,
      servicePriceMode: "paid",
    });
    for (const duration of [null, 0, 50.2, 51, 245])
      expect(
        (
          await request(
            "/api/admin/series",
            "POST",
            series({ serviceId: s.id, serviceVersion: 2, duration }),
            authA,
          )
        ).status,
      ).toBe(422);
  });
});

describe("Calendar HTTP authorization and ownership", () => {
  it("isolates status/disconnection and rejects master, anonymous and forged-origin operations", async () => {
    expect((await request("/api/admin/calendar")).status).toBe(401);
    expect(
      (await request("/api/admin/calendar", "GET", undefined, master)).status,
    ).toBe(403);
    expect(
      (await request("/api/admin/calendar/start", "POST", undefined, master))
        .status,
    ).toBe(403);
    expect(
      (
        await request("/api/admin/calendar/start", "POST", undefined, {
          ...authA,
          Origin: "https://evil.example",
        })
      ).status,
    ).toBe(403);
    for (const p of [a, b])
      await db
        .prepare(
          "INSERT INTO calendar_connections(professional_id,subject,encrypted_refresh_token,generation) VALUES(?,?,?,?)",
        )
        .bind(p.id, p.slug, "encrypted-fixture", crypto.randomUUID())
        .run();
    const status = await request(
      "/api/admin/calendar",
      "GET",
      undefined,
      authA,
    );
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual(
      expect.objectContaining({ state: "connected", enabled: false }),
    );
    expect(
      (
        await request(
          "/api/admin/calendar/busy?date=invalid",
          "GET",
          undefined,
          authA,
        )
      ).status,
    ).toBe(422);
    expect(
      (await request("/api/admin/calendar", "DELETE", undefined, authA)).status,
    ).toBe(204);
    expect(
      await db
        .prepare("SELECT 1 FROM calendar_connections WHERE professional_id=?")
        .bind(a.id)
        .first(),
    ).toBeNull();
    expect(
      await db
        .prepare("SELECT 1 FROM calendar_connections WHERE professional_id=?")
        .bind(b.id)
        .first(),
    ).not.toBeNull();
    const callback = await mf.dispatchFetch(
      base + "/api/admin/calendar/callback?state=invalid&code=fixture",
      { headers: authA, redirect: "manual" },
    );
    expect(callback.status).toBe(303);
    expect(callback.headers.get("Location")).toBe("/admin?calendar=failed");
  });
});
