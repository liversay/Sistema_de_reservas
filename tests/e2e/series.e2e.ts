import { bookViaApi, cell, dayOffset, expect, freeCell, gridUrl, loginAdmin, longDate, newContext, registerViaApi, seedPastBooking, test } from "./fixtures";

// CR-01 (reservas recurrentes), CA-15…CA-18. Cada prueba usa una cancha/hora propia para no depender del orden.

type Row = { id: string; date: string; status: string; seriesId?: string; payment: { status: string }; startTime: string; price: number; basePrice: number; discountPct: number };
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const mine = async (req: import("@playwright/test").APIRequestContext) => (await (await req.get("/api/bookings/mine")).json()) as Row[];

test("CA-15 el cliente repite cada semana: 4 reservas con un mismo seriesId, cada una con su precio", async ({ page, context }) => {
  const date = dayOffset(1);
  const dates = [0, 7, 14, 21].map((n) => addDays(date, n));
  await registerViaApi(context, "ca15");
  await page.goto(gridUrl(date));

  await freeCell(page, "Pádel 1", "5:00 p. m.").click();
  const panel = page.locator("aside.panel");
  const repeat = panel.getByTestId("repetir");
  await repeat.getByLabel("Repetir cada semana").check();
  await repeat.getByLabel("Semanas").selectOption("4");
  await expect(repeat.getByRole("listitem")).toHaveCount(4);
  await expect(panel.getByTestId("serie-total")).toContainText("4 reservas");
  // Socio: 20 menos 10 % = 18 por ocurrencia, 72 en total.
  await expect(panel.getByTestId("serie-total")).toContainText("$72");
  await panel.getByRole("button", { name: "Confirmar 4 reservas" }).click();
  await expect(page.getByText("Serie confirmada: 4 reservas.")).toBeVisible();

  // Mis reservas: las 4 en un solo grupo de serie.
  await page.goto("/mis-reservas");
  const serie = page.getByTestId("serie");
  await expect(serie).toHaveCount(1);
  await expect(serie).toContainText("Serie semanal · Pádel 1");
  await expect(serie).toContainText("4 próximas");

  // API: mismo seriesId, fechas +7·k, confirmada, pago pendiente, precio por ocurrencia.
  const rows = (await mine(context.request)).filter((b) => b.seriesId).sort((a, b) => a.date.localeCompare(b.date));
  expect(rows.map((b) => b.date)).toEqual(dates);
  expect(new Set(rows.map((b) => b.seriesId)).size).toBe(1);
  for (const b of rows) {
    expect(b.status).toBe("confirmada");
    expect(b.payment.status).toBe("pendiente");
    expect(b).toMatchObject({ price: 18, basePrice: 20, discountPct: 10 });
  }
  // weeks fuera de 2…8 → 400.
  for (const weeks of [1, 9]) {
    const bad = await context.request.post("/api/bookings/series", { data: { courtId: "padel-1", date, startTime: "18:00", durationMin: 60, weeks } });
    expect(bad.status()).toBe(400);
  }
  // La primera ocurrencia ocupa la cuadrícula del primer día.
  await page.goto(gridUrl(date));
  await expect(cell(page, "Pádel 1", "5:00 p. m.", "ocupado")).toBeVisible();
});

