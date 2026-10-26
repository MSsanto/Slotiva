import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  it,
  expect,
  vi,
} from "vitest";
import {
  processCalendarJobs,
  assertGoogleFree,
  calendarSyncStatus,
  filterGoogleSlots,
  assertGoogleFreeForReplacement,
} from "../worker/calendar-sync";
import { encryptCalendarToken, calendarStatus } from "../worker/calendar";
import { createSeries } from "../worker/recurrence";
import type { Env } from "../worker/types";
import { digest, type Principal } from "../worker/security";
import worker from "../worker/index";
let mf: Miniflare, db: D1Database;
const principal: Principal = {
  provider: "google",
  role: "professional",
  professionalId: "sync-a",
  subject: "sync-sub",
};
const env = (): Env => ({
  DB: db,
  ASSETS: {} as Fetcher,
  AUTH_MODE: "google",
  COOKIE_SECURE: "false",
  PUBLIC_ORIGIN: "http://localhost",
  GOOGLE_CLIENT_ID: "fixture",
  GOOGLE_CLIENT_SECRET: "fixture",
  CALENDAR_TOKEN_KEY: btoa("k".repeat(32)),
});
let id: string;
let remote: Record<string, unknown> | null;
let inserts: number, deletes: number;
let busy: { start: string; end: string }[];
const provider = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  expect(init?.redirect).toBe("manual");
  if (url.includes("oauth2"))
    return Response.json({
      access_token: "fixture-access",
      token_type: "Bearer",
    });
  expect(
    (init?.headers as Record<string, string> | undefined)?.Authorization,
  ).toBe("Bearer fixture-access");
  if (url.endsWith("freeBusy"))
    return Response.json({ calendars: { primary: { busy } } });
  if (init?.method === "POST") {
    inserts++;
    const body = JSON.parse(init.body as string);
    expect(body.summary).toBe("Atendimento — Slotiva");
    expect(body).not.toHaveProperty("description");
    expect(body.attendees).toEqual([{ email: "client@example.com" }]);
    expect(url).toContain("sendUpdates=all");
    if (remote) return new Response(null, { status: 409 });
    remote = { ...body, etag: '"fixture-etag"', status: "confirmed" };
    return Response.json(remote);
  }
  if (init?.method === "DELETE") {
    expect((init.headers as Record<string, string>)["If-Match"]).toBe(
      '"fixture-etag"',
    );
    expect(url).toContain("sendUpdates=all");
    deletes++;
    remote = null;
    return new Response(null, { status: 204 });
  }
  return remote ? Response.json(remote) : new Response(null, { status: 404 });
});
async function queueState() {
  return db
    .prepare("SELECT * FROM calendar_jobs WHERE booking_id=?")
    .bind(id)
    .first<{
      state: string;
      last_error: string;
      revision: number;
      synced_revision: number;
      event_id: string;
    }>();
}
async function retry() {
  await db.prepare("UPDATE calendar_jobs SET next_attempt=0").run();
}
async function cancel() {
  await db
    .prepare(
      "UPDATE bookings SET status='cancelled',cancelled=1,version=version+1,decided_at=unixepoch() WHERE id=?",
    )
    .bind(id)
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
  for (const f of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(
      (await readFile(`migrations/${f}`, "utf8"))
        .replace(/--.*$/gm, "")
        .replace(/\s+/g, " "),
    );
  await db
    .prepare(
      "INSERT INTO professionals(id,slug,display_name,header_title,google_subject) VALUES('sync-a','sync-a','Fixture','Fixture','sync-sub')",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO professional_services(id,professional_id,name,description,duration_minutes,price_mode,price_cents,active,version) VALUES('sync-service','sync-a','Private service','Sensitive details',60,'free',0,1,1)",
    )
    .run();
}, 30000);
beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM sessions"),
    db.prepare("DELETE FROM calendar_jobs"),
    db.prepare("DELETE FROM notification_outbox"),
    db.prepare("DELETE FROM booking_events"),
    db.prepare("DELETE FROM occupied_slots"),
    db.prepare("DELETE FROM bookings"),
    db.prepare("DELETE FROM booking_series"),
    db.prepare("DELETE FROM calendar_connections"),
  ]);
  remote = null;
  inserts = deletes = 0;
  busy = [];
  provider.mockClear();
  // Create while disconnected, then explicitly grant event access.
  const d = new Date(Date.now() + 4 * 86400000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  const result = await createSeries(env(), principal, {
    serviceId: "sync-service",
    serviceVersion: 1,
    date: d.toISOString().slice(0, 10),
    time: "10:00",
    name: "Private client",
    email: "client@example.com",
    requestId: crypto.randomUUID(),
    frequency: "once",
    count: 1,
  });
  id = result.bookings[0].id;
  await db
    .prepare(
      "INSERT INTO calendar_connections(professional_id,subject,encrypted_refresh_token,generation,can_write) VALUES('sync-a','sync-sub',?,'generation',1)",
    )
    .bind(
      await encryptCalendarToken(
        env(),
        "sync-a",
        "sync-sub",
        "refresh-fixture",
      ),
    )
    .run();
});
afterAll(async () => {
  await mf?.dispose();
});
it("creates one private event, sends invitations and cancels the same event without duplicate work", async () => {
  await processCalendarJobs(env(), "sync-a", provider);
  expect(inserts).toBe(1);
  expect((await queueState())?.state).toBe("synced");
  expect(remote?.id).toMatch(/^[a-f0-9]{64}$/);
  await processCalendarJobs(env(), "sync-a", provider);
  expect(inserts).toBe(1);
  await cancel();
  expect((await queueState())?.state).toBe("pending");
  await processCalendarJobs(env(), "sync-a", provider);
  expect(deletes).toBe(1);
  expect(remote).toBeNull();
  expect(await queueState()).toMatchObject({
    state: "synced",
    revision: 2,
    synced_revision: 2,
  });
});
it("recovers a lost insert response without sending another invitation", async () => {
  const flaky = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = await provider(input, init);
    if (init?.method === "POST" && String(input).includes("/events?"))
      throw Error("timeout");
    return r;
  });
  await processCalendarJobs(env(), "sync-a", flaky);
  expect((await queueState())?.state).toBe("failed");
  expect(inserts).toBe(1);
  await retry();
  await processCalendarJobs(env(), "sync-a", provider);
  expect(inserts).toBe(1);
  expect((await queueState())?.state).toBe("synced");
});
it("can cancel an event after its insert response was lost", async () => {
  await processCalendarJobs(env(), "sync-a", async (input, init) => {
    const r = await provider(input, init);
    if (init?.method === "POST" && String(input).includes("/events?"))
      throw Error("timeout");
    return r;
  });
  await cancel();
  await processCalendarJobs(env(), "sync-a", provider);
  expect(deletes).toBe(1);
  expect((await queueState())?.state).toBe("synced");
});
it("never writes with an old read-only grant, disconnected account, or another tenant", async () => {
  await db.prepare("UPDATE calendar_connections SET can_write=0").run();
  expect((await calendarStatus(env(), principal)).mode).toBe(
    "availability_only",
  );
  await processCalendarJobs(env(), undefined, provider);
  expect(provider).not.toHaveBeenCalled();
  await db.prepare("UPDATE calendar_connections SET can_write=1").run();
  await processCalendarJobs(env(), "other-owner", provider);
  expect(provider).not.toHaveBeenCalled();
  expect(await calendarSyncStatus(env(), "other-owner")).toEqual([]);
  await db.prepare("DELETE FROM calendar_connections").run();
  await processCalendarJobs(env(), undefined, provider);
  expect(provider).not.toHaveBeenCalled();
});
it("records conflicts, leaves the reservation intact, and retries after resolution", async () => {
  const b = await db
    .prepare("SELECT starts_at FROM bookings WHERE id=?")
    .bind(id)
    .first<{ starts_at: number }>();
  busy = [
    {
      start: new Date(b!.starts_at * 1000).toISOString(),
      end: new Date((b!.starts_at + 3600) * 1000).toISOString(),
    },
  ];
  await processCalendarJobs(env(), "sync-a", provider);
  expect(inserts).toBe(0);
  expect(await queueState()).toMatchObject({
    state: "conflict",
    last_error: "conflict",
  });
  await expect(
    assertGoogleFree(
      env(),
      "sync-a",
      [{ startsAt: b!.starts_at, start: 600, end: 660 }],
      provider,
    ),
  ).rejects.toThrow("ocupado");
  busy = [];
  await retry();
  await processCalendarJobs(env(), "sync-a", provider);
  expect(inserts).toBe(1);
});
it("does not claim success or follow redirects on provider failure", async () => {
  await processCalendarJobs(env(), "sync-a", async (input, init) =>
    String(input).includes("oauth2")
      ? provider(input, init)
      : new Response(null, {
          status: 302,
          headers: { Location: "https://untrusted.example" },
        }),
  );
  expect(await queueState()).toMatchObject({
    state: "failed",
    last_error: "provider",
  });
  expect(inserts).toBe(0);
});
it("leases prevent concurrent delivery and a cancelled booking is not created", async () => {
  await Promise.all([
    processCalendarJobs(env(), "sync-a", provider),
    processCalendarJobs(env(), "sync-a", provider),
  ]);
  expect(inserts).toBe(1);
  await cancel();
  await processCalendarJobs(env(), "sync-a", provider);
  expect(deletes).toBe(1);
});
it("compensates a cancellation that races with event creation", async () => {
  await processCalendarJobs(env(), "sync-a", async (input, init) => {
    const r = await provider(input, init);
    if (init?.method === "POST" && String(input).includes("/events?"))
      await cancel();
    return r;
  });
  expect((await queueState())?.state).toBe("pending");
  await processCalendarJobs(env(), "sync-a", provider);
  expect(deletes).toBe(1);
  expect((await queueState())?.state).toBe("synced");
});
it("does not recreate events deleted externally or delete unrelated events", async () => {
  remote = {
    status: "cancelled",
    extendedProperties: { private: { slotivaBooking: id } },
  };
  await processCalendarJobs(env(), "sync-a", provider);
  expect(await queueState()).toMatchObject({ last_error: "event_changed" });
  expect(inserts).toBe(0);
  remote = {
    status: "confirmed",
    etag: '"fixture-etag"',
    extendedProperties: { private: { slotivaBooking: "other" } },
  };
  await cancel();
  await processCalendarJobs(env(), "sync-a", provider);
  expect(deletes).toBe(0);
  expect(await queueState()).toMatchObject({ last_error: "event_changed" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
it("refuses a conflicting approval at the HTTP boundary without changing the reservation", async () => {
  await db
    .prepare(
      "INSERT INTO sessions(token_hash,expires_at,provider,subject,role,professional_id) VALUES(?,unixepoch()+3600,'google','sync-sub','professional','sync-a')",
    )
    .bind(await digest("fixture-session"))
    .run();
  const previous = await db
    .prepare("SELECT date FROM bookings WHERE id=?")
    .bind(id)
    .first<{ date: string }>();
  const request = await worker.fetch(
    new Request("http://localhost/api/public/sync-a/bookings", {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        serviceId: "sync-service",
        serviceVersion: 1,
        date: previous!.date,
        time: "14:00",
        name: "Fixture",
        email: "client@example.com",
      }),
    }),
    env(),
  );
  expect(request.status).toBe(201);
  const booking = (await request.json()) as { id: string; version: number };
  const pending = await db
    .prepare("SELECT starts_at FROM bookings WHERE id=?")
    .bind(booking.id)
    .first<{ starts_at: number }>();
  busy = [
    {
      start: new Date(pending!.starts_at * 1000).toISOString(),
      end: new Date((pending!.starts_at + 3600) * 1000).toISOString(),
    },
  ];
  vi.stubGlobal("fetch", provider);
  const approve = () =>
    worker.fetch(
      new Request(`http://localhost/api/admin/bookings/${booking.id}/approve`, {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          Cookie: "slotiva_session=fixture-session",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: booking.version }),
      }),
      env(),
    );
  expect((await approve()).status).toBe(409);
  expect(
    await db
      .prepare("SELECT status,version FROM bookings WHERE id=?")
      .bind(booking.id)
      .first(),
  ).toMatchObject({ status: "pending_approval", version: booking.version });
  busy = [];
  expect((await approve()).status).toBe(200);
  expect(
    await db
      .prepare("SELECT state FROM calendar_jobs WHERE booking_id=?")
      .bind(booking.id)
      .first(),
  ).toMatchObject({ state: "pending" });
});
it("rejects a conflicting series atomically and fails closed on revoked access", async () => {
  const b = await db
    .prepare("SELECT starts_at,date FROM bookings WHERE id=?")
    .bind(id)
    .first<{ starts_at: number; date: string }>();
  const nextStart = b!.starts_at + 4 * 3600;
  busy = [
    {
      start: new Date(nextStart * 1000).toISOString(),
      end: new Date((nextStart + 3600) * 1000).toISOString(),
    },
  ];
  vi.stubGlobal("fetch", provider);
  await expect(
    createSeries(env(), principal, {
      serviceId: "sync-service",
      serviceVersion: 1,
      date: b!.date,
      time: "14:00",
      name: "Fixture",
      email: "client@example.com",
      requestId: crypto.randomUUID(),
      frequency: "weekly",
      count: 2,
    }),
  ).rejects.toThrow("ocupado");
  expect(
    await db.prepare("SELECT count(*) AS n FROM bookings").first(),
  ).toMatchObject({ n: 1 });
  await db
    .prepare("UPDATE calendar_connections SET state='reconnect_required'")
    .run();
  await expect(
    assertGoogleFree(
      env(),
      "sync-a",
      [{ startsAt: nextStart, start: 840, end: 900 }],
      provider,
    ),
  ).rejects.toThrow("Autorize novamente");
});
it("keeps a cancellation queued if consent is revoked during the external read", async () => {
  await processCalendarJobs(env(), "sync-a", provider);
  await cancel();
  await processCalendarJobs(env(), "sync-a", async (input, init) => {
    const r = await provider(input, init);
    if (String(input).includes("/events/") && !init?.method)
      await db.prepare("DELETE FROM calendar_connections").run();
    return r;
  });
  expect(deletes).toBe(0);
  expect((await queueState())?.state).toBe("failed");
});
it("cancels only the selected occurrence of a synchronized series", async () => {
  const saved = new Map<string, Record<string, unknown>>();
  const multi: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/events")) {
      const eventId =
        init?.method === "POST"
          ? JSON.parse(init.body as string).id
          : new URL(url).pathname.split("/").at(-1)!;
      remote = saved.get(eventId) ?? null;
      const response = await provider(input, init);
      if (remote) saved.set(eventId, remote);
      else saved.delete(eventId);
      return response;
    }
    return provider(input, init);
  };
  vi.stubGlobal("fetch", multi);
  const b = await db
    .prepare("SELECT date FROM bookings WHERE id=?")
    .bind(id)
    .first<{ date: string }>();
  const series = await createSeries(env(), principal, {
    serviceId: "sync-service",
    serviceVersion: 1,
    date: b!.date,
    time: "14:00",
    name: "Fixture",
    email: "client@example.com",
    requestId: crypto.randomUUID(),
    frequency: "weekly",
    count: 2,
  });
  await processCalendarJobs(env(), "sync-a", multi);
  expect(saved.size).toBe(3);
  id = series.bookings[0].id;
  await cancel();
  await processCalendarJobs(env(), "sync-a", multi);
  expect(saved.size).toBe(2);
  expect(deletes).toBe(1);
  expect(
    await db
      .prepare("SELECT status FROM bookings WHERE id=?")
      .bind(series.bookings[1].id)
      .first(),
  ).toMatchObject({ status: "confirmed" });
});

