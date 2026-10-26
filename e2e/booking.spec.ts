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
  await expect(form.getByLabel("Nome profissional")).toHaveValue("");
  await expect(form.getByLabel("Endereço público")).toHaveValue("");
  await expect(form.getByLabel("E-mail Google convidado")).toHaveValue("");
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
    serviceName: "Conversa inicial",
    serviceDuration: 30,
    servicePriceMode: "free",
    servicePrice: 0,
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
      "/api/admin/calendar": { enabled: false, state: "disconnected" },
      "/api/admin/services": [
        {
          id: "discovery",
          name: "Conversa inicial",
          duration: 30,
          priceMode: "free",
          price: 0,
          version: 1,
          active: true,
        },
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

test("professional edits service duration and price visibility while existing bookings keep their terms", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/admin");
  await page.getByLabel("Senha administrativa").fill("test-password-long");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const settings = page.getByRole("region", {
    name: "Configuração de serviços",
  });
  await settings.getByRole("button", { name: "Adicionar serviço" }).click();
  await settings.getByLabel("Nome do serviço").fill("Atendimento catálogo");
  await settings.getByLabel("Descrição").fill("Descrição personalizada");
  await settings.getByLabel("Duração (minutos, opcional)").fill("50");
  await settings.getByLabel("Exibição do valor").selectOption("paid");
  await settings.getByLabel("Valor (R$, opcional)").fill("175.50");
  await settings.getByRole("button", { name: "Salvar serviço" }).click();
  await expect(settings.getByRole("status")).toHaveText(
    "Lista de serviços atualizada.",
  );
  const list = await (await page.request.get("/api/admin/services")).json();
  const service = list.find(
    (s: { name: string }) => s.name === "Atendimento catálogo",
  );
  expect(service).toMatchObject({
    duration: 50,
    price: 175.5,
    priceMode: "paid",
    version: 1,
  });
  const customer = await page.context().newPage();
  await customer.goto("/");
  let card = customer
    .locator(".service")
    .filter({ hasText: "Atendimento catálogo" });
  await expect(card).toContainText("50 min");
  await expect(card).toContainText(/175,50/);
  await card.click();
  await expect(
    customer.getByText("Descrição personalizada", { exact: true }),
  ).toBeVisible();
  const calendar = await (await page.request.get("/api/calendar")).json();
  let date = "",
    time = "";
  for (let offset = 3; offset <= 14; offset++) {
    const d = new Date(`${calendar.today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    const key = d.toISOString().slice(0, 10);
    const slots = await (
      await page.request.get(
        `/api/availability?date=${key}&serviceId=${service.id}`,
      )
    ).json();
    if (slots.length) {
      date = key;
      time = slots[0];
      break;
    }
  }
  expect(date).not.toBe("");
  const response = await page.request.post("/api/bookings", {
    data: {
      serviceId: service.id,
      serviceVersion: 1,
      date,
      time,
      name: "Catalog fixture",
      email: "catalog@example.com",
    },
  });
  expect(response.status()).toBe(201);
  const receipt = await response.json();
  await settings
    .getByRole("button", { name: "Editar Atendimento catálogo", exact: true })
    .click();
  await settings.getByLabel("Nome do serviço").fill("Atendimento atualizado");
  await settings.getByLabel("Duração (minutos, opcional)").fill("90");
  await settings.getByLabel("Exibição do valor").selectOption("free");
  await settings.getByRole("button", { name: "Salvar serviço" }).click();
  await expect(
    settings.getByRole("button", {
      name: "Editar Atendimento atualizado",
      exact: true,
    }),
  ).toBeVisible();
  await customer.reload();
  card = customer
    .locator(".service")
    .filter({ hasText: "Atendimento atualizado" });
  await expect(card).toContainText("90 min");
  await expect(card).toContainText("Gratuito");
  await settings
    .getByRole("button", { name: "Editar Atendimento atualizado", exact: true })
    .click();
  await settings.getByLabel("Exibição do valor").selectOption("hidden");
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await settings.getByRole("button", { name: "Salvar serviço" }).click();
  await expect(
    settings.getByRole("button", {
      name: "Editar Atendimento atualizado",
      exact: true,
    }),
  ).toBeVisible();
  await customer.reload();
  card = customer
    .locator(".service")
    .filter({ hasText: "Atendimento atualizado" });
  await expect(card).toContainText("90 min");
  await expect(card).not.toContainText("R$");
  await expect(card).not.toContainText("Gratuito");
  const stored = await (
    await page.request.get(`/api/bookings/${receipt.id}`, {
      headers: { "X-Cancel-Token": receipt.cancelToken },
    })
  ).json();
  expect(stored).toMatchObject({
    serviceName: "Atendimento catálogo",
    serviceDuration: 50,
    servicePrice: 175.5,
    servicePriceMode: "paid",
  });
  await settings
    .getByRole("button", { name: "Editar Atendimento atualizado", exact: true })
    .click();
  await settings.getByLabel("Disponível para novos agendamentos").uncheck();
  await settings.getByRole("button", { name: "Salvar serviço" }).click();
  await expect(
    settings.getByText(/Atendimento atualizado.*Desativado/),
  ).toBeVisible();
  await customer.reload();
  await expect(
    customer.locator(".service").filter({ hasText: "Atendimento atualizado" }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.delete(`/api/bookings/${receipt.id}`, {
        headers: { "X-Cancel-Token": receipt.cancelToken },
      })
    ).status(),
  ).toBe(204);
  await settings.getByRole("button", { name: "Adicionar serviço" }).click();
  await settings.getByLabel("Nome do serviço").fill("Serviço a combinar");
  await settings.getByLabel("Exibição do valor").selectOption("paid");
  await expect(settings.getByLabel("Duração (minutos, opcional)")).toBeEmpty();
  await expect(settings.getByLabel("Valor (R$, opcional)")).toBeEmpty();
  await settings.getByRole("button", { name: "Salvar serviço" }).click();
  await expect(
    settings.getByRole("button", {
      name: "Editar Serviço a combinar",
      exact: true,
    }),
  ).toBeVisible();
  await customer.reload();
  const flexibleCard = customer
    .locator(".service")
    .filter({ hasText: "Serviço a combinar" });
  await expect(flexibleCard).toContainText("Duração a combinar");
  await expect(flexibleCard).toContainText("Valor a combinar");
  await expect(flexibleCard).not.toContainText("Gratuito");
  await flexibleCard.click();
  await expect(customer.getByRole("status")).toHaveText(
    "Duração a combinar. Combine a duração e o horário diretamente com o profissional.",
  );
  await expect(
    customer.getByRole("button", { name: /Solicitar agendamento/ }),
  ).toBeDisabled();
  await expect(customer.locator(".days button")).toHaveCount(0);
  const updatedServices = await (
    await page.request.get("/api/admin/services")
  ).json();
  const flexible = updatedServices.find(
    (s: { name: string }) => s.name === "Serviço a combinar",
  );
  const agreed = page.locator("form").filter({
    has: page.getByRole("heading", {
      name: "Horário combinado com o cliente",
    }),
  });
  await agreed.getByLabel("Tipo de encontro").selectOption(flexible.id);
  await agreed
    .getByLabel("Nome ou identificação do cliente")
    .fill("Flexible duration fixture");
  await agreed.getByLabel("Duração deste encontro (minutos)").fill("50");
  const safeSlots = await (
    await page.request.get(
      `/api/availability?date=${date}&serviceId=consulting`,
    )
  ).json();
  expect(safeSlots.length).toBeGreaterThan(0);
  await agreed.getByLabel("Primeira data").fill(date);
  await agreed.getByLabel("Horário fixo").fill(safeSlots[0]);
  await agreed.getByLabel("Frequência").selectOption("once");
  await agreed
    .getByRole("button", { name: "Confirmar encontros combinados" })
    .click();
  await expect(agreed.getByRole("status")).toContainText(
    "1 encontro(s) confirmado(s)",
  );
  const booked = page
    .locator(".appointment")
    .filter({ hasText: "Flexible duration fixture" });
  await expect(booked).toContainText("50 min");
  await expect(booked).toContainText("Valor a combinar");
  page.once("dialog", (dialog) => dialog.accept());
  await booked
    .getByRole("button", { name: "Cancelar só esta", exact: true })
    .click();
  await customer.close();
});

test("empty service catalog explains unavailability and prevents new requests", async ({
  page,
}) => {
  await page.route("**/api/services", (route) => route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText(
    "Nenhum serviço disponível no momento. Entre em contato com o profissional.",
  );
  await expect(
    page.getByRole("button", { name: /Solicitar agendamento/ }),
  ).toBeDisabled();
  await expect(page.locator(".days button")).toHaveCount(0);
});

test("Calendar panel shows limited availability, connection failures and explicit disconnection (API fixtures)", async ({
  page,
}) => {
  let connected = true;
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path === "/api/admin/calendar" && request.method() === "DELETE") {
      connected = false;
      await route.fulfill({ status: 204 });
      return;
    }
    if (request.method() !== "GET") {
      await route.fulfill({ status: 405 });
      return;
    }
    const values: Record<string, unknown> = {
      "/api/admin/session": { role: "professional", authenticated: true },
      "/api/auth/config": { googleEnabled: true, passwordEnabled: false },
      "/api/admin/bookings": [],
      "/api/admin/hours": [],
      "/api/admin/services": [],
      "/api/admin/profile": {
        id: "fixture",
        slug: "fixture",
        displayName: "Fixture",
        headerTitle: "Agenda",
        headerSubtitle: "",
        theme: "forest",
        version: 1,
      },
      "/api/admin/calendar": {
        enabled: true,
        state: connected ? "connected" : "disconnected",
      },
      "/api/admin/calendar/busy": {
        date: "2026-10-26",
        busy: [
          {
            start: "2026-10-26T09:00:00-03:00",
            end: "2026-10-26T10:00:00-03:00",
          },
        ],
      },
    };
    await route.fulfill({ json: values[path] ?? [] });
  });
  await page.goto("/admin?calendar=failed");
  const panel = page.getByRole("region", { name: "Conexão Google Agenda" });
  await expect(panel).toContainText("Google Agenda conectada.");
  await expect(panel.getByRole("alert")).toContainText("mesma conta do painel");
  await page.goto(
    "/admin?calendar=failed&calendar_reason=exchange_invalid_client",
  );
  await expect(panel.getByRole("alert")).toContainText(
    "O Google recusou as credenciais",
  );
  await expect(panel.getByRole("alert")).toContainText(
    "Código: exchange_invalid_client",
  );
  await page.goto(
    "/admin?calendar=failed&calendar_reason=exchange_invalid_request&calendar_http=400",
  );
  await expect(panel.getByRole("alert")).toContainText(
    "O Google recusou o formato",
  );
  await expect(panel.getByRole("alert")).toContainText("HTTP 400");
  await page.goto(
    "/admin?calendar=failed&calendar_reason=exchange_unavailable&calendar_http=private-injected-value",
  );
  await expect(panel.getByRole("alert")).toContainText(
    "comunicação com o Google",
  );
  await expect(panel.getByRole("alert")).not.toContainText(
    "private-injected-value",
  );
  await page.goto("/admin?calendar=failed&calendar_reason=__proto__");
  await expect(panel.getByRole("alert")).toContainText("mesma conta do painel");
  await expect(panel.getByRole("alert")).not.toContainText("__proto__");
  await expect(panel).toContainText("não criam eventos e não enviam convites");
  await panel.getByLabel("Data para consultar no Google").fill("2026-10-26");
  await panel
    .getByRole("button", { name: "Consultar horários ocupados" })
    .click();
  await expect(panel).toContainText("26/10/2026");
  await expect(panel).toContainText("09:00");
  page.once("dialog", (dialog) => dialog.dismiss());
  await panel
    .getByRole("button", { name: "Desconectar Google Agenda", exact: true })
    .click();
  await expect(panel).toContainText("Google Agenda conectada.");
  page.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "Desconectar Google Agenda", exact: true })
    .click();
  await expect(panel).toContainText("Google Agenda desconectada.");
  await expect(
    panel.getByRole("button", { name: "Conectar Google Agenda", exact: true }),
  ).toBeVisible();
  await expect(panel.getByLabel("Data para consultar no Google")).toHaveCount(
    0,
  );
});

test("professional publishes and hides WhatsApp contact on the public page", async ({
  page,
}) => {
  await page.goto("/p/demo");
  await expect(
    page.getByRole("link", { name: "Falar com o profissional" }),
  ).toHaveCount(0);
  await page.goto("/admin");
  await page.getByLabel("Senha administrativa").fill("test-password-long");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const form = page.getByRole("form", { name: "Contato pelo WhatsApp" });
  await form
    .getByLabel("Número do WhatsApp (com código do país)")
    .fill("+55 (12) 99999-0000");
  await form.getByLabel("Mostrar WhatsApp na minha página").check();
  await form.getByRole("button", { name: "Salvar contato" }).click();
  await expect(form.getByRole("status")).toHaveText(
    "WhatsApp visível na sua página.",
  );
  await expect(
    form.getByLabel("Número do WhatsApp (com código do país)"),
  ).toHaveValue("5512999990000");
  const catalog = await page.request.post("/api/admin/services", {
    headers: { Origin: "http://localhost:5173" },
    data: {
      name: "Conversa a combinar",
      description: "",
      duration: null,
      priceMode: "paid",
      priceCents: null,
      active: true,
    },
  });
  expect(catalog.status()).toBe(201);
  const service = await catalog.json();
  await page.goto("/p/demo");
  const link = page.getByRole("link", { name: "Falar com o profissional" });
  const href = new URL((await link.getAttribute("href"))!);
  expect(href.origin).toBe("https://wa.me");
  expect(href.pathname).toBe("/5512999990000");
  expect(href.searchParams.get("text")).toBe(
    "Olá! Vim pelo Slotiva e gostaria de falar sobre um atendimento.",
  );
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await page.getByRole("radio", { name: /Conversa a combinar/ }).check();
  await expect(link).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Solicitar agendamento/ }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(link).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const results = await new AxeBuilder({ page })
    .include(".whatsapp-contact")
    .analyze();
  expect(results.violations).toEqual([]);
  await page.goto("/admin");
  await form.getByLabel("Mostrar WhatsApp na minha página").uncheck();
  await form.getByRole("button", { name: "Salvar contato" }).click();
  await expect(form.getByRole("status")).toHaveText(
    "WhatsApp oculto na sua página.",
  );
  await page.request.put(`/api/admin/services/${service.id}`, {
    headers: { Origin: "http://localhost:5173" },
    data: {
      name: service.name,
      description: "",
      duration: null,
      priceMode: "paid",
      priceCents: null,
      active: false,
      version: service.version,
    },
  });
  await page.goto("/p/demo");
  await expect(link).toHaveCount(0);
});

test("master restores a deleted professional and cancels the confirmation safely (API fixtures)", async ({
  page,
}) => {
  let removed = true;
  let restores = 0;
  const profile = {
    id: "restore-fixture",
    slug: "restore-fixture",
    displayName: "Restoration example",
    headerTitle: "Appointments",
    headerSubtitle: "",
    theme: "forest",
    invitedEmail: "restore@example.com",
    googleSubject: "restore-subject",
    version: 4,
  };
  await page.route("**/api/master/session", (r) =>
    r.fulfill({ json: { authenticated: true, role: "master" } }),
  );
  await page.route("**/api/master/professionals**", async (route) => {
    const req = route.request();
    if (
      req.method() === "POST" &&
      new URL(req.url()).pathname.endsWith("/restore")
    ) {
      expect(req.postDataJSON()).toEqual({ version: 4 });
      removed = false;
      restores++;
      await route.fulfill({
        json: { ...profile, status: "active", version: 5 },
      });
    } else {
      const showDeleted =
        new URL(req.url()).searchParams.get("status") === "deleted";
      await route.fulfill({
        json:
          showDeleted === removed
            ? [{ ...profile, status: removed ? "deleted" : "active" }]
            : [],
      });
    }
  });
  await page.goto("/master");
  await expect(
    page.getByRole("button", { name: "Restaurar cadastro" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Excluídos", exact: true }).click();
  await expect(
    page.getByText("Restoration example", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "/p/restore-fixture" }),
  ).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Restaurar cadastro" }).click();
  expect(restores).toBe(0);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(
      "reservas canceladas continuarão canceladas",
    );
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Restaurar cadastro" }).click();
  await expect(page.getByRole("status")).toContainText("Cadastro restaurado");
  await expect(
    page.getByRole("link", { name: "/p/restore-fixture" }),
  ).toBeVisible();
  expect(restores).toBe(1);
  await page.getByRole("button", { name: "Excluídos", exact: true }).click();
  await expect(
    page.getByText("Nenhum cadastro excluído.", { exact: true }),
  ).toBeVisible();
});
