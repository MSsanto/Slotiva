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
  await expect(row).toHaveCount(0);
  await professional.getByRole("tab", { name: /^Cancelados/ }).click();
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

test("professional explicitly chooses only this occurrence or all future series encounters", async ({
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
  await form.getByLabel("Frequência").selectOption("fortnightly");
  await form.getByLabel("Quantidade de encontros").fill("4");
  await form
    .getByRole("button", { name: "Confirmar encontros combinados" })
    .click();
  await expect(form.getByRole("status")).toContainText(
    "4 encontro(s) confirmado(s)",
  );
  const rows = page
    .locator(".appointment")
    .filter({ hasText: "Recurring Browser Demo" });
  await expect(rows).toHaveCount(4);
  page.once("dialog", async (dialog) => {
    await dialog.dismiss();
  });
  await rows
    .nth(2)
    .getByRole("button", { name: "Cancelar só esta", exact: true })
    .click();
  await expect(rows.filter({ hasText: "Cancelado" })).toHaveCount(0);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Cancelar somente o encontro de");
    expect(dialog.message()).toContain(
      "Os outros encontros da série serão preservados.",
    );
    await dialog.accept();
  });
  await rows
    .nth(2)
    .getByRole("button", { name: "Cancelar só esta", exact: true })
    .click();
  await expect(rows).toHaveCount(3);
  await expect(
    rows.filter({ hasText: "Confirmado pelo profissional" }),
  ).toHaveCount(3);
  await page.getByRole("tab", { name: /^Cancelados/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Cancelado");
  await expect(rows.getByRole("button")).toHaveCount(0);
  await page.getByRole("tab", { name: /^Agenda/ }).click();
  await expect(rows).toHaveCount(3);
  page.once("dialog", async (dialog) => {
    await dialog.dismiss();
  });
  await rows
    .nth(1)
    .getByRole("button", { name: "Cancelar todas da série", exact: true })
    .click();
  await expect(rows).toHaveCount(3);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(
      "Cancelar TODOS os encontros futuros desta série",
    );
    expect(dialog.message()).toContain(
      "inclusive os anteriores à data desta ocorrência",
    );
    await dialog.accept();
  });
  await rows
    .nth(1)
    .getByRole("button", { name: "Cancelar todas da série", exact: true })
    .click();
  await expect(rows).toHaveCount(0);
  await page.getByRole("tab", { name: /^Cancelados/ }).click();
  await expect(rows.filter({ hasText: "Cancelado" })).toHaveCount(4);
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

for (const reason of ["authorization", "__proto__"]) {
  test(`Google callback shows safe guidance for ${reason}`, async ({
    page,
  }) => {
    await page.route("**/api/auth/config", (route) =>
      route.fulfill({ json: { googleEnabled: true, passwordEnabled: false } }),
    );
    await page.route("**/api/admin/session", (route) =>
      route.fulfill({ status: 401, json: { detail: "Sessão ausente." } }),
    );
    await page.goto(`/admin?google=failed&reason=${reason}`);
    await expect(page.getByRole("alert")).toHaveText(
      reason === "authorization"
        ? "Esta conta Google não tem acesso autorizado. Escolha a conta cadastrada pelo responsável."
        : "Não foi possível entrar com Google. Reinicie o acesso ou procure o responsável.",
    );
    await expect(
      page.getByRole("button", { name: "Entrar com Google" }),
    ).toBeVisible();
    await expect(page.getByLabel("Senha administrativa")).toHaveCount(0);
  });
}

test("agenda separates cancelled history with counts, empty states and keyboard tabs (API fixtures)", async ({
  page,
}) => {
  let writes = 0;
  const bookings = [
    { id: "fixture-confirmed", status: "confirmed", name: "Active fixture" },
    {
      id: "fixture-pending",
      status: "pending_approval",
      name: "Pending fixture",
    },
    { id: "fixture-cancelled", status: "cancelled", name: "Cancelled fixture" },
  ].map((b) => ({
    ...b,
    serviceId: "discovery",
    date: "2026-10-30",
    time: "15:00",
    email: "",
    version: 1,
    approvalExpiresAt: null,
    seriesId: null,
  }));
  await page.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      await route.fulfill({ status: 405 });
      return;
    }
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      "/api/admin/session": { role: "professional", authenticated: true },
      "/api/auth/config": { googleEnabled: true, passwordEnabled: false },
      "/api/admin/bookings": bookings,
      "/api/admin/hours": [],
      "/api/admin/services": [
        { id: "discovery", name: "Conversa inicial", duration: 30 },
      ],
      "/api/admin/profile": {
        id: "fixture",
        slug: "fixture",
        displayName: "Fixture Professional",
        headerTitle: "Agenda",
        headerSubtitle: "Teste",
        theme: "forest",
        version: 1,
      },
    };
    await route.fulfill({ json: responses[path] ?? [] });
  });
  await page.goto("/admin");
  const agenda = page.getByRole("tab", { name: "Agenda (2)", exact: true });
  const cancelled = page.getByRole("tab", {
    name: "Cancelados (1)",
    exact: true,
  });
  const panel = page.getByRole("tabpanel");
  await expect(agenda).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator(".appointment")).toHaveCount(2);
  await expect(panel).not.toContainText("Cancelled fixture");
  await agenda.focus();
  await agenda.press("ArrowRight");
  await expect(cancelled).toBeFocused();
  await expect(cancelled).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator(".appointment")).toHaveCount(1);
  await expect(panel).toContainText("Cancelled fixture");
  await expect(panel.getByRole("button")).toHaveCount(0);
  await cancelled.press("Home");
  await expect(agenda).toBeFocused();
  await expect(panel).toContainText("Pending fixture");
  await agenda.press("End");
  await expect(cancelled).toBeFocused();
  await cancelled.press("ArrowRight");
  await expect(agenda).toBeFocused();
  bookings.splice(0, bookings.length);
  await page.reload();
  await expect(page.getByRole("tabpanel")).toHaveText(
    "Nenhuma reserva nesta aba.",
  );
  await page.getByRole("tab", { name: "Cancelados (0)", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toHaveText(
    "Nenhuma reserva cancelada.",
  );
  expect(writes).toBe(0);
});
