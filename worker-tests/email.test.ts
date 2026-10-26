import { listClients } from "../worker/clients";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import worker from "../worker/index";
import {
  emailEnabled,
  processEmailJobs,
  requestRecovery,
  limitBookingEmails,
} from "../worker/email";
import type { Env } from "../worker/types";
let mf: Miniflare, db: D1Database, id: string;
const env = (): Env => ({
  DB: db,
  ASSETS: {} as Fetcher,
  AUTH_MODE: "google",
  PUBLIC_ORIGIN: "http://localhost",
  COOKIE_SECURE: "false",
  EMAIL_ENABLED: "true",
  EMAIL_API_KEY: "fixture-key",
  EMAIL_FROM: "slotiva@example.com",
  EMAIL_TOKEN_KEY: btoa("e".repeat(32)),
});
const req = (path: string, data?: unknown) =>
  new Request(`http://localhost${path}`, {
    method: data ? "POST" : "GET",
    headers: {
      Origin: "http://localhost",
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
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
      "INSERT INTO professionals(id,slug,display_name,header_title,google_subject) VALUES('mail-a','mail-a','Fixture','Fixture','mail-sub')",
    )
    .run();
}, 30000);
beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM email_jobs"),
    db.prepare("DELETE FROM recovery_limits"),
    db.prepare("DELETE FROM customer_grants"),
    db.prepare("DELETE FROM customer_links"),
    db.prepare("DELETE FROM calendar_jobs"),
    db.prepare("DELETE FROM notification_outbox"),
    db.prepare("DELETE FROM booking_events"),
    db.prepare("DELETE FROM occupied_slots"),
    db.prepare("DELETE FROM bookings"),
  ]);
  const d = new Date(Date.now() + 4 * 86400000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  const r = await worker.fetch(
    req("/api/public/mail-a/bookings", {
      serviceId: "discovery",
      serviceVersion: 1,
      date: d.toISOString().slice(0, 10),
      time: "09:00",
      name: "Private fixture",
      email: "deliver@example.com",
    }),
    env(),
  );
  expect(r.status).toBe(201);
  id = ((await r.json()) as { id: string }).id;
});
afterAll(async () => {
  await mf?.dispose();
});
it("does not send before explicit configuration and reports provider acceptance without a delivery claim", async () => {
  const send = vi.fn(async () => Response.json({ id: "provider-fixture" }));
  expect(emailEnabled({ ...env(), EMAIL_ENABLED: undefined })).toBe(false);
  await processEmailJobs(
    { ...env(), EMAIL_ENABLED: undefined },
    undefined,
    send,
  );
  expect(send).not.toHaveBeenCalled();
  await processEmailJobs(env(), "mail-a", send);
  expect(send).toHaveBeenCalledTimes(1);
  const row = await db
    .prepare(
      "SELECT state,body_encrypted,provider_id FROM email_jobs WHERE booking_id=?",
    )
    .bind(id)
    .first();
  expect(row).toEqual({
    state: "accepted",
    body_encrypted: null,
    provider_id: "provider-fixture",
  });
});
it("retries a lost response with exactly the same payload and idempotency key", async () => {
  const bodies: string[] = [],
    keys: string[] = [];
  const send = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(String(init?.body));
    keys.push(
      (init?.headers as Record<string, string> | undefined)?.[
        "Idempotency-Key"
      ] ?? "",
    );
    expect(init?.redirect).toBe("manual");
    if (bodies.length === 1) throw Error("lost response");
    return Response.json({ id: "fixture" });
  });
  await processEmailJobs(env(), "mail-a", send);
  const pending = await db
    .prepare("SELECT body_encrypted FROM email_jobs WHERE booking_id=?")
    .bind(id)
    .first<{ body_encrypted: string }>();
  expect(pending!.body_encrypted).not.toContain("deliver@example.com");
  await db.prepare("UPDATE email_jobs SET next_attempt=0").run();
  await processEmailJobs(env(), "mail-a", send);
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
  expect(keys[0]).toBe(keys[1]);
});
it("keeps recovery responses generic and redeems the emailed link only once", async () => {
  const wrong = await worker.fetch(
    req("/api/customer/recovery", {
      bookingId: id,
      email: "wrong@example.com",
      slug: "mail-a",
    }),
    env(),
  );
  const right = await worker.fetch(
    req("/api/customer/recovery", {
      bookingId: id,
      email: "deliver@example.com",
      slug: "mail-a",
    }),
    env(),
  );
  expect(wrong.status).toBe(202);
  expect(await wrong.json()).toEqual(await right.json());
  let text = "";
  await processEmailJobs(env(), "mail-a", async (_input, init) => {
    const mail = JSON.parse(String(init?.body));
    expect(mail.to).toEqual(["deliver@example.com"]);
    if (mail.subject.includes("link de acesso")) text = mail.text;
    return Response.json({ id: crypto.randomUUID() });
  });
  const token = text.match(/#access=([a-f0-9]{64})/)?.[1];
  expect(token).toBeTruthy();
  const redeemed = await worker.fetch(
    req("/api/customer/access", { token }),
    env(),
  );
  expect(redeemed.status).toBe(200);
  expect(
    await db
      .prepare(
        "SELECT booking_id FROM verified_booking_contacts WHERE booking_id=?",
      )
      .bind(id)
      .first(),
  ).toEqual({ booking_id: id });
  const contacts = await listClients(env(), "mail-a", "", false);
  expect(contacts.find((c) => c.id === id)?.emailVerifiedAt).not.toBeNull();
  await db
    .prepare(
      "UPDATE clients SET email='changed@example.com',version=version+1 WHERE id=?",
    )
    .bind(id)
    .run();
  expect(
    (await listClients(env(), "mail-a", "", false)).find((c) => c.id === id)
      ?.emailVerifiedAt,
  ).toBeNull();
  const cookie = redeemed.headers.get("Set-Cookie")!.split(";")[0];
  expect(
    (
      await worker.fetch(
        new Request(`http://localhost/api/bookings/${id}`, {
          headers: { Cookie: cookie },
        }),
        env(),
      )
    ).status,
  ).toBe(200);
  expect(
    (await worker.fetch(req("/api/customer/access", { token }), env())).status,
  ).toBe(404);
});
it("bounds recovery requests and clears expired encrypted payloads", async () => {
  for (let i = 0; i < 8; i++)
    await requestRecovery(req("/api/customer/recovery"), env(), {
      bookingId: id,
      email: "deliver@example.com",
      slug: "mail-a",
    });
  expect(
    await db
      .prepare("SELECT count(*) AS n FROM email_jobs WHERE kind='recovery'")
      .first(),
  ).toEqual({ n: 3 });
  await db.prepare("UPDATE email_jobs SET expires_at=unixepoch()-1").run();
  const send = vi.fn(async () => Response.json({ id: "fixture" }));
  await processEmailJobs(env(), undefined, send);
  expect(send).not.toHaveBeenCalled();
  expect(
    await db
      .prepare(
        "SELECT count(*) AS n FROM email_jobs WHERE body_encrypted IS NOT NULL",
      )
      .first(),
  ).toEqual({ n: 0 });
});
it("serializes concurrent senders and refuses redirects without marking messages accepted", async () => {
  const send = vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://untrusted.example" },
      }),
  );
  await Promise.all([
    processEmailJobs(env(), "mail-a", send),
    processEmailJobs(env(), "mail-a", send),
  ]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    await db
      .prepare("SELECT state FROM email_jobs WHERE booking_id=?")
      .bind(id)
      .first(),
  ).toEqual({ state: "failed" });
});

it("bounds public request attempts when email is enabled without exposing recipient usage", async () => {
  await db.prepare("DELETE FROM recovery_limits").run();
  const request = req("/api/public/mail-a/bookings");
  for (let index = 0; index < 20; index++) {
    await expect(limitBookingEmails(request, env())).resolves.toBeUndefined();
  }
  await expect(limitBookingEmails(request, env())).rejects.toThrow(
    "Muitas tentativas",
  );
  await expect(
    limitBookingEmails(request, { ...env(), EMAIL_ENABLED: "false" }),
  ).resolves.toBeUndefined();
});
