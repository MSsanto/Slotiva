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
  await expect(page.locator(".confirmation .eyebrow")).toContainText(
    "Cancelado",
    {
      timeout: 20000,
    },
  );
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

test("Google-only setup never offers a password fallback", async ({ page }) => {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { googleEnabled: false, passwordEnabled: false } }),
  );
  await page.goto("/admin");
  await expect(
    page.getByText(
      "Acesso profissional aguardando configuração do responsável.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Senha administrativa")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toHaveCount(0);
});

test("professional enters a fortnightly agreement and cancels one occurrence then the remaining series", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByLabel("Senha administrativa").fill("test-password-long");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const form = page.locator("form").filter({
    has: page.getByRole("heading", {
      name: "Horário combinado com o cliente",
    }),
  });
  await expect(form).toBeVisible();
  const calendar = await (await page.request.get("/api/calendar")).json();
  const d = new Date(`${calendar.today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 21);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  await form
    .getByLabel("Nome ou identificação do cliente")
    .fill("Recurring Browser Demo");
  await form.getByLabel("Primeira data").fill(d.toISOString().slice(0, 10));
  await form.getByLabel("Horário fixo").fill("11:00");
  await form
    .getByLabel("Frequência", { exact: true })
    .selectOption("fortnightly");
  await form.getByLabel("Quantidade de encontros").fill("3");
  await form
    .getByRole("button", { name: "Confirmar encontros combinados" })
    .click();
  await expect(form.getByRole("status")).toContainText(
    "3 encontro(s) confirmado(s)",
  );
  const rows = page
    .locator(".appointment")
    .filter({ hasText: "Recurring Browser Demo" });
  await expect(rows).toHaveCount(3);
  await rows
    .first()
    .getByRole("button", { name: "Cancelar reserva", exact: true })
    .click();
  await expect(rows.first()).toContainText("Cancelado");
  page.once("dialog", (dialog) => dialog.accept());
  await rows
    .nth(1)
    .getByRole("button", { name: "Cancelar próximos da série" })
    .click();
  await expect(rows.filter({ hasText: "Cancelado" })).toHaveCount(3);
});

test("master manages professionals and their public links in the UI (API fixtures)", async ({
  page,
}) => {
  let profiles: Record<string, unknown>[] = [];
  await page.route("**/api/master/session", (r) =>
    r.fulfill({ json: { authenticated: true, role: "master" } }),
  );
  await page.route("**/api/master/professionals**", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const data = req.postDataJSON();
      profiles.push({
        ...data,
        id: "fixture-prof",
        status: "active",
        version: 1,
      });
      await route.fulfill({ status: 201, json: profiles[0] });
    } else if (req.method() === "DELETE") {
      profiles = [];
      await route.fulfill({ status: 204 });
    } else await route.fulfill({ json: profiles });
  });
  await page.goto("/master");
  const form = page.locator("form");
  await form.getByLabel("Nome profissional").fill("Fictional Psychologist");
  await form.getByLabel("Título do cabeçalho").fill("Meu horário de encontro");
  await form.getByLabel("Subtítulo").fill("Agenda semanal e quinzenal");
  await form.getByLabel("Endereço público").fill("fictional-psychologist");
  await form.getByLabel("E-mail Google convidado").fill("fictional@gmail.com");
  await form.getByRole("button", { name: "Criar profissional" }).click();
  await expect(
    page.getByRole("link", { name: "/p/fictional-psychologist" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Excluir profissional", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "/p/fictional-psychologist" }),
  ).toHaveCount(0);
});
