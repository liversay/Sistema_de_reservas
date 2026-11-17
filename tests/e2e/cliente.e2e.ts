import { bookViaApi, cell, dayOffset, expect, freeCell, gridUrl, loginAdmin, newContext, registerViaApi, seedPastBooking, test } from "./fixtures";

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
  // Bloques 8:00 p. m. y 8:30 p. m. de Media A ocupados, y la Completa también (RN-02).
  for (const t of ["8:00 p. m.", "8:30 p. m."]) {
    await expect(cell(page, "Fútbol · Media A", t, "ocupado")).toBeVisible();
    await expect(cell(page, "Fútbol · Completa", t, "ocupado")).toBeVisible();
    await expect(freeCell(page, "Fútbol · Media B", t)).toBeVisible();
  }
  await expect(freeCell(page, "Fútbol · Media A", "7:30 p. m.")).toBeVisible();
  await expect(freeCell(page, "Fútbol · Media A", "9:00 p. m.")).toBeVisible();
  // Cada bloque tiene exactamente un estado: no hay un bloque "libre" y "ocupado" a la vez.
  await expect(page.getByLabel("Fútbol · Media A 8:00 p. m.", { exact: false })).toHaveCount(1);
  // Sin sesión también se ve (reservar no exige cuenta) y no hay horas en 24 h.
  await expect(page.getByRole("link", { name: "Mis reservas" })).toHaveCount(0);
  expect(await page.locator("main").innerText()).not.toMatch(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b(?!\s?[ap]\. m\.)/);
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

  await freeCell(page, "Fútbol · Media A", "6:00 p. m.").click();
  await expect(panel).toContainText("Fútbol · Media A");
  // Sin sesión es precio de lista: sin descuento de socio.
  for (const [label, price] of [["1 h", "$50"], ["1 h 30", "$75"], ["2 h", "$95"]] as const) {
    await page.locator("fieldset.segmented").getByText(label, { exact: true }).click({ force: true });
    await expect(panel.locator(".price")).toHaveText(price);
    await expect(panel.getByTestId("precio-base")).toHaveCount(0);
  }
  await freeCell(page, "Fútbol · Completa", "6:00 p. m.").click();
  await expect(panel).toContainText("Fútbol · Completa");
  for (const [label, price] of [["1 h", "$95"], ["1 h 30", "$140"], ["2 h", "$180"]] as const) {
    await page.locator("fieldset.segmented").getByText(label, { exact: true }).click({ force: true });
    await expect(panel.locator(".price")).toHaveText(price);
  }

  // Con 1 h el inicio 10:00 p. m. cabe (cierra 11:00 p. m.); con 2 h ya no.
  await page.locator("fieldset.segmented").getByText("1 h", { exact: true }).click({ force: true });
  await freeCell(page, "Fútbol · Media A", "10:00 p. m.").click();
  await expect(panel).toContainText("10:00 p. m. – 11:00 p. m.");
  await expect(panel.getByText("Elige otra hora o una duración más corta.")).toHaveCount(0);
  await page.locator("fieldset.segmented").getByText("2 h", { exact: true }).click({ force: true });
  await expect(panel.getByText("Elige otra hora o una duración más corta.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
});

