import {
  bookViaApi,
  cell,
  CONFLICT,
  dayOffset,
  expect,
  freeCell,
  gridUrl,
  loginAdmin,
  longDate,
  newContext,
  nextWeekday,
  registerViaApi,
  seedPastBooking,
  test,
} from "./fixtures";

const MEDIA_A = { courtId: "media-a", spaceIds: ["futbol-media-a"] };

/** Barra del tablero de una reserva por su id (`data-booking`). */
const barOf = (page: import("@playwright/test").Page, id: string) => page.locator(`.bbar[data-booking="${id}"]`);

test("CA-10 admin ve las reservas del día en el tablero y puede cancelar cualquiera", async ({ page, context, browser }) => {
  const date = dayOffset(3);
  const client = await newContext(browser);
  const user = await registerViaApi(client, "ca10");
  const confirmedB = await bookViaApi(client.request, { courtId: "padel-1", date, startTime: "20:00", durationMin: 60 });
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
  await expect(page.getByRole("tab", { name: "Reservas" })).toHaveAttribute("aria-selected", "true");
  const board = page.getByRole("region", { name: "Tablero de canchas y horarios" });
  // Confirmada: barra con cliente, cancha, hora en 12 h, estado y pago; la cancelada no ocupa bloques y se lista aparte.
  const confirmed = barOf(page, confirmedB.id);
  await expect(confirmed).toHaveAccessibleName(`${user.name}, Pádel 1, 8:00 p. m. a 9:00 p. m., Confirmada, No aplica`);
  await expect(board.locator(`.bbar[data-booking="${toCancel.id}"]`)).toHaveCount(0);
  const cancelledItem = page.locator(`.cancel-item[data-booking="${toCancel.id}"]`);
  await expect(cancelledItem).toContainText("9:00 p. m. – 10:00 p. m.");
  await expect(cancelledItem).toContainText("Cancelada");
  // Tarjeta: cliente socio con descuento, estado y pago pendiente.
  await confirmed.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(user.name);
  await expect(dialog).toContainText("Socio −10 %");
  await expect(dialog).toContainText("Pádel 1");
  await expect(dialog).toContainText("Confirmada");
  await expect(dialog).toContainText("Pendiente");
  await page.keyboard.press("Escape");

  // Jugada (ayer): estado y pago.
  await page.goto(`/admin?fecha=${played.date}`);
  const playedBar = barOf(page, played.id);
  await expect(playedBar).toHaveAccessibleName("Invitado Jugada10, Fútbol · Media A, 5:00 p. m. a 6:00 p. m., Jugada, Por cobrar");
  await playedBar.click();
  await expect(page.getByRole("dialog")).toContainText("Invitado");
  await expect(page.getByRole("dialog")).toContainText("Pendiente · por cobrar");
  await page.keyboard.press("Escape");

  // Cancelar desde la tarjeta libera los bloques.
  await page.goto(`/admin?fecha=${date}`);
  await confirmed.click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(page.getByText(`Reserva de ${user.name} cancelada. El horario quedó libre.`)).toBeVisible();
  await expect(board.locator(`.bbar[data-booking="${confirmedB.id}"]`)).toHaveCount(0);
  await expect(page.locator(`.cancel-item[data-booking="${confirmedB.id}"]`)).toContainText("Cancelada");
  const p2 = await client.newPage();
  await p2.goto(gridUrl(date));
  await expect(freeCell(p2, "Pádel 1", "8:00 p. m.")).toBeVisible();
  await expect(freeCell(p2, "Pádel 1", "8:30 p. m.")).toBeVisible();
  // Cancelar una ya cancelada responde 409.
  expect((await context.request.post(`/api/admin/bookings/${confirmedB.id}/cancel`)).status()).toBe(409);
  await client.close();
});

