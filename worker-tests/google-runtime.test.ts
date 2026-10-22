import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { expect, it } from "vitest";

it("reaches the token endpoint through native workerd fetch in the default OAuth path", async () => {
  const bundle = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  let exchanges = 0;
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
        GOOGLE_CLIENT_ID: "fictional-client",
        GOOGLE_CLIENT_SECRET: "fictional-secret",
        MASTER_GOOGLE_SUBS: "fictional-master",
      },
      outboundService: async (request) => {
        expect(request.url).toBe("https://oauth2.googleapis.com/token");
        expect(request.method).toBe("POST");
        const body = new URLSearchParams(await request.text());
        expect(body.get("client_id")).toBe("fictional-client");
        expect(body.get("client_secret")).toBe("fictional-secret");
        expect(body.get("redirect_uri")).toBe(
          "http://localhost/api/admin/google/callback",
        );
        expect(body.get("code_verifier")).toMatch(/^[a-f0-9]{64}$/);
        exchanges++;
        return Response.json({ error: "invalid_client" }, { status: 401 });
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
    const start = await mf.dispatchFetch(
      "http://localhost/api/admin/google/start",
      {
        method: "POST",
        headers: { Origin: "http://localhost" },
        redirect: "manual",
      },
    );
    expect(start.status).toBe(303);
    const state = new URL(start.headers.get("Location")!).searchParams.get(
      "state",
    )!;
    const cookie = start.headers.get("Set-Cookie")!.split(";")[0];
    const callback =
      "http://localhost/api/admin/google/callback?" +
      new URLSearchParams({ state, code: "fictional-code" });
    const result = await mf.dispatchFetch(callback, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    expect(exchanges).toBe(1);
    expect(result.status).toBe(303);
    expect(result.headers.get("Location")).toBe(
      "/admin?google=failed&reason=exchange_invalid_client",
    );
    expect(await db.prepare("SELECT 1 FROM sessions").first()).toBeNull();
    await mf.dispatchFetch(callback, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });
    expect(exchanges).toBe(1);
  } finally {
    await mf.dispose();
  }
}, 30000);
