import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { expect, it } from "vitest";
import { digest } from "../worker/security";

it.each([
  [400, "exchange_invalid_request"],
  [302, "exchange_redirect_blocked"],
  [503, "exchange_unavailable"],
] as const)(
  "reaches Calendar token exchange with workerd fetch and rejects HTTP %s safely",
  async (status, reason) => {
    const bundle = await build({
      entryPoints: ["worker/index.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
    });
    let exchanges = 0;
    let challenge = "";
    const mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: bundle.outputFiles[0].text,
        compatibilityDate: "2026-10-19",
        d1Databases: ["DB"],
        host: "127.0.0.1",
        bindings: {
          COOKIE_SECURE: "false",
          AUTH_MODE: "google",
          PUBLIC_ORIGIN: "http://localhost",
          GOOGLE_CLIENT_ID: "calendar-fixture",
          GOOGLE_CLIENT_SECRET: "fixture-client-secret",
          MASTER_GOOGLE_SUBS: "fixture-master",
          CALENDAR_TOKEN_KEY: btoa("k".repeat(32)),
        },
        outboundService: async (request) => {
          exchanges++;
          expect(request.url).toBe("https://oauth2.googleapis.com/token");
          expect(request.method).toBe("POST");
          expect(request.headers.get("Content-Type")).toBe(
            "application/x-www-form-urlencoded",
          );
          const body = new URLSearchParams(await request.text());
          expect(body.get("client_id")).toBe("calendar-fixture");
          expect(body.get("client_secret")).toBe("fixture-client-secret");
          expect(body.get("redirect_uri")).toBe(
            "http://localhost/api/admin/calendar/callback",
          );
          expect(body.get("grant_type")).toBe("authorization_code");
          expect(body.get("code")).toBe("fictional-code");
          const verifier = body.get("code_verifier")!;
          expect(verifier).toMatch(/^[a-f0-9]{64}$/);
          const bytes = new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(verifier),
            ),
          );
          expect(
            btoa(String.fromCharCode(...bytes))
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, ""),
          ).toBe(challenge);
          return Response.json(
            {
              error: "invalid_request",
              error_description: "private-provider-description",
            },
            {
              status,
              headers:
                status === 302
                  ? { Location: "https://unexpected.example/token" }
                  : {},
            },
          );
        },
      }),
    );
    try {
      const db = await mf.getD1Database("DB");
      for (const file of (await readdir("migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort())
        await db.exec(
          (await readFile(`migrations/${file}`, "utf8"))
            .replace(/--.*$/gm, "")
            .replace(/\s+/g, " "),
        );
      await db
        .prepare(
          "INSERT INTO professionals(id,slug,display_name,header_title,google_subject) VALUES('calendar-fixture','calendar-fixture','Fixture','Appointments','fixture-subject')",
        )
        .run();
      await db
        .prepare(
          "INSERT INTO sessions(token_hash,expires_at,provider,subject,role,professional_id) VALUES(?,unixepoch()+3600,'google','fixture-subject','professional','calendar-fixture')",
        )
        .bind(await digest("fixture-session"))
        .run();
      const headers = {
        Origin: "http://localhost",
        Cookie: "slotiva_session=fixture-session",
      };
      const start = await mf.dispatchFetch(
        "http://localhost/api/admin/calendar/start",
        {
          method: "POST",
          headers,
          redirect: "manual",
        },
      );
      expect(start.status).toBe(303);
      const auth = new URL(start.headers.get("Location")!);
      challenge = auth.searchParams.get("code_challenge")!;
      const callback =
        "http://localhost/api/admin/calendar/callback?" +
        new URLSearchParams({
          state: auth.searchParams.get("state")!,
          code: "fictional-code",
        });
      const result = await mf.dispatchFetch(callback, {
        headers,
        redirect: "manual",
      });
      expect(exchanges).toBe(1);
      expect(result.headers.get("Location")).toBe(
        `/admin?calendar=failed&calendar_reason=${reason}&calendar_http=${status}`,
      );
      expect(JSON.stringify([...result.headers])).not.toContain(
        "private-provider-description",
      );
      expect(
        await db.prepare("SELECT 1 FROM calendar_connections").first(),
      ).toBeNull();
      await mf.dispatchFetch(callback, { headers, redirect: "manual" });
      expect(exchanges).toBe(1);
    } finally {
      await mf.dispose();
    }
  },
  30000,
);