it("filters public slots using Google occupancy and the scheduling buffer, including read-only grants", async () => {
  const row = await db
    .prepare("SELECT date,starts_at FROM bookings WHERE id=?")
    .bind(id)
    .first<{ date: string; starts_at: number }>();
  busy = [
    {
      start: new Date(row!.starts_at * 1000).toISOString(),
      end: new Date((row!.starts_at + 3600) * 1000).toISOString(),
    },
  ];
  await db.prepare("UPDATE calendar_connections SET can_write=0").run();
  expect(
    await filterGoogleSlots(
      env(),
      "sync-a",
      row!.date,
      ["09:00", "10:00", "11:00", "12:00"],
      60,
      provider,
    ),
  ).toEqual(["11:00", "12:00"]);
  await expect(
    filterGoogleSlots(
      env(),
      "sync-a",
      row!.date,
      ["09:00"],
      60,
      async (input, init) =>
        String(input).includes("oauth2")
          ? provider(input, init)
          : new Response(null, { status: 503 }),
    ),
  ).rejects.toThrow("agenda externa");
});


it("ignores only the exact linked event when checking a replacement",async()=>{
 const row=await db.prepare("SELECT starts_at FROM bookings WHERE id=?").bind(id).first<{starts_at:number}>();
 const eventId=await digest("slotiva-event-v1:sync-a:sync-sub:"+id);
 const own={id:eventId,status:"confirmed",start:{dateTime:new Date(row!.starts_at*1000).toISOString()},end:{dateTime:new Date((row!.starts_at+3600)*1000).toISOString()},extendedProperties:{private:{slotivaBooking:id}}};
 let items=[own];
 const list:typeof fetch=async(input,init)=>String(input).includes("/events?")?Response.json({kind:"calendar#events",items}):provider(input,init);
 const ranges=[{startsAt:row!.starts_at,start:600,end:660}];
 await expect(assertGoogleFreeForReplacement(env(),"sync-a",ranges,[id],list)).resolves.toBeUndefined();
 items=[own,{...own,id:"unrelated-event"}];
 await expect(assertGoogleFreeForReplacement(env(),"sync-a",ranges,[id],list)).rejects.toThrow("ocupado");
});
it("reports externally moved or deleted synced events without recreating them",async()=>{
 await processCalendarJobs(env(),"sync-a",provider);expect(inserts).toBe(1);
 remote={...remote,start:{dateTime:new Date(Date.now()+1000).toISOString()}};
 await db.prepare("UPDATE calendar_jobs SET state='pending',next_attempt=0").run();
 await processCalendarJobs(env(),"sync-a",provider);
 expect(await queueState()).toMatchObject({last_error:"event_changed"});
 remote=null;
 await db.prepare("UPDATE calendar_jobs SET state='pending',next_attempt=0").run();
 await processCalendarJobs(env(),"sync-a",provider);
 expect(await queueState()).toMatchObject({last_error:"event_changed"});expect(inserts).toBe(1);
});
it("accepts a deleted tombstone when propagating a local cancellation",async()=>{
 await processCalendarJobs(env(),"sync-a",provider);await cancel();
 remote={id:(await queueState())!.event_id,status:"cancelled"};
 await processCalendarJobs(env(),"sync-a",provider);
 expect((await queueState())?.state).toBe("synced");expect(deletes).toBe(0);
});
it("fails closed on malformed or unbounded event-list responses",async()=>{
 const row=await db.prepare("SELECT starts_at FROM bookings WHERE id=?").bind(id).first<{starts_at:number}>();
 const ranges=[{startsAt:row!.starts_at,start:600,end:660}];
 await expect(assertGoogleFreeForReplacement(env(),"sync-a",ranges,[id],async(input,init)=>String(input).includes("/events?")?Response.json({}):provider(input,init))).rejects.toThrow("agenda externa");
 let pages=0;
 await expect(assertGoogleFreeForReplacement(env(),"sync-a",ranges,[id],async(input,init)=>{if(String(input).includes("/events?")){pages++;return Response.json({kind:"calendar#events",items:[],nextPageToken:"more"});}return provider(input,init);})).rejects.toThrow("consulta maior");
 expect(pages).toBe(4);
});
