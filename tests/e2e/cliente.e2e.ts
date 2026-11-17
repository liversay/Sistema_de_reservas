import { bookViaApi, cell, dayOffset, expect, freeCell, gridUrl, newContext, registerViaApi, seedPastBooking, test } from "./fixtures";

test("CA-01 el cliente ve la disponibilidad: Media A ocupada ocupa también la Completa", async ({ page, browser }) => {
  const date = dayOffset(1);
  const owner = await newContext(browser);
  await registerViaApi(owner);
  await bookViaApi(owner.request, { courtId: "media-a", date, startTime: "20:00", durationMin: 60 });
  await owner.close();

  await page.goto(gridUrl(date));
  // Una fila por cancha activa.
  for (const name of ["Fútbol · Media A", "Fútbol · Media B", "Fútbol · Completa", "Pádel 1", "Básquet 1"]) {
    await expect(page.getByRole("group", { name, exact: true })).toBeVisible();
  }
  // Bloques 20:00 y 20:30 de Media A ocupados, y la Completa también (RN-02).
  for (const t of ["20:00", "20:30"]) {
    await expect(cell(page, "Fútbol · Media A", t, "ocupado")).toBeVisible();
    await expect(cell(page, "Fútbol · Completa", t, "ocupado")).toBeVisible();
    await expect(freeCell(page, "Fútbol · Media B", t)).toBeVisible();
  }
  await expect(freeCell(page, "Fútbol · Media A", "19:30")).toBeVisible();
  await expect(freeCell(page, "Fútbol · Media A", "21:00")).toBeVisible();
  // Cada bloque tiene exactamente un estado: no hay un bloque "libre" y "ocupado" a la vez.
  await expect(page.getByLabel("Fútbol · Media A 20:00", { exact: false })).toHaveCount(1);
});