test("CA-16 serie todo-o-nada: un choque con fecha impide crear cualquier ocurrencia", async ({ page, context, browser }) => {
  const date = dayOffset(1);
  const [, , third, fourth] = [0, 7, 14, 21].map((n) => addDays(date, n)) as [string, string, string, string];
  const other = await newContext(browser);
  await registerViaApi(other, "ca16-otro");
  await bookViaApi(other.request, { courtId: "basquet-1", date: third, startTime: "17:00", durationMin: 60 });

  await registerViaApi(context, "ca16");
  await page.goto(gridUrl(date));
  await freeCell(page, "Básquet 1", "5:00 p. m.").click();
  const panel = page.locator("aside.panel");
  await panel.getByTestId("repetir").getByLabel("Repetir cada semana").check();
  await panel.getByTestId("repetir").getByLabel("Semanas").selectOption("4");
  await panel.getByRole("button", { name: "Confirmar 4 reservas" }).click();

  await expect(page.getByRole("alert")).toContainText(`Ese horario ya fue tomado el ${third}. Elige otro.`);
  // Todo-o-nada: no se creó ninguna; las demás fechas siguen libres.
  expect((await mine(context.request)).filter((b) => b.seriesId)).toHaveLength(0);
  const probe = await newContext(browser);
  await registerViaApi(probe, "ca16-probe");
  for (const d of [date, addDays(date, 7), fourth]) {
    const p = await probe.newPage();
    await p.goto(gridUrl(d));
    await expect(freeCell(p, "Básquet 1", "17:00")).toBeVisible();
    await p.close();
  }
  // Misma regla por API: 409 con la fecha; 422 por fecha fuera de horario/pasado también sin crear nada.
  const res = await context.request.post("/api/bookings/series", { data: { courtId: "basquet-1", date, startTime: "17:00", durationMin: 60, weeks: 4 } });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toBe(`Ese horario ya fue tomado el ${third}. Elige otro.`);
  const late = await context.request.post("/api/bookings/series", { data: { courtId: "basquet-1", date, startTime: "22:30", durationMin: 60, weeks: 3 } });
  expect(late.status()).toBe(422);
  expect(await mine(context.request)).toHaveLength(0);

  // Con 2 semanas (no llega al choque) la serie sí se crea completa.
  const ok = await context.request.post("/api/bookings/series", { data: { courtId: "basquet-1", date, startTime: "17:00", durationMin: 60, weeks: 2 } });
  expect(ok.status()).toBe(201);
  await other.close();
  await probe.close();
});

/**
 * CA-17: el servidor e2e usa el reloj real y la API no crea ocurrencias pasadas (RN-04), así que la serie se
 * arma como en producción tras unas semanas: 2 ocurrencias futuras reales (POST /api/bookings/series, weeks = 2)
 * y 2 ya jugadas sembradas en MongoDB (`seedPastBooking` con el mismo seriesId y el mismo usuario).
 * Se verifica en la UI («Cancelar las próximas») y por la API: solo las futuras pasan a cancelada.
 */
test("CA-17 cancelar las próximas de una serie deja intactas las ya empezadas y libera las futuras", async ({ page, context, browser }) => {
  await registerViaApi(context, "ca17");
  const me = (await (await context.request.get("/api/auth/me")).json()) as { id: string };
  const first = dayOffset(2);
  const res = await context.request.post("/api/bookings/series", { data: { courtId: "media-b", date: first, startTime: "17:00", durationMin: 60, weeks: 2 } });
  expect(res.status()).toBe(201);
  const { seriesId } = (await res.json()) as { seriesId: string };
  for (const daysAgo of [5, 12]) {
    await seedPastBooking({ courtId: "media-b", spaceIds: ["futbol-media-b"], daysAgo, startSlot: 34, price: 50, userId: me.id, seriesId });
  }
  expect((await mine(context.request)).filter((b) => b.seriesId === seriesId)).toHaveLength(4);

  await page.goto("/mis-reservas");
  const serie = page.getByTestId("serie");
  await expect(serie).toContainText("2 próximas");
  await page.getByRole("button", { name: "Cancelar las próximas de la serie Fútbol · Media B 5:00 p. m." }).click();
  await serie.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(page.getByText("Cancelaste 2 reservas de la serie. Los horarios quedaron libres.")).toBeVisible();

  const after = (await mine(context.request)).filter((b) => b.seriesId === seriesId);
  const today = dayOffset(0);
  expect(after.filter((b) => b.date < today).map((b) => b.status)).toEqual(["confirmada", "confirmada"]);
  expect(after.filter((b) => b.date > today).map((b) => b.status)).toEqual(["cancelada", "cancelada"]);
  // Repetir → 200 { cancelled: 0 }.
  const again = await context.request.post(`/api/bookings/series/${seriesId}/cancel-future`);
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual({ cancelled: 0 });

  // Otro cliente: 404 para una serie ajena; id inexistente: 404.
  const stranger = await newContext(browser);
  await registerViaApi(stranger, "ca17-ajeno");
  expect((await stranger.request.post(`/api/bookings/series/${seriesId}/cancel-future`)).status()).toBe(404);
  expect((await context.request.post(`/api/bookings/series/${crypto.randomUUID()}/cancel-future`)).status()).toBe(404);
  await stranger.close();

  // Los horarios futuros quedaron libres para otros.
  const p2 = await context.newPage();
  await p2.goto(gridUrl(first));
  await expect(freeCell(p2, "Fútbol · Media B", "17:00")).toBeVisible();
});