test("CA-11 admin crea una reserva para un invitado y el choque muestra el mensaje exacto", async ({ page, context }) => {
  const date = nextWeekday(6); // sábado: Básquet 1 abre 8:00 a. m.
  await loginAdmin(context);
  await page.goto(`/admin?fecha=${date}`);

  const open = async () => {
    await page.getByRole("button", { name: "+ Nueva reserva", exact: true }).click();
    const form = page.getByRole("form", { name: "Nueva reserva" });
    await form.getByLabel("Cancha").selectOption({ label: "Básquet 1" });
    await form.getByLabel("Fecha").fill(date);
    await form.getByLabel("Hora de inicio").selectOption("10:00"); // valor 24 h, texto «10:00 a. m.»
    return form;
  };

  // Sin nombre ni teléfono no se envía.
  let form = await open();
  await expect(form.getByLabel("Hora de inicio").locator("option:checked")).toHaveText("10:00 a. m.");
  await form.getByRole("button", { name: "Crear reserva" }).click();
  await expect(form.getByText("Escribe el nombre del invitado.")).toBeVisible();
  await expect(form.getByText(/Teléfono de 7 a 15 dígitos/)).toBeVisible();

  await form.getByLabel("Nombre del invitado").fill("Invitada Once");
  await form.getByLabel("Teléfono").fill("+593 98 111 2233");
  await expect(form.getByTestId("nueva-precio")).toHaveText("$30");
  await form.getByRole("button", { name: "Crear reserva" }).click();
  await expect(page.getByText("Reserva creada: Básquet 1, 10:00 a. m. – 11:00 a. m., $30.")).toBeVisible();
  const created = page.locator(".bbar").filter({ hasText: "Invitada O." });
  await expect(created).toHaveAccessibleName("Invitada Once, Básquet 1, 10:00 a. m. a 11:00 a. m., Confirmada, No aplica");
  await created.click();
  await expect(page.getByRole("dialog")).toContainText("Invitado");
  await expect(page.getByRole("dialog")).toContainText(new RegExp(longDate(date), "i"));
  await page.keyboard.press("Escape");

  // Ocupa los bloques en la vista cliente.
  const p2 = await context.newPage();
  await p2.goto(gridUrl(date));
  await expect(cell(p2, "Básquet 1", "10:00 a. m.", "ocupado")).toBeVisible();
  await expect(cell(p2, "Básquet 1", "10:30 a. m.", "ocupado")).toBeVisible();
  await p2.close();

  // El mismo turno otra vez: 409 con el mensaje exacto.
  form = await open();
  await form.getByLabel("Nombre del invitado").fill("Otra Invitada");
  await form.getByLabel("Teléfono").fill("+593 98 999 8877");
  await form.getByRole("button", { name: "Crear reserva" }).click();
  await expect(form.getByRole("alert")).toContainText(CONFLICT);

  // Con la API: invitado sin teléfono = 400; en el pasado = 422; más allá de hoy + 30 días = 422 (RN-14).
  const bad = await context.request.post("/api/admin/bookings", {
    data: { courtId: "basquet-1", date, startTime: "12:00", durationMin: 60, guest: { name: "Sin Tel" } },
  });
  expect(bad.status()).toBe(400);
  const past = await context.request.post("/api/admin/bookings", {
    data: { courtId: "basquet-1", date: dayOffset(-1), startTime: "12:00", durationMin: 60, guest: { name: "Pasado", phone: "+593 98 000 0000" } },
  });
  expect(past.status()).toBe(422);
  const far = await context.request.post("/api/admin/bookings", {
    data: { courtId: "basquet-1", date: dayOffset(31), startTime: "18:00", durationMin: 60, guest: { name: "Lejos", phone: "+593 98 000 0000" } },
  });
  expect(far.status()).toBe(422);
  expect((await far.json()).error).toBe("Solo se puede reservar hasta 30 días de anticipación.");
});

