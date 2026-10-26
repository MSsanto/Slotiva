import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const base = "http://127.0.0.1:8788";
const profile = await (await fetch(`${base}/api/public/demo/profile`)).json();
const auth = await (await fetch(`${base}/api/auth/config`)).json();
if (
  profile.displayName !== "Marina Exemplo" ||
  profile.headerTitle !== "Agenda de demonstração" ||
  auth.googleEnabled ||
  !auth.passwordEnabled
)
  throw Error("Capture requires the isolated fictional demo on port 8788.");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Marina Exemplo", exact: true })
    .waitFor();
  const destination = fileURLToPath(
    new URL("../docs/images/", import.meta.url),
  );
  await mkdir(destination, { recursive: true });
  await page
    .locator(".workspace")
    .screenshot({ path: destination + "demo.png" });
  console.log("Saved docs/images/demo.png from the isolated fictional demo.");
} finally {
  await browser.close();
}
