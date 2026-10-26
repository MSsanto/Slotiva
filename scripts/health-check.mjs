const target = new URL(
  process.argv[2] ??
    "https://feat-product-readiness-slotiva.matheus-sergio.workers.dev/api/health",
);
if (
  target.username ||
  target.password ||
  target.hash ||
  target.search ||
  (target.protocol !== "https:" &&
    !(
      ["localhost", "127.0.0.1"].includes(target.hostname) &&
      target.protocol === "http:"
    ))
)
  throw Error(
    "Use an HTTPS health URL without credentials or query parameters.",
  );
const started = performance.now();
try {
  const response = await fetch(target, {
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  if (!response.ok || body.status !== "ok" || body.storage !== "D1")
    throw Error(`Unexpected health response: HTTP ${response.status}`);
  console.log(
    JSON.stringify({
      status: "ok",
      host: target.host,
      checkedAt: new Date().toISOString(),
      latencyMs: Math.round(performance.now() - started),
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "unavailable",
      host: target.host,
      checkedAt: new Date().toISOString(),
      detail: error.message,
    }),
  );
  process.exitCode = 1;
}