test("CA-04 un visitante sin cuenta reserva un turno libre a precio de lista; un socio lo ve en Mis reservas con descuento", async ({ page, context, browser }) => {
  const date = dayOffset(2);
  await page.goto(gridUrl(date));

  // Sin sesión: el panel pide nombre y teléfono; no hay "Ingresa para reservar".
  await freeCell(page, "Pádel 1", "6:00 p. m.").click();
  const panel = page.locator("aside.panel");
  await expect(panel.locator(".price")).toHaveText("$20");
  await expect(panel.getByRole("button", { name: "Ingresa para reservar" })).toHaveCount(0);
  await panel.getByTestId("invitado-nombre").fill("Visitante Cuatro");
  await panel.getByTestId("invitado-telefono").fill("+507 6000 0004");
  await panel.getByRole("button", { name: "Confirmar reserva" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Reserva confirmada." })).toBeVisible();
  // Los bloques 6:00 p. m. y 6:30 p. m. quedan ocupados; 7:00 p. m. sigue libre.
  await expect(cell(page, "Pádel 1", "6:00 p. m.", "ocupado")).toBeVisible();
  await expect(cell(page, "Pádel 1", "6:30 p. m.", "ocupado")).toBeVisible();
  await expect(freeCell(page, "Pádel 1", "7:00 p. m.")).toBeVisible();

  // Queda guardada como invitado: 20 USD, sin descuento y pago pendiente (la ve el admin).
  await loginAdmin(context);
  const list = (await (await context.request.get(`/api/admin/bookings?date=${date}`)).json()) as {
    courtId: string; startTime: string; guest?: { name: string; phone: string }; price: number; basePrice: number; discountPct: number; status: string; payment: { status: string };
  }[];
  const row = list.find((b) => b.courtId === "padel-1" && b.startTime === "18:00");
  expect(row).toMatchObject({
    guest: { name: "Visitante Cuatro", phone: "+507 6000 0004" },
    price: 20,
    basePrice: 20,
    discountPct: 0,
    status: "confirmada",
    payment: { status: "pendiente" },
  });

  // Un socio (con sesión) reserva el mismo tipo de turno con 10 % menos y lo ve en "Mis reservas".
  const member = await newContext(browser);
  await registerViaApi(member, "ca04");
  const p2 = await member.newPage();
  await p2.goto(gridUrl(date));
  await freeCell(p2, "Pádel 1", "8:00 p. m.").click();
  const panel2 = p2.locator("aside.panel");
  await expect(panel2.getByTestId("precio-base")).toHaveText("$20");
  await expect(panel2.locator(".price")).toHaveText("$18");
  await panel2.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(p2.getByRole("status").filter({ hasText: "Reserva confirmada." })).toBeVisible();
  await p2.getByRole("link", { name: "Mis reservas", exact: true }).first().click();
  const card = p2.getByRole("listitem").filter({ hasText: "Pádel 1" });
  await expect(card).toContainText("8:00 p. m. – 9:00 p. m.");
  await expect(card).toContainText("$18");
  await expect(card).toContainText("Confirmada");
  await expect(card).toContainText("pagas al terminar");
  const mine = await (await member.request.get("/api/bookings/mine")).json();
  expect(mine[0]).toMatchObject({ status: "confirmada", basePrice: 20, discountPct: 10, price: 18, payment: { status: "pendiente" } });
  await member.close();
});

test("CA-07 cancelar libera el turno y otro cliente puede reservarlo", async ({ page, context, browser }) => {
  const date = dayOffset(3);
  await registerViaApi(context, "ca07");
  await bookViaApi(context.request, { courtId: "basquet-1", date, startTime: "19:00", durationMin: 60 });

  await page.goto("/mis-reservas");
  await page.getByRole("button", { name: "Cancelar reserva Básquet 1 7:00 p. m." }).click();
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

test("CA-09 inicio de sesión: «Ingresa» vuelve a la selección, rechaza clave incorrecta y cierra sesión", async ({ page, browser }) => {
  const date = dayOffset(4);
  const setup = await newContext(browser);
  const user = await registerViaApi(setup, "ca09");
  await setup.close();

  // CR-02: reservar ya no exige sesión (ver CA-19); «Mis reservas» y cancelar sí (401).
  const anon = await newContext(browser);
  expect((await anon.request.get("/api/bookings/mine")).status()).toBe(401);
  expect((await anon.request.post("/api/bookings", { data: { courtId: "padel-1", date, startTime: "18:00", durationMin: 60 } })).status()).toBe(400);
  await anon.close();

  await page.goto(gridUrl(date));
  await expect(page.getByRole("link", { name: "Mis reservas" })).toHaveCount(0);
  await freeCell(page, "Pádel 1", "7:00 p. m.").click();
  await page.locator("aside.panel").getByRole("button", { name: "Ingresa", exact: true }).click();
  await expect(page).toHaveURL(/\/ingresar/);
  await expect(page.getByRole("heading", { level: 1, name: "Club de socios" })).toBeVisible();

  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Contraseña").fill("incorrecta123");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Email o contraseña incorrectos.");
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);

  await page.getByLabel("Contraseña").fill(user.password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  // Vuelve a la misma selección, ya como socio.
  await expect(page).toHaveURL(/hora=19(:|%3A)00/);
  await expect(freeCell(page, "Pádel 1", "7:00 p. m.")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("aside.panel").getByTestId("socio-descuento")).toHaveText("Socio: −10 %");
  await expect(page.getByRole("link", { name: "Mis reservas" }).first()).toBeVisible();
  const me = await page.request.get("/api/auth/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).email).toBe(user.email);

  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page.getByRole("link", { name: "Ingresar" })).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});