test("CA-18 el admin crea una serie para un invitado y cada ocurrencia se cobra por separado", async ({ page, context }) => {
  await loginAdmin(context);
  const sat = (() => {
    for (let i = 1; i <= 7; i++) {
      const d = dayOffset(i);
      const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
      if (new Date(y, m - 1, dd).getDay() === 6) return d;
    }
    throw new Error("unreachable");
  })();
  const dates = [0, 7, 14].map((n) => addDays(sat, n));
  const guest = { name: "Invitada Serie18", phone: "+593 98 180 0018" };

  await page.goto(`/admin?fecha=${sat}`);
  await page.getByRole("button", { name: "+ Nueva reserva", exact: true }).click();
  const form = page.getByRole("form", { name: "Nueva reserva" });
  await form.getByLabel("Cancha").selectOption({ label: "Pádel 1" });
  await form.getByLabel("Fecha").fill(sat);
  await form.getByLabel("Hora de inicio").selectOption("09:00");
  await form.getByLabel("Nombre del invitado").fill(guest.name);
  await form.getByLabel("Teléfono").fill(guest.phone);
  await form.getByLabel("Repetir cada semana").check();
  await form.getByLabel("Semanas").selectOption("3");
  await expect(form.getByTestId("nueva-precio")).toHaveText("$60");
  await form.getByRole("button", { name: "Crear 3 reservas" }).click();
  await expect(page.getByText(`Serie creada: 3 reservas semanales desde el ${longDate(sat)}, Pádel 1, 9:00 a. m. – 10:00 a. m., $20 c/u.`)).toBeVisible();

  const list = async (d: string) =>
    ((await (await context.request.get(`/api/admin/bookings?date=${d}`)).json()) as (Row & { createdBy: string; guest?: { name: string }; courtId: string })[]).filter(
      (b) => b.courtId === "padel-1" && b.startTime === "09:00",
    );
  const created = (await Promise.all(dates.map(list))).flat();
  expect(created).toHaveLength(3);
  expect(new Set(created.map((b) => b.seriesId)).size).toBe(1);
  for (const b of created) {
    expect(b.createdBy).toBe("admin");
    expect(b.guest?.name).toBe(guest.name);
  }
  const seriesId = created[0]!.seriesId!;

  // Una ocurrencia ya jugada de la misma serie (fixture, ver docs/testing.md): se cobra solo esa.
  const played = await seedPastBooking({ courtId: "padel-1", spaceIds: ["padel-1"], daysAgo: 7, startSlot: 18, price: 20, guest, seriesId });
  const [playedRow] = await list(played.date);
  expect(playedRow!.seriesId).toBe(seriesId);

  const pay = await context.request.post(`/api/admin/bookings/${playedRow!.id}/payment`, { data: { amount: 20, method: "efectivo" } });
  expect(pay.status(), await pay.text()).toBe(200);
  expect((await list(played.date))[0]!.payment.status).toBe("pagado");
  for (const d of dates) expect((await list(d))[0]!.payment.status).toBe("pendiente");
  // La siguiente (futura) aún no se puede cobrar.
  const early = await context.request.post(`/api/admin/bookings/${created[0]!.id}/payment`, { data: { amount: 20, method: "efectivo" } });
  expect(early.status()).toBe(422);

  // Validación: sin teléfono 400; choque en una fecha 409 con la fecha y sin crear nada.
  const noPhone = await context.request.post("/api/admin/bookings/series", { data: { courtId: "padel-1", date: sat, startTime: "11:00", durationMin: 60, weeks: 3, guest: { name: "Sin Tel" } } });
  expect(noPhone.status()).toBe(400);
  const clash2 = await context.request.post("/api/admin/bookings/series", { data: { courtId: "padel-1", date: sat, startTime: "09:00", durationMin: 60, weeks: 3, guest } });
  expect(clash2.status()).toBe(409);
  expect((await clash2.json()).error).toBe(`Ese horario ya fue tomado el ${sat}. Elige otro.`);
  expect(await list(addDays(sat, 21))).toHaveLength(0);
});
