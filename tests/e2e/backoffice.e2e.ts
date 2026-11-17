import {
  bookViaApi,
  cell,
  CONFLICT,
  dayOffset,
  expect,
  freeCell,
  gridUrl,
  loginAdmin,
  newContext,
  nextWeekday,
  registerViaApi,
  seedPastBooking,
  test,
} from "./fixtures";

const WD = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** "jueves 19 nov" como lo muestra la app. */
function weekdayAndDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${WD[new Date(y, m - 1, d).getDay()]} ${d} ${MON[m - 1]}`;
}

const MEDIA_A = { courtId: "media-a", spaceIds: ["futbol-media-a"] };

test("CA-10 admin ve las reservas del día y puede cancelar cualquiera", async ({ page, context, browser }) => {
  const date = dayOffset(3);
  const client = await newContext(browser);
  const user = await registerViaApi(client, "ca10");
  await bookViaApi(client.request, { courtId: "padel-1", date, startTime: "20:00", durationMin: 60 });
  const toCancel = await bookViaApi(client.request, { courtId: "padel-1", date, startTime: "21:00", durationMin: 60 });
  expect((await client.request.post(`/api/bookings/${toCancel.id}/cancel`)).status()).toBe(200);
  // Un cliente en /api/admin recibe 403; sin sesión, 401.
  expect((await client.request.get(`/api/admin/bookings?date=${date}`)).status()).toBe(403);
  const anon = await newContext(browser);
  expect((await anon.request.get(`/api/admin/bookings?date=${date}`)).status()).toBe(401);
  await anon.close();
  const played = await seedPastBooking({ ...MEDIA_A, daysAgo: 1, startSlot: 34, price: 50, guest: { name: "Invitado Jugada10", phone: "+593 98 000 0010" } });

  await loginAdmin(context);
  await page.goto(`/admin?fecha=${date}`);
  const table = page.getByRole("region", { name: "Tabla de reservas del día" });
  const confirmed = table.getByRole("row").filter({ hasText: "20:00" });
  await expect(confirmed).toContainText("Pádel 1");
  await expect(confirmed).toContainText(user.name);
  await expect(confirmed).toContainText("Confirmada");
  await expect(confirmed).toContainText("Pendiente");
  await expect(table.getByRole("row").filter({ hasText: "21:00 – 22:00" })).toContainText("Cancelada");

  // Jugada (ayer): estado y pago.
  await page.goto(`/admin?fecha=${played.date}`);
  const row = page.getByRole("row").filter({ hasText: "Invitado Jugada10" });
  await expect(row).toContainText("Fútbol · Media A");
  await expect(row).toContainText("Jugada");
  await expect(row).toContainText("Pendiente");

  // Cancelar libera los bloques.
  await page.goto(`/admin?fecha=${date}`);
  await confirmed.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(page.getByText("Reserva cancelada. El horario quedó libre.")).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: "20:00" })).toContainText("Cancelada");
  const p2 = await client.newPage();
  await p2.goto(gridUrl(date));
  await expect(freeCell(p2, "Pádel 1", "20:00")).toBeVisible();
  await expect(freeCell(p2, "Pádel 1", "20:30")).toBeVisible();
  await client.close();
});

test("CA-11 admin crea una reserva para un invitado y el choque muestra el mensaje exacto", async ({ page, context }) => {
  const date = nextWeekday(6); // sábado: Básquet 1 abre 08:00
  await loginAdmin(context);
  await page.goto(`/admin?fecha=${date}`);

  const open = async () => {
    await page.getByRole("button", { name: "Nueva reserva", exact: true }).click();
    const form = page.getByRole("form", { name: "Nueva reserva" });
    await form.getByLabel("Cancha").selectOption({ label: "Básquet 1" });
    await form.getByLabel("Fecha").fill(date);
    await form.getByLabel("Hora de inicio").selectOption("10:00");
    return form;
  };

  // Sin nombre ni teléfono no se envía.
  let form = await open();
  await form.getByRole("button", { name: "Crear reserva" }).click();
  await expect(form.getByText("Escribe el nombre del invitado.")).toBeVisible();
  await expect(form.getByText(/Teléfono de 7 a 15 dígitos/)).toBeVisible();

  await form.getByLabel("Nombre del invitado").fill("Invitada Once");
  await form.getByLabel("Teléfono").fill("+593 98 111 2233");
  await expect(form.getByTestId("nueva-precio")).toHaveText("$30");
  await form.getByRole("button", { name: "Crear reserva" }).click();
  await expect(page.getByText("Reserva creada: Básquet 1, 10:00–11:00, $30.")).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Invitada Once" });
  await expect(row).toContainText("Invitado");
  await expect(row).toContainText("10:00");

  // Ocupa los bloques en la vista cliente.
  const p2 = await context.newPage();
  await p2.goto(gridUrl(date));
  await expect(cell(p2, "Básquet 1", "10:00", "ocupado")).toBeVisible();
  await expect(cell(p2, "Básquet 1", "10:30", "ocupado")).toBeVisible();
  await p2.close();

  // El mismo turno otra vez: 409 con el mensaje exacto.
  form = await open();
  await form.getByLabel("Nombre del invitado").fill("Otra Invitada");
  await form.getByLabel("Teléfono").fill("+593 98 999 8877");
  await form.getByRole("button", { name: "Crear reserva" }).click();
  await expect(form.getByRole("alert")).toContainText(CONFLICT);

  // Con la API: invitado sin teléfono = 400; en el pasado = 422.
  const bad = await context.request.post("/api/admin/bookings", {
    data: { courtId: "basquet-1", date, startTime: "12:00", durationMin: 60, guest: { name: "Sin Tel" } },
  });
  expect(bad.status()).toBe(400);
  const past = await context.request.post("/api/admin/bookings", {
    data: { courtId: "basquet-1", date: dayOffset(-1), startTime: "12:00", durationMin: 60, guest: { name: "Pasado", phone: "+593 98 000 0000" } },
  });
  expect(past.status()).toBe(422);
});

test("CA-12 el admin cobra una reserva jugada; antes de jugar no se puede cobrar", async ({ page, context, browser }) => {
  const guest = { name: "Invitado Cobro12", phone: "+593 98 120 0012" };
  const played = await seedPastBooking({ ...MEDIA_A, daysAgo: 2, startSlot: 36, price: 50, guest });

  await loginAdmin(context);

  // Reserva aún no jugada: el pago responde 422, sigue pendiente y no figura "por cobrar".
  const client = await newContext(browser);
  await registerViaApi(client, "ca12");
  const future = await bookViaApi(client.request, { courtId: "media-b", date: dayOffset(2), startTime: "22:00", durationMin: 60 });
  const early = await context.request.post(`/api/admin/bookings/${future.id}/payment`, { data: { amount: 50, method: "efectivo" } });
  expect(early.status()).toBe(422);
  const stillPending = await (await context.request.get(`/api/admin/bookings?date=${dayOffset(2)}`)).json();
  expect(stillPending.find((b: { id: string }) => b.id === future.id).payment.status).toBe("pendiente");
  await client.close();

  await page.goto("/admin/pagos");
  const due = page.getByRole("listitem").filter({ hasText: guest.name });
  await expect(due).toContainText("Fútbol · Media A");
  await expect(page.getByRole("listitem").filter({ hasText: "Fútbol · Media B" })).toHaveCount(0);

  // Monto prellenado con el precio, ajustable; método transferencia.
  await due.getByRole("button", { name: "Cobrar $50" }).click();
  const amount = due.getByLabel("Monto cobrado ($)");
  await expect(amount).toHaveValue("50");
  await amount.fill("45");
  await due.getByText("Transferencia", { exact: true }).click({ force: true });
  await due.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.getByText("Pago registrado: $45 en transferencia.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: guest.name })).toHaveCount(0); // sale de "por cobrar"

  // Aparece en "cobrados" del día jugado.
  const paid = page.getByRole("region", { name: "Tabla de cobrados" });
  const dayInput = page.getByLabel("Fecha");
  await dayInput.fill(played.date);
  await expect(dayInput).toHaveValue(played.date);
  await expect(page.locator(".daynav-label")).toHaveText(new RegExp(`^${weekdayAndDay(played.date)}`, "i"));
  const paidRow = paid.getByRole("row").filter({ hasText: "Fútbol · Media A" });
  await expect(paidRow).toContainText("$45");
  await expect(paidRow).toContainText("transferencia");

  // Un segundo pago sobre la misma reserva responde 409.
  const again = await context.request.post(`/api/admin/bookings/${played.id}/payment`, { data: { amount: 50, method: "efectivo" } });
  expect(again.status()).toBe(409);
});

test("CA-13 no se presentó: sale de por cobrar y ya no admite pago", async ({ page, context, browser }) => {
  const guest = { name: "Invitado NoShow13", phone: "+593 98 130 0013" };
  const played = await seedPastBooking({ ...MEDIA_A, daysAgo: 3, startSlot: 36, price: 50, guest });
  await loginAdmin(context);

  // Marcarla antes de que termine responde 422.
  const client = await newContext(browser);
  await registerViaApi(client, "ca13");
  const future = await bookViaApi(client.request, { courtId: "basquet-1", date: dayOffset(2), startTime: "22:00", durationMin: 60 });
  expect((await context.request.post(`/api/admin/bookings/${future.id}/no-show`)).status()).toBe(422);
  await client.close();

  await page.goto("/admin/pagos");
  const due = page.getByRole("listitem").filter({ hasText: guest.name });
  await expect(due).toBeVisible();
  await due.getByRole("button", { name: "No se presentó" }).click();
  await due.getByRole("button", { name: "Sí, no se presentó" }).click();
  await expect(page.getByText("Marcada como no se presentó. Ya no está por cobrar.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: guest.name })).toHaveCount(0);

  await page.goto(`/admin?fecha=${played.date}`);
  await expect(page.getByRole("row").filter({ hasText: guest.name })).toContainText("No se presentó");

  const pay = await context.request.post(`/api/admin/bookings/${played.id}/payment`, { data: { amount: 50, method: "efectivo" } });
  expect(pay.status()).toBe(409);
});

test("CA-14 configurar canchas: precios nuevos, horario recortado, mantenimiento y cancha nueva", async ({ page, context, browser }) => {
  const saturday = nextWeekday(6);
  const client = await newContext(browser);
  await registerViaApi(client, "ca14");
  await bookViaApi(client.request, { courtId: "media-a", date: saturday, startTime: "10:00", durationMin: 60 });

  await loginAdmin(context);
  const original = await (await context.request.get("/api/admin/courts/media-a")).json();
  try {
    await page.goto("/admin/canchas");
    await page.getByRole("button", { name: "Fútbol · Media A", exact: false }).first().click();
    const editor = page.getByRole("form", { name: "Fútbol · Media A" });

    // Precios nuevos 60 -> 55, y el sábado abre a las 12:00.
    await editor.locator('input[id="precio-media-a-60"]').fill("55");
    await editor.getByLabel("Abre Sábado").selectOption("12:00");
    await editor.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText(/Cambios guardados en Fútbol · Media A/)).toBeVisible();

    // La reserva existente conserva precio y horario.
    await page.goto(`/admin?fecha=${saturday}`);
    const row = page.getByRole("row").filter({ hasText: "Fútbol · Media A" });
    await expect(row).toContainText("10:00");
    await expect(row).toContainText("$50");

    // Las nuevas reservas usan el precio nuevo y el nuevo horario ("cerrado" antes de las 12:00).
    const p2 = await client.newPage();
    await p2.goto(gridUrl(saturday));
    await expect(cell(p2, "Fútbol · Media A", "11:30", "cerrado")).toBeVisible();
    await expect(freeCell(p2, "Fútbol · Media A", "12:00")).toBeVisible();
    await freeCell(p2, "Fútbol · Media A", "12:00").click();
    await expect(p2.locator("aside.panel .price")).toHaveText("$55");

    // Mantenimiento: la cancha deja de aparecer y no admite reservas.
    await page.goto("/admin/canchas");
    await page.getByRole("switch", { name: "Fútbol · Media A: activa" }).click();
    await expect(page.getByText("En mantenimiento", { exact: true })).toBeVisible();
    await p2.goto(gridUrl(saturday));
    await expect(p2.getByRole("group", { name: "Fútbol · Media B", exact: true })).toBeVisible();
    await expect(p2.getByRole("group", { name: "Fútbol · Media A", exact: true })).toHaveCount(0);
    const blocked = await client.request.post("/api/bookings", {
      data: { courtId: "media-a", date: saturday, startTime: "14:00", durationMin: 60 },
    });
    expect(blocked.status()).toBe(422);

    // Una cancha con reservas no se puede borrar.
    expect((await context.request.delete("/api/admin/courts/media-a")).status()).toBe(409);

    // Crear una cancha nueva ("Pádel 2") y verla en la disponibilidad.
    await page.getByRole("button", { name: "Agregar cancha" }).click();
    const add = page.getByRole("form", { name: "Agregar cancha" });
    await add.getByLabel("Id (kebab-case)").fill("padel-2");
    await add.getByLabel("Nombre", { exact: true }).fill("Pádel 2");
    await add.getByLabel("Deporte").selectOption("padel");
    await add.getByLabel(/Espacios/).fill("padel-2");
    await add.locator('input[id="precio-nueva-60"]').fill("22");
    await add.locator('input[id="precio-nueva-90"]').fill("33");
    await add.locator('input[id="precio-nueva-120"]').fill("44");
    await add.getByRole("button", { name: "Crear cancha" }).click();
    await expect(page.getByText(/Cancha "Pádel 2" creada/)).toBeVisible();
    await p2.goto(gridUrl(saturday));
    await expect(p2.getByRole("group", { name: "Pádel 2", exact: true })).toBeVisible();
  } finally {
    // Deja Media A como estaba para no afectar a otras pruebas.
    const res = await context.request.put("/api/admin/courts/media-a", { data: original });
    expect(res.status(), await res.text()).toBe(200);
  }
  await client.close();
});
