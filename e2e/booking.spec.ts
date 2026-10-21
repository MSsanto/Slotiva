import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("request, edit, approve and cancel with a live customer receipt", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Reserve seu momento" }),
  ).toBeVisible();
  const calendar = await (await page.request.get("/api/calendar")).json();
  let selected = "";
  let times: string[] = [];
  for (let i = 1; i <= calendar.horizonDays; i++) {
    const d = new Date(`${calendar.today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const r = await page.request.get(
      `/api/availability?date=${key}&serviceId=discovery`,
    );
    const available = await r.json();
    // Two half-hour starts can overlap the 30-minute service + 15-minute buffer.
    // Pick a day with a genuinely separate edit target, even near the 48h cutoff.
    if (available.length >= 3) {
      selected = key;
      times = available;
      await page
        .locator(".days button")
        .nth(i - 1)
        .click();
      break;
    }
  }
  expect(selected).not.toBe("");
  await page.getByRole("button", { name: times[0], exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nome", exact: true })
    .fill("Browser Demo");
  await page
    .getByRole("textbox", { name: "E-mail", exact: true })
    .fill("browser@example.com");
  await page
    .getByRole("button", { name: "Solicitar agendamento", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Acompanhe sua solicitação." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Alterar solicitação", exact: true })
    .click();
  const offset =
    Math.round(
      (new Date(`${selected}T12:00:00Z`).getTime() -
        new Date(`${calendar.today}T12:00:00Z`).getTime()) /
        86400000,
    ) - 1;
  await page.locator(".days button").nth(offset).click();
  await page.getByRole("button", { name: times.at(-1)!, exact: true }).click();
  await page
    .getByRole("button", { name: "Alterar solicitação", exact: true })
    .click();
  await expect(page.locator(".receipt")).toContainText(times.at(-1)!);
  const professional = await page.context().newPage();
  await professional.goto("/admin");
  await expect(
    professional.getByRole("heading", { name: "Acesso do profissional" }),
  ).toBeVisible();
  await professional
    .getByLabel("Senha administrativa")
    .fill("test-password-long");
  await professional
    .getByRole("button", { name: "Entrar", exact: true })
    .click();
  await expect(
    professional.getByRole("heading", { name: "Minha agenda" }),
  ).toBeVisible();
  await professional.reload();
  const row = professional
    .locator(".appointment")
    .filter({ hasText: "Browser Demo" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Aguardando aprovação");
  await row.getByRole("button", { name: "Aprovar", exact: true }).click();
  await expect(row).toContainText("Confirmado pelo profissional");
  await page.bringToFront();
  await expect(
    page.getByRole("heading", { name: "Seu horário foi confirmado." }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Alterar solicitação", exact: true }),
  ).toHaveCount(0);
  await row.getByRole("button", { name: "Cancelar reserva" }).click();
  await expect(row).toContainText("Cancelado");
  await page.bringToFront();
  await expect(page.locator(".eyebrow")).toContainText("Cancelado", {
    timeout: 20000,
  });
  await expect(
    page.getByRole("button", { name: "Cancelar esta reserva" }),
  ).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: "Aprovar", exact: true }),
  ).toHaveCount(0);
  await professional.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    professional.getByRole("heading", { name: "Acesso do profissional" }),
  ).toBeVisible();
});

test("mobile layout, keyboard entry and automated accessibility check", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Reserve seu momento" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Pular para o conteúdo" }),
  ).toBeFocused();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const desktop = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(desktop.violations).toEqual([]);
});