test("CA-12 el admin cobra una reserva jugada desde la tarjeta; antes de jugar no se puede cobrar", async ({ page, context, browser }) => {
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
  const due0 = (await (await context.request.get("/api/admin/payments?status=pending")).json()) as { id: string }[];
  expect(due0.map((b) => b.id)).toContain(played.id);
  expect(due0.map((b) => b.id)).not.toContain(future.id);
  await client.close();

  // Pestaña Pagos del día jugado: 50 por cobrar, nada cobrado.
  await page.goto(`/admin?fecha=${played.date}&vista=pagos&rango=dia`);
  await expect(page.getByTestId("kpi-por-cobrar")).toHaveText("$50");
  await expect(page.getByTestId("kpi-cobrado")).toHaveText("$0");
  const dueList = page.getByRole("region", { name: /Por cobrar/ }).or(page.locator("section.dash-card").filter({ hasText: "Por cobrar" }));
  await dueList.getByRole("button", { name: /Invitado C\./ }).click();

  // La tarjeta abre con la reserva; monto prellenado con el precio, ajustable; método transferencia.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(guest.name);
  await dialog.getByRole("button", { name: "Cobrar $50" }).click();
  const amount = dialog.getByLabel("Monto cobrado ($)");
  await expect(amount).toHaveValue("50");
  await expect(dialog.getByRole("radio")).toHaveCount(4); // efectivo, tarjeta, Yappy y transferencia
  await amount.fill("45");
  await dialog.getByText("Transferencia", { exact: true }).click({ force: true });
  await dialog.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.getByText(`Pago registrado: $45 en transferencia · ${guest.name}.`)).toBeVisible();

  // Sale de «por cobrar» y pasa a cobrado por transferencia en los indicadores y en el tablero.
  await expect(page.getByTestId("kpi-por-cobrar")).toHaveText("$0");
  await expect(page.getByTestId("kpi-cobrado")).toHaveText("$45");
  await expect(page.getByTestId("por-metodo").getByRole("listitem").filter({ hasText: "Transferencia" })).toContainText("$45");
  const paidBar = barOf(page, played.id);
  await expect(paidBar).toHaveClass(/pay-paid/);
  await expect(paidBar).toContainText("$45 · Transferencia");
  await paidBar.click();
  await expect(page.getByRole("dialog")).toContainText("Pagado $45 · Transferencia");
  await expect(page.getByRole("dialog").getByRole("button", { name: /^Cobrar/ })).toHaveCount(0);
  const due1 = (await (await context.request.get("/api/admin/payments?status=pending")).json()) as { id: string }[];
  expect(due1.map((b) => b.id)).not.toContain(played.id);
  const paid = (await (await context.request.get("/api/admin/payments?status=paid")).json()) as { id: string }[];
  expect(paid.map((b) => b.id)).toContain(played.id);

  // Un segundo pago sobre la misma reserva responde 409.
  const again = await context.request.post(`/api/admin/bookings/${played.id}/payment`, { data: { amount: 50, method: "efectivo" } });
  expect(again.status()).toBe(409);
  // Monto 0 y método fuera de los cuatro: 400.
  const other = await seedPastBooking({ ...MEDIA_A, daysAgo: 2, startSlot: 38, price: 50, guest });
  expect((await context.request.post(`/api/admin/bookings/${other.id}/payment`, { data: { amount: 0, method: "efectivo" } })).status()).toBe(400);
  expect((await context.request.post(`/api/admin/bookings/${other.id}/payment`, { data: { amount: 50, method: "paypal" } })).status()).toBe(400);
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

  await page.goto(`/admin?fecha=${played.date}&vista=pagos&rango=dia`);
  await expect(page.getByTestId("kpi-por-cobrar")).toHaveText("$50");
  const playedBar = barOf(page, played.id);
  await expect(playedBar).toHaveClass(/pay-due/);
  await playedBar.click();
  await page.getByRole("dialog").getByRole("button", { name: "No se presentó" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sí, no se presentó" }).click();
  await expect(page.getByText(`${guest.name}: marcada como no se presentó. Conserva el horario y no se cobra.`)).toBeVisible();

  // Ya no está por cobrar; cuenta como no-show y conserva sus bloques.
  await expect(page.getByTestId("kpi-por-cobrar")).toHaveText("$0");
  await expect(page.getByTestId("kpi-noshow")).toHaveText("1");
  await expect(playedBar).toHaveClass(/pay-na/);
  await page.getByRole("tab", { name: "Reservas" }).click();
  await expect(playedBar).toHaveAccessibleName(`${guest.name}, Fútbol · Media A, 6:00 p. m. a 7:00 p. m., No se presentó, No aplica`);
  await playedBar.click();
  await expect(page.getByRole("dialog")).toContainText("No se presentó");
  await expect(page.getByRole("dialog").getByRole("button", { name: /^Cobrar/ })).toHaveCount(0);
  const due = (await (await context.request.get("/api/admin/payments?status=pending")).json()) as { id: string }[];
  expect(due.map((b) => b.id)).not.toContain(played.id);

  const pay = await context.request.post(`/api/admin/bookings/${played.id}/payment`, { data: { amount: 50, method: "efectivo" } });
  expect(pay.status()).toBe(409);
});

test("CA-14 configurar canchas: precios nuevos, horario recortado, mantenimiento y cancha nueva", async ({ page, context, browser }) => {
  const saturday = nextWeekday(6);
  const client = await newContext(browser);
  await registerViaApi(client, "ca14");
  const existing = await bookViaApi(client.request, { courtId: "media-a", date: saturday, startTime: "10:00", durationMin: 60 });

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

    // La reserva existente conserva precio (45 = 50 menos el 10 % de socio) y horario.
    await page.goto(`/admin?fecha=${saturday}`);
    const row = barOf(page, existing.id);
    await expect(row).toHaveAccessibleName(/Fútbol · Media A, 10:00 a\. m\. a 11:00 a\. m\./);
    await row.click();
    await expect(page.getByRole("dialog")).toContainText("$45");
    await expect(page.getByRole("dialog").locator("s")).toHaveText("$50");
    await page.keyboard.press("Escape");
    const stored = ((await (await context.request.get(`/api/admin/bookings?date=${saturday}`)).json()) as { id: string; price: number; basePrice: number; startTime: string }[]).find(
      (b) => b.id === existing.id,
    );
    expect(stored).toMatchObject({ price: 45, basePrice: 50, startTime: "10:00" });

    // Las nuevas reservas usan el precio nuevo y el nuevo horario ("cerrado" antes de las 12:00).
    const p2 = await client.newPage();
    await p2.goto(gridUrl(saturday));
    await expect(cell(p2, "Fútbol · Media A", "11:30", "cerrado")).toBeVisible();
    await expect(freeCell(p2, "Fútbol · Media A", "12:00")).toBeVisible();
    await freeCell(p2, "Fútbol · Media A", "12:00").click();
    await expect(p2.getByTestId("precio-base")).toHaveText("$55");
    await expect(p2.getByTestId("precio-final")).toHaveText("$49.50"); // 55 menos el 10 % de socio

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