test("CA-02 el filtro por deporte muestra solo pádel y al quitarlo vuelven todas", async ({ page }) => {
  await page.goto(gridUrl(dayOffset(1)));
  await expect(page.getByRole("group", { name: "Fútbol · Media A", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Pádel", exact: true }).click();
  await expect(page.getByRole("group", { name: "Pádel 1", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Fútbol · Media A", exact: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Básquet 1", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Todas", exact: true }).click();
  for (const name of ["Fútbol · Media A", "Fútbol · Media B", "Fútbol · Completa", "Pádel 1", "Básquet 1"]) {
    await expect(page.getByRole("group", { name, exact: true })).toBeVisible();
  }
});

test("CA-03 elegir duración recalcula el precio y qué inicios caben", async ({ page }) => {
  const panel = page.locator("aside.panel");
  await page.goto(gridUrl(dayOffset(2)));

  // Solo existen tres duraciones.
  await expect(page.getByRole("radio")).toHaveCount(3);

  await freeCell(page, "Fútbol · Media A", "18:00").click();
  await expect(panel).toContainText("Fútbol · Media A");
  for (const [label, price] of [["1 h", "$50"], ["1 h 30", "$75"], ["2 h", "$95"]] as const) {
    await page.locator("fieldset.segmented").getByText(label, { exact: true }).click({ force: true });
    await expect(panel.locator(".price")).toHaveText(price);
  }
  await freeCell(page, "Fútbol · Completa", "18:00").click();
  await expect(panel).toContainText("Fútbol · Completa");
  for (const [label, price] of [["1 h", "$95"], ["1 h 30", "$140"], ["2 h", "$180"]] as const) {
    await page.locator("fieldset.segmented").getByText(label, { exact: true }).click({ force: true });
    await expect(panel.locator(".price")).toHaveText(price);
  }

  // Con 1 h el inicio 22:00 cabe (cierra 23:00); con 2 h ya no.
  await page.locator("fieldset.segmented").getByText("1 h", { exact: true }).click({ force: true });
  await freeCell(page, "Fútbol · Media A", "22:00").click();
  await expect(panel).toContainText("22:00 – 23:00");
  await expect(panel.getByText("Elige otra hora o una duración más corta.")).toHaveCount(0);
  await page.locator("fieldset.segmented").getByText("2 h", { exact: true }).click({ force: true });
  await expect(panel.getByText("Elige otra hora o una duración más corta.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Ingresa para reservar" })).toBeDisabled();
});

test("CA-04 cliente reserva un turno libre", async ({ page, context }) => {
  const date = dayOffset(2);
  await registerViaApi(context, "ca04");
  await page.goto(gridUrl(date));

  await freeCell(page, "Pádel 1", "18:00").click();
  const panel = page.locator("aside.panel");
  await expect(panel.locator(".price")).toHaveText("$20");
  await panel.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Reserva confirmada." })).toBeVisible();
  // Los bloques 18:00 y 18:30 quedan ocupados; 19:00 sigue libre.
  await expect(cell(page, "Pádel 1", "18:00", "ocupado")).toBeVisible();
  await expect(cell(page, "Pádel 1", "18:30", "ocupado")).toBeVisible();
  await expect(freeCell(page, "Pádel 1", "19:00")).toBeVisible();

  // Aparece en "Mis reservas" confirmada, 20 USD y pago pendiente (pagas al terminar).
  await page.getByRole("link", { name: "Mis reservas", exact: true }).first().click();
  const card = page.getByRole("listitem").filter({ hasText: "Pádel 1" });
  await expect(card).toContainText("18:00–19:00");
  await expect(card).toContainText("$20");
  await expect(card).toContainText("Confirmada");
  await expect(card).toContainText("pagas al terminar");

  const mine = await (await context.request.get("/api/bookings/mine")).json();
  expect(mine[0]).toMatchObject({ status: "confirmada", price: 20, payment: { status: "pendiente" } });
});

test("CA-07 cancelar libera el turno y otro cliente puede reservarlo", async ({ page, context, browser }) => {
  const date = dayOffset(3);
  await registerViaApi(context, "ca07");
  await bookViaApi(context.request, { courtId: "basquet-1", date, startTime: "19:00", durationMin: 60 });

  await page.goto("/mis-reservas");
  await page.getByRole("button", { name: "Cancelar reserva Básquet 1 19:00" }).click();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(page.getByText("El horario quedó libre.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Básquet 1" })).toContainText("Cancelada");

  // Otro cliente ve el turno libre y lo reserva.
  const other = await newContext(browser);
  await registerViaApi(other, "ca07b");
  const p2 = await other.newPage();
  await p2.goto(gridUrl(date));
  await expect(freeCell(p2, "Básquet 1", "19:00")).toBeVisible();
  await freeCell(p2, "Básquet 1", "19:00").click();
  await p2.locator("aside.panel").getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(p2.getByRole("status").filter({ hasText: "Reserva confirmada." })).toBeVisible();

  // Un cliente no puede cancelar reservas ajenas (404), y una que ya empezó se rechaza (422).
  const mineId = (await (await context.request.get("/api/bookings/mine")).json())[0].id as string;
  expect((await other.request.post(`/api/bookings/${mineId}/cancel`)).status()).toBe(404);
  const userId = (await (await context.request.get("/api/auth/me")).json()).id as string;
  const started = await seedPastBooking({ courtId: "basquet-1", spaceIds: ["basquet-1"], daysAgo: 1, startSlot: 36, price: 30, userId });
  expect((await context.request.post(`/api/bookings/${started.id}/cancel`)).status()).toBe(422);
  await other.close();
});

test("CA-09 inicio de sesión: vuelve a la selección, rechaza clave incorrecta y cierra sesión", async ({ page, browser }) => {
  const date = dayOffset(4);
  const setup = await newContext(browser);
  const user = await registerViaApi(setup, "ca09");
  await setup.close();

  // Reservar sin sesión responde 401.
  const anon = await newContext(browser);
  expect(
    (await anon.request.post("/api/bookings", { data: { courtId: "padel-1", date, startTime: "18:00", durationMin: 60 } })).status(),
  ).toBe(401);
  await anon.close();

  await page.goto(gridUrl(date));
  await freeCell(page, "Pádel 1", "19:00").click();
  await page.locator("aside.panel").getByRole("button", { name: "Ingresa para reservar" }).click();
  await expect(page).toHaveURL(/\/ingresar/);

  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Contraseña").fill("incorrecta123");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Email o contraseña incorrectos.");
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);

  await page.getByLabel("Contraseña").fill(user.password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  // Vuelve a la misma selección.
  await expect(page).toHaveURL(/hora=19(:|%3A)00/);
  await expect(freeCell(page, "Pádel 1", "19:00")).toHaveAttribute("aria-pressed", "true");
  const me = await page.request.get("/api/auth/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).email).toBe(user.email);

  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page.getByRole("link", { name: "Ingresar" })).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});
