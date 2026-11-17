import type { APIRequestContext } from "@playwright/test";
import {
  addDays,
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
  registerViaApi,
  seedPastBooking,
  test,
} from "./fixtures";

// CR-02 (reserva sin cuenta, club de socios, horizonte de 30 días, 12 h, tablero del backoffice): CA-19…CA-25.
// Cada prueba usa canchas/horas/días propios y deja el % de socios en 10 al terminar (es un ajuste global).

const GUEST = { name: "Ana Pérez", phone: "+507 6000 1234" };
const HORIZON_MSG = "Solo se puede reservar hasta 30 días de anticipación.";
/** Cualquier hora en 24 h que no vaya seguida de «a. m.» / «p. m.». */
const TIME_24H = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b(?!\s?[ap]\. m\.)/;

type B = {
  id: string;
  date: string;
  startTime: string;
  courtId: string;
  price: number;
  basePrice: number;
  discountPct: number;
  status: string;
  seriesId?: string;
  createdBy: string;
  guest?: { name: string; phone: string };
  user?: { name: string };
  payment: { status: string; amount?: number; method?: string };
};

const setLoyalty = (admin: APIRequestContext, discountPct: unknown) => admin.put("/api/admin/settings/loyalty", { data: { discountPct } });
const publicLoyalty = async (req: APIRequestContext) => ((await (await req.get("/api/settings/loyalty")).json()) as { discountPct: number }).discountPct;
async function adminBookings(admin: APIRequestContext, date: string) {
  const res = await admin.get(`/api/admin/bookings?date=${date}`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as B[];
}

test("CA-19 reservar sin cuenta: nombre y teléfono con errores por campo, 201 por API y reglas intactas", async ({ page, context, browser }) => {
  const date = dayOffset(3);
  await page.goto(gridUrl(date));
  await freeCell(page, "Pádel 1", "6:00 p. m.").click();
  const panel = page.locator("aside.panel");
  // Sin sesión el panel pide los datos y el precio es el de lista.
  await expect(panel.getByTestId("datos-invitado")).toBeVisible();
  await expect(panel.getByTestId("precio-final")).toHaveText("$20");
  await expect(panel.getByTestId("socio-descuento")).toHaveCount(0);

  // Vacío: un error en español por campo y no se crea nada.
  await panel.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(panel.getByText("Escribe tu nombre (de 2 a 60 caracteres).")).toBeVisible();
  await expect(panel.getByText("Escribe un teléfono de 7 a 15 caracteres (números y espacios).")).toBeVisible();
  await expect(panel.getByTestId("invitado-nombre")).toBeFocused();
  await panel.getByTestId("invitado-nombre").fill("A");
  await panel.getByTestId("invitado-telefono").fill("abc");
  await panel.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(panel.getByText("Escribe tu nombre (de 2 a 60 caracteres).")).toBeVisible();
  await expect(panel.getByText("Escribe un teléfono de 7 a 15 caracteres (números y espacios).")).toBeVisible();
  await expect(page.getByTestId("reserva-confirmada")).toHaveCount(0);

  // Con datos válidos: reserva confirmada a nombre del invitado.
  await panel.getByTestId("invitado-nombre").fill(GUEST.name);
  await panel.getByTestId("invitado-telefono").fill(GUEST.phone);
  await panel.getByRole("button", { name: "Confirmar reserva" }).click();
  const ok = page.getByTestId("reserva-confirmada");
  await expect(ok).toContainText("Reserva confirmada.");
  await expect(ok).toContainText(`A nombre de ${GUEST.name} · ${GUEST.phone}`);
  await expect(ok).toContainText("Para cancelar llama al complejo.");
  await expect(ok).toContainText("$20");
  await expect(cell(page, "Pádel 1", "6:00 p. m.", "ocupado")).toBeVisible();
  await expect(cell(page, "Pádel 1", "6:30 p. m.", "ocupado")).toBeVisible();
  await expect(freeCell(page, "Pádel 1", "7:00 p. m.")).toBeVisible();

  // API sin sesión: 201 con guest, createdBy client, sin descuento y pago pendiente.
  const anon = await newContext(browser);
  const body = { courtId: "padel-1", date, startTime: "20:00", durationMin: 60 };
  const created = await anon.request.post("/api/bookings", { data: { ...body, guest: GUEST } });
  expect(created.status(), await created.text()).toBe(201);
  expect(await created.json()).toMatchObject({
    guest: GUEST,
    createdBy: "client",
    status: "confirmada",
    price: 20,
    basePrice: 20,
    discountPct: 0,
    payment: { status: "pendiente" },
  });
  // 400 con `fields` por campo y sin crear nada.
  const admin0 = await loginAdminCtx(browser);
  const before = (await adminBookings(admin0.request, date)).length;
  await admin0.close();
  const noGuest = await anon.request.post("/api/bookings", { data: { ...body, startTime: "21:00" } });
  expect(noGuest.status()).toBe(400);
  expect(Object.keys((await noGuest.json()).fields)).toEqual(expect.arrayContaining(["guest.name", "guest.phone"]));
  const bad = await anon.request.post("/api/bookings", { data: { ...body, startTime: "21:00", guest: { name: "A", phone: "abc" } } });
  expect(bad.status()).toBe(400);
  expect(Object.keys((await bad.json()).fields)).toEqual(expect.arrayContaining(["guest.name", "guest.phone"]));
  // El choque sigue siendo 409 con el mensaje exacto.
  const clash = await anon.request.post("/api/bookings", { data: { ...body, guest: GUEST } });
  expect(clash.status()).toBe(409);
  expect((await clash.json()).error).toBe(CONFLICT);
  // Series sin sesión: con guest 201, sin guest 400.
  const series = { courtId: "padel-1", date, startTime: "22:00", durationMin: 60, weeks: 2 };
  expect((await anon.request.post("/api/bookings/series", { data: series })).status()).toBe(400);
  const s = await anon.request.post("/api/bookings/series", { data: { ...series, guest: GUEST } });
  expect(s.status(), await s.text()).toBe(201);
  for (const b of ((await s.json()) as { bookings: B[] }).bookings) expect(b).toMatchObject({ guest: GUEST, price: 20, discountPct: 0 });
  // Mis reservas y cancelar siguen exigiendo cuenta.
  expect((await anon.request.get("/api/bookings/mine")).status()).toBe(401);
  expect((await anon.request.post(`/api/bookings/${(await created.json()).id}/cancel`)).status()).toBe(401);
  await anon.close();

  // Con sesión de cliente, `guest` se ignora y la reserva queda a nombre del usuario.
  const member = await registerViaApi(context, "ca19");
  const own = await context.request.post("/api/bookings", { data: { ...body, startTime: "19:00", guest: GUEST } });
  expect(own.status(), await own.text()).toBe(201);
  const ownJson = (await own.json()) as B;
  expect(ownJson.user?.name).toBe(member.name);
  expect(ownJson.guest).toBeUndefined();

  // Admin: las 400 no crearon nada; ese día solo se sumaron la 1.ª ocurrencia de la serie y la del socio (2), y hay 3 reservas de invitado (UI, API y serie).
  const admin = await loginAdminCtx(browser);
  const list = await adminBookings(admin.request, date);
  expect(list.length - before).toBe(2); // 1.ª ocurrencia de la serie + la del socio
  expect(list.filter((b) => b.guest?.name === GUEST.name && b.courtId === "padel-1")).toHaveLength(3);
  await admin.close();
});

async function loginAdminCtx(browser: import("@playwright/test").Browser) {
  const ctx = await newContext(browser);
  await loginAdmin(ctx);
  return ctx;
}

test("CA-20 socio con sesión: descuento visible y guardado, y «Club de socios» separado del encabezado", async ({ page, context, browser }) => {
  const date = dayOffset(2);
  await registerViaApi(context, "ca20");
  expect(await publicLoyalty(context.request)).toBe(10);

  await page.goto(gridUrl(date));
  await freeCell(page, "Fútbol · Media A", "8:00 p. m.").click();
  const panel = page.locator("aside.panel");
  // Con sesión no se piden datos de invitado y se ve el descuento: base tachada y precio final.
  await expect(panel.getByTestId("datos-invitado")).toHaveCount(0);
  await expect(panel.getByTestId("socio-descuento")).toHaveText("Socio: −10 %");
  await expect(panel.getByTestId("precio-base")).toHaveText("$50");
  await expect(panel.getByTestId("precio-final")).toHaveText("$45");
  await panel.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(page.getByTestId("reserva-confirmada")).toContainText("$45 (Socio −10 %)");
  const [mine] = (await (await context.request.get("/api/bookings/mine")).json()) as B[];
  expect(mine).toMatchObject({ basePrice: 50, discountPct: 10, price: 45, payment: { status: "pendiente" } });
  // Mis reservas muestra el precio con descuento y la hora en 12 h.
  await page.getByRole("link", { name: "Mis reservas", exact: true }).first().click();
  const card = page.getByRole("listitem").filter({ hasText: "Fútbol · Media A" });
  await expect(card).toContainText("8:00 p. m. – 9:00 p. m.");
  await expect(card).toContainText("$45");

  // Sin sesión el mismo turno de otra cancha sale a precio de lista y sin descuento.
  const anon = await newContext(browser);
  const guestRes = await anon.request.post("/api/bookings", {
    data: { courtId: "media-b", date, startTime: "20:00", durationMin: 60, guest: GUEST },
  });
  expect(await guestRes.json()).toMatchObject({ basePrice: 50, discountPct: 0, price: 50 });
  // Pádel 1 hora (base 20) → 18 para el socio.
  const padel = await context.request.post("/api/bookings", { data: { courtId: "padel-1", date, startTime: "16:00", durationMin: 60 } });
  expect(await padel.json()).toMatchObject({ basePrice: 20, discountPct: 10, price: 18 });
  await anon.close();

  // «Club de socios»: título, beneficio y tarjeta ≥ 32 px bajo el encabezado a 1280 y a 390 px (login y registro).
  const guest = await newContext(browser);
  const gp = await guest.newPage();
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ] as const) {
    await gp.setViewportSize({ width, height });
    for (const path of ["/ingresar", "/registro"]) {
      await gp.goto(path);
      await expect(gp.getByRole("heading", { level: 1, name: "Club de socios" })).toBeVisible();
      await expect(gp.getByTestId("beneficio-socios")).toHaveText("Los socios tienen 10 % de descuento en cada reserva.");
      const hero = await gp.locator(".hero-auth").boundingBox();
      const card = await gp.locator(".auth-card").boundingBox();
      expect(hero && card).toBeTruthy();
      const gap = card!.y - (hero!.y + hero!.height);
      expect(gap, `${path} a ${width} px: separación ${gap}px`).toBeGreaterThanOrEqual(32);
      expect(await gp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  }
  await guest.close();
});

test("CA-21 horizonte de 30 días: hoy+30 sí, hoy+31 no (API 422), series y admin con el mismo límite; la web ofrece 31 días", async ({
  page,
  context,
  browser,
}) => {
  const last = dayOffset(30);
  const beyond = dayOffset(31);
  const anon = await newContext(browser);
  const admin = await loginAdminCtx(browser);
  const body = { courtId: "padel-1", startTime: "21:00", durationMin: 60, guest: GUEST };

  // Límite: hoy + 30 → 201; hoy + 31 → 422 con el mensaje exacto y sin crear nada.
  const edge = await anon.request.post("/api/bookings", { data: { ...body, date: last } });
  expect(edge.status(), await edge.text()).toBe(201);
  const over = await anon.request.post("/api/bookings", { data: { ...body, date: beyond } });
  expect(over.status()).toBe(422);
  expect((await over.json()).error).toBe(HORIZON_MSG);
  expect(await adminBookings(admin.request, beyond)).toHaveLength(0);

  // Serie semanal de 4 desde hoy+16 (4.ª ocurrencia en hoy+37): 422 nombrando esa fecha y ninguna creada.
  const first = dayOffset(16);
  const fourth = dayOffset(37);
  const serie = { courtId: "basquet-1", date: first, startTime: "21:00", durationMin: 60, guest: GUEST };
  const tooLong = await anon.request.post("/api/bookings/series", { data: { ...serie, weeks: 4 } });
  expect(tooLong.status()).toBe(422);
  expect((await tooLong.json()).error).toContain(fourth);
  for (const d of [first, dayOffset(23), dayOffset(30)]) expect(await adminBookings(admin.request, d)).toHaveLength(d === dayOffset(30) ? 1 : 0);
  // Con 3 semanas (última en hoy+30) sí se crea completa.
  const three = await anon.request.post("/api/bookings/series", { data: { ...serie, weeks: 3 } });
  expect(three.status(), await three.text()).toBe(201);

  // El admin tiene el mismo tope (reserva suelta y serie).
  const adminBody = { courtId: "media-a", startTime: "21:00", durationMin: 60, guest: GUEST };
  expect((await admin.request.post("/api/admin/bookings", { data: { ...adminBody, date: beyond } })).status()).toBe(422);
  const adminEdge = await admin.request.post("/api/admin/bookings", { data: { ...adminBody, date: last } });
  expect(adminEdge.status(), await adminEdge.text()).toBe(201);
  const adminSeries = await admin.request.post("/api/admin/bookings/series", { data: { ...adminBody, date: dayOffset(24), weeks: 2 } });
  expect(adminSeries.status()).toBe(422);
  expect((await adminSeries.json()).error).toContain(dayOffset(31));
  await anon.close();

  // Web: tira de 31 días desde hoy y selector de fecha con min = hoy y max = hoy + 30.
  await page.goto("/");
  const strip = page.getByRole("group", { name: "Día", exact: true });
  await expect(strip.getByRole("button")).toHaveCount(31);
  await expect(strip.getByRole("button").first()).toHaveAttribute("data-day", dayOffset(0));
  await expect(strip.getByRole("button").first()).toHaveAttribute("aria-label", new RegExp(`^Hoy, ${longDate(dayOffset(0))}$`, "i"));
  await expect(strip.getByRole("button").last()).toHaveAttribute("data-day", last);
  const picker = page.getByLabel("Otro día");
  await expect(picker).toHaveAttribute("min", dayOffset(0));
  await expect(picker).toHaveAttribute("max", last);
  await expect(page.getByText(`Puedes reservar hasta ${longDate(last)}.`)).toBeVisible();
  // Un ?fecha= fuera de rango vuelve a hoy.
  await page.goto(gridUrl(beyond));
  await expect(strip.getByRole("button", { pressed: true })).toHaveAttribute("data-day", dayOffset(0));
  // El último día es elegible y la serie ya no cabe (la 2.ª semana pasaría del límite).
  await page.goto(gridUrl(last));
  await expect(strip.getByRole("button", { pressed: true })).toHaveAttribute("data-day", last);
  await freeCell(page, "Pádel 1", "6:00 p. m.").click();
  const repeat = page.locator("aside.panel").getByTestId("repetir");
  await expect(repeat.getByLabel("Repetir cada semana")).toBeDisabled();
  await expect(repeat.getByTestId("serie-limite")).toContainText("No se puede repetir");
  // A hoy+16 caben exactamente 3 semanas (16, 23, 30).
  await page.goto(gridUrl(first, "&cancha=padel-1&hora=18:00"));
  const r2 = page.locator("aside.panel").getByTestId("repetir");
  await r2.getByLabel("Repetir cada semana").check();
  await expect(r2.getByLabel("Semanas").locator("option")).toHaveText(["2 semanas", "3 semanas"]);

  // Backoffice: el tablero no ofrece bloques libres pasado el horizonte, y sí el último día.
  await loginAdmin(context);
  await page.goto(`/admin?fecha=${last}`);
  await expect(page.getByRole("button", { name: /Pádel 1 .* libre: nueva reserva/ }).first()).toBeVisible();
  await page.goto(`/admin?fecha=${beyond}`);
  await expect(page.getByRole("region", { name: "Tablero de canchas y horarios" })).toBeVisible();
  await expect(page.getByRole("button", { name: /libre: nueva reserva/ })).toHaveCount(0);
  await admin.close();
});

/** Bloque (índice de 30 min) en el que cae «ahora»; los bloques ≤ este ya iniciaron. */
const currentSlot = () => {
  const n = new Date();
  return Math.floor((n.getHours() * 60 + n.getMinutes()) / 30);
};
const time12 = (slot: number) => {
  const h = Math.floor(slot / 2);
  return `${h % 12 === 0 ? 12 : h % 12}:${slot % 2 ? "30" : "00"} ${h < 12 ? "a. m." : "p. m."}`;
};

/** Espera a que falten al menos 75 s para el próximo límite de 30 min, así «el bloque actual» no cambia durante la prueba. */
async function settleSlot() {
  const n = new Date();
  const left = 1800 - ((n.getMinutes() % 30) * 60 + n.getSeconds());
  if (left < 75) await new Promise((r) => setTimeout(r, (left + 2) * 1000));
}

test("CA-22 sin horas pasadas y horas en 12 h con fecha larga en cliente y backoffice", async ({ page, context, browser }) => {
  test.setTimeout(150_000);
  await settleSlot();
  test.skip(currentSlot() >= 44, "A partir de las 22:00 no queda un bloque libre hoy para contrastar con los pasados.");
  const admin = await loginAdminCtx(browser);
  const original = await (await admin.request.get("/api/admin/courts/padel-1")).json();
  try {
    // Pádel 1 abre desde las 12:00 a. m. todos los días: así hoy siempre tiene bloques ya iniciados.
    const open = { ...original, schedule: original.schedule.map((d: object) => ({ ...d, open: "00:00", closed: false })) };
    const put = await admin.request.put("/api/admin/courts/padel-1", { data: open });
    expect(put.status(), await put.text()).toBe(200);

    const today = dayOffset(0);
    const cur = currentSlot();
    await page.goto(gridUrl(today));
    const group = page.getByRole("group", { name: "Pádel 1", exact: true });
    await expect(group).toBeVisible();
    // Fecha larga en el título del día.
    await expect(page.locator("#board-title")).toHaveText(new RegExp(`^${longDate(today)}$`, "i"));
    // Bloques que ya iniciaron: «ya pasó», sin botón, y el siguiente está libre.
    for (const s of [0, Math.max(0, cur - 1), cur]) {
      await expect(cell(page, "Pádel 1", time12(s), "ya pasó")).toBeVisible();
      await expect(freeCell(page, "Pádel 1", time12(s))).toHaveCount(0);
    }
    await expect(freeCell(page, "Pádel 1", time12(cur + 1))).toBeVisible();
    // Clic sobre un bloque pasado no elige nada.
    await cell(page, "Pádel 1", time12(0), "ya pasó").click({ force: true });
    await expect(page).not.toHaveURL(/hora=/);
    await expect(page.locator("aside.panel .panel-empty")).toBeVisible();
    // Etiquetas en 12 h: medianoche, mañana, mediodía y noche.
    for (const label of ["12:00 a. m.", "12:30 a. m.", "8:00 a. m.", "12:00 p. m.", "8:00 p. m."]) {
      await expect(page.getByLabel(new RegExp(`^Pádel 1 ${label.replace(/\./g, "\\.")} (libre|ocupado|ya pasó)$`))).toHaveCount(1);
    }
    // Elegir un bloque libre muestra día largo y rango en 12 h en el panel.
    await freeCell(page, "Pádel 1", time12(cur + 1)).click();
    const panel = page.locator("aside.panel");
    await expect(panel).toContainText(new RegExp(longDate(today), "i"));
    await expect(panel).toContainText(`${time12(cur + 1)} – ${time12(cur + 3)}`);

    // La API también rechaza empezar en el pasado (RN-05) y la API sigue hablando en HH:MM.
    const anon = await newContext(browser);
    const past = await anon.request.post("/api/bookings", {
      data: { courtId: "padel-1", date: today, startTime: "00:00", durationMin: 60, guest: GUEST },
    });
    expect(past.status()).toBe(422);
    const avail = (await (await anon.request.get(`/api/availability?date=${today}`)).json()) as { courtId: string; slots: { time: string; state: string }[] }[];
    const slots = avail.find((c) => c.courtId === "padel-1")!.slots;
    expect(slots[0]).toMatchObject({ time: "00:00", state: "pasado" });
    await anon.close();

    // Ninguna hora en 24 h en cliente (sin y con sesión) ni en el backoffice.
    const member = await registerViaApi(context, "ca22");
    void member;
    const own = await context.request.post("/api/bookings", { data: { courtId: "padel-1", date: dayOffset(5), startTime: "20:00", durationMin: 60 } });
    expect(own.status()).toBe(201);
    for (const path of [gridUrl(today), "/mis-reservas", "/ingresar"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await page.waitForLoadState("networkidle");
      if (path === "/mis-reservas") await expect(page.getByRole("listitem").filter({ hasText: "Pádel 1" })).toContainText("8:00 p. m. – 9:00 p. m.");
      const text = await page.locator("body").innerText();
      expect(text, `24 h en ${path}`).not.toMatch(TIME_24H);
    }

    // Backoffice: tablero, Pagos, canchas y la hora de inicio de «Nueva reserva» (valor 24 h, texto 12 h).
    await loginAdmin(context);
    for (const path of ["/admin", "/admin?vista=pagos", "/admin/canchas"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main")).toBeVisible();
      const text = await page.locator("body").innerText();
      expect(text, `24 h en ${path}`).not.toMatch(TIME_24H);
    }
    await page.goto(`/admin?fecha=${today}`);
    await expect(page.locator("h1")).toHaveText(new RegExp(`^${longDate(today)}$`, "i"));
    await page.getByRole("button", { name: "+ Nueva reserva" }).click();
    const form = page.getByRole("form", { name: "Nueva reserva" });
    await form.getByLabel("Cancha").selectOption("padel-1");
    const options = form.getByLabel("Hora de inicio").locator("option");
    const texts = await options.allTextContents();
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t).toMatch(/^\d{1,2}:\d{2} [ap]\. m\.$/);
    // Hoy no se ofrece ninguna hora que ya empezó: la primera es el bloque siguiente.
    await expect(options.first()).toHaveText(time12(cur + 1));
    await expect(options.first()).toHaveAttribute("value", /^\d{2}:\d{2}$/);
    // En el tablero los bloques que ya iniciaron no son botones de nueva reserva.
    await expect(page.getByRole("button", { name: `Pádel 1 ${time12(cur)} libre: nueva reserva` })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Pádel 1 ${time12(cur + 1)} libre: nueva reserva` })).toBeVisible();
  } finally {
    const res = await admin.request.put("/api/admin/courts/padel-1", { data: original });
    expect(res.status(), await res.text()).toBe(200);
    await admin.close();
  }
});

test("CA-23 tablero de Reservas: filas por cancha, barras por estado, puntos en la tira y tarjeta con acciones", async ({ page, context, browser }) => {
  const day = dayOffset(-4); // día pasado: caben jugada, no se presentó y cancelada
  const future = dayOffset(12);
  const played = await seedPastBooking({
    courtId: "media-a", spaceIds: ["futbol-media-a"], daysAgo: 4, startSlot: 36, price: 50, guest: { name: "Invitado Jugada23", phone: "+507 6000 2301" },
  });
  const noShow = await seedPastBooking({
    courtId: "media-b", spaceIds: ["futbol-media-b"], daysAgo: 4, startSlot: 36, price: 50, guest: { name: "Invitado Ausente23", phone: "+507 6000 2302" },
  });
  const cancelled = await seedPastBooking({
    courtId: "basquet-1", spaceIds: ["basquet-1"], daysAgo: 4, startSlot: 38, price: 30, guest: { name: "Invitado Cancelado23", phone: "+507 6000 2303" },
  });
  // Futuras: un socio con descuento y una serie de socio (2 semanas).
  const member = await registerViaApi(context, "ca23");
  const socio = await bookViaApi(context.request, { courtId: "media-a", date: future, startTime: "20:00", durationMin: 60 });
  const ser = await context.request.post("/api/bookings/series", { data: { courtId: "padel-1", date: future, startTime: "19:00", durationMin: 60, weeks: 2 } });
  expect(ser.status(), await ser.text()).toBe(201);
  const serieBooking = ((await ser.json()) as { bookings: B[] }).bookings[0]!;

  await loginAdmin(context);
  expect((await context.request.post(`/api/admin/bookings/${noShow.id}/no-show`)).status()).toBe(200);
  expect((await context.request.post(`/api/admin/bookings/${cancelled.id}/cancel`)).status()).toBe(200);
  // calendar: cuenta no canceladas por día; cliente 403, sin sesión 401, rango > 62 días 400.
  const cal = await context.request.get(`/api/admin/bookings/calendar?from=${day}&to=${future}`);
  expect(cal.status()).toBe(200);
  const counts = new Map(((await cal.json()) as { date: string; count: number }[]).map((r) => [r.date, r.count]));
  expect(counts.get(day)).toBe(2);
  expect(counts.get(future)).toBe(2);
  expect((await context.request.get(`/api/admin/bookings/calendar?from=${day}&to=${addDays(day, 70)}`)).status()).toBe(400);
  const client = await newContext(browser);
  await registerViaApi(client, "ca23c");
  expect((await client.request.get(`/api/admin/bookings/calendar?from=${day}&to=${future}`)).status()).toBe(403);
  const anon = await newContext(browser);
  expect((await anon.request.get(`/api/admin/bookings/calendar?from=${day}&to=${future}`)).status()).toBe(401);
  await client.close();
  await anon.close();

  // --- Día pasado: jugada, no se presentó y cancelada ---
  await page.goto(`/admin?fecha=${day}`);
  await expect(page.getByRole("tab", { name: "Reservas" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("h1")).toHaveText(new RegExp(`^${longDate(day)}$`, "i"));
  const board = page.getByRole("region", { name: "Tablero de canchas y horarios" });
  // Una fila por cancha activa.
  for (const name of ["Fútbol · Media A", "Fútbol · Media B", "Fútbol · Completa", "Pádel 1", "Básquet 1"]) {
    await expect(board.getByRole("group", { name, exact: true })).toBeVisible();
  }
  // Dos barras (la cancelada no ocupa bloques), cada una con su estado, nombre corto y hora en 12 h.
  await expect(board.locator(".bbar")).toHaveCount(2);
  const playedBar = board.locator(`[data-booking="${played.id}"]`);
  const noShowBar = board.locator(`[data-booking="${noShow.id}"]`);
  await expect(playedBar).toHaveAccessibleName("Invitado Jugada23, Fútbol · Media A, 6:00 p. m. a 7:00 p. m., Jugada, Por cobrar");
  await expect(playedBar).toHaveClass(/tone-played/);
  await expect(playedBar).toContainText("Invitado J.");
  await expect(noShowBar).toHaveAccessibleName("Invitado Ausente23, Fútbol · Media B, 6:00 p. m. a 7:00 p. m., No se presentó, No aplica");
  await expect(noShowBar).toHaveClass(/tone-noshow/);
  // La cancelada se lista aparte y abre la misma tarjeta, sin acciones.
  await expect(page.getByRole("heading", { name: /Canceladas este día/ })).toBeVisible();
  await expect(board.locator(`[data-booking="${cancelled.id}"]`)).toHaveCount(0);
  await page.locator(`.cancel-item[data-booking="${cancelled.id}"]`).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Invitado Cancelado23");
  await expect(dialog).toContainText("Cancelada");
  for (const name of ["Cobrar", "No se presentó", "Cancelar"]) await expect(dialog.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Tarjeta (clic) de la jugada: contenido y acciones.
  await playedBar.click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Invitado Jugada23" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "+507 6000 2301" })).toHaveAttribute("href", "tel:+50760002301");
  await expect(dialog).toContainText("Invitado");
  await expect(dialog).toContainText(new RegExp(longDate(day), "i"));
  await expect(dialog).toContainText("6:00 p. m. – 7:00 p. m.");
  await expect(dialog).toContainText("Fútbol · Media A");
  await expect(dialog).toContainText("$50");
  await expect(dialog).toContainText("Pendiente · por cobrar");
  await expect(dialog).toContainText("Terminó");
  await expect(dialog.getByRole("button", { name: "Cobrar $50" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "No se presentó" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancelar", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancelar las próximas de la serie" })).toHaveCount(0);
  // Esc cierra y devuelve el foco a la barra (el cursor se aparta: encima de la barra la vista previa por cursor es legítima).
  await page.mouse.move(0, 0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(playedBar).toBeFocused();
  // La que no se presentó: estado, sin cobrar.
  await noShowBar.click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("No se presentó");
  await expect(dialog.getByRole("button", { name: /^Cobrar/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "No se presentó" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Puntos en la tira: el día con 2 reservas lo marca, uno sin reservas no.
  const dayBtn = page.locator(`.daystrip .day[data-day="${day}"]`);
  await expect(dayBtn).toHaveAttribute("aria-label", new RegExp(`2 reservas$`));
  await expect(dayBtn.locator(".day-dot")).toHaveClass(/has/);
  await expect(page.locator(`.daystrip .day[data-day="${addDays(day, -5)}"] .day-dot`)).not.toHaveClass(/has/);

  // --- Día futuro: socio con descuento y serie ---
  await page.locator(`.daystrip .day[data-day="${future}"]`).click();
  await expect(page).toHaveURL(new RegExp(`fecha=${future}`));
  await expect(board.locator(".bbar")).toHaveCount(2);
  const socioBar = board.locator(`[data-booking="${socio.id}"]`);
  await expect(socioBar).toHaveAccessibleName(`${member.name}, Fútbol · Media A, 8:00 p. m. a 9:00 p. m., Confirmada, No aplica`);
  await socioBar.hover();
  dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible(); // vista previa por cursor
  await expect(dialog).toContainText("Socio −10 %");
  await expect(dialog).toContainText("$45");
  await expect(dialog.locator("s")).toHaveText("$50");
  await expect(dialog).toContainText("Por jugar");
  await expect(dialog).toContainText("Pendiente · se cobra al terminar");
  await expect(dialog.getByRole("button", { name: /^Cobrar/ })).toHaveCount(0); // aún no se juega
  await expect(dialog.getByRole("button", { name: "Cancelar", exact: true })).toBeVisible();
  // La serie: chip y acción de serie.
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  const serieBar = board.locator(`[data-booking="${serieBooking.id}"]`);
  await serieBar.focus(); // vista previa por teclado
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Serie semanal");
  await expect(dialog).toContainText("$18");
  await expect(dialog.getByRole("button", { name: "Cancelar las próximas de la serie" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeFocused();
  await page.keyboard.press("Escape");

  // Bloque libre → «Nueva reserva» prellenada con cancha y hora.
  await page.getByRole("button", { name: "Pádel 1 8:00 p. m. libre: nueva reserva" }).click();
  const form = page.getByRole("form", { name: "Nueva reserva" });
  await expect(form.getByLabel("Cancha")).toHaveValue("padel-1");
  await expect(form.getByLabel("Hora de inicio")).toHaveValue("20:00");
  await expect(form.getByLabel("Fecha")).toHaveValue(future);

  // Cancelar desde la tarjeta libera el horario y actualiza el punto/las barras.
  await socioBar.click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(page.getByText(`Reserva de ${member.name} cancelada. El horario quedó libre.`)).toBeVisible();
  await expect(board.locator(".bbar")).toHaveCount(1);
  await expect(page.locator(`.daystrip .day[data-day="${future}"]`)).toHaveAttribute("aria-label", /1 reserva$/);
  // «Cancelar las próximas de la serie» desde la tarjeta cancela las 2 ocurrencias.
  await serieBar.click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar las próximas de la serie" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(page.getByText("Cancelaste 2 reservas de la serie. Los horarios quedaron libres.")).toBeVisible();
  await expect(board.locator(".bbar")).toHaveCount(0);

  // 390 px: sin desbordar la página; el tablero se desplaza dentro de su caja y el toque abre la hoja inferior.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/admin?fecha=${day}`);
  await expect(board.locator(".bbar")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await board.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await playedBar.click();
  await expect(page.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
});

test("CA-24 tablero de pagos: indicadores del rango, desglose por método con Yappy y misma cifra que la API", async ({ page, context, browser }) => {
  const day = dayOffset(-6);
  const mk = (courtId: string, spaceIds: string[], startSlot: number, price: number, name: string, durationMin: 60 | 90 = 60) =>
    seedPastBooking({ courtId, spaceIds, daysAgo: 6, startSlot, durationMin, price, guest: { name, phone: "+507 6000 2400" } });
  const efectivo = await mk("media-a", ["futbol-media-a"], 36, 50, "Pago Efectivo24");
  const transf = await mk("media-b", ["futbol-media-b"], 36, 75, "Pago Transfer24", 90);
  const tarjeta = await mk("padel-1", ["padel-1"], 36, 20, "Pago Tarjeta24");
  const yappy = await mk("basquet-1", ["basquet-1"], 36, 45, "Pago Yappy24", 90);
  const porCobrar = await mk("basquet-1", ["basquet-1"], 40, 30, "Pendiente24");
  const ausente = await mk("media-a", ["futbol-media-a"], 40, 50, "Ausente24");
  const cancelada = await mk("padel-1", ["padel-1"], 40, 20, "Cancelada24");

  await loginAdmin(context);
  const pay = (id: string, amount: number, method: string) => context.request.post(`/api/admin/bookings/${id}/payment`, { data: { amount, method } });
  expect((await pay(efectivo.id, 50, "efectivo")).status()).toBe(200);
  expect((await pay(transf.id, 75, "transferencia")).status()).toBe(200);
  expect((await pay(tarjeta.id, 20, "tarjeta")).status()).toBe(200);
  expect((await pay(porCobrar.id, 30, "paypal")).status()).toBe(400); // método distinto de los cuatro
  expect((await context.request.post(`/api/admin/bookings/${ausente.id}/no-show`)).status()).toBe(200);
  expect((await context.request.post(`/api/admin/bookings/${cancelada.id}/cancel`)).status()).toBe(200);

  // El cobro por Yappy se hace desde la tarjeta del tablero.
  await page.goto(`/admin?fecha=${day}`);
  await page.locator(`[data-booking="${yappy.id}"]`).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cobrar $45" }).click();
  await expect(dialog.getByLabel("Monto cobrado ($)")).toHaveValue("45");
  await expect(dialog.getByRole("radio")).toHaveCount(4);
  await dialog.getByText("Yappy", { exact: true }).click({ force: true });
  await dialog.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.getByText("Pago registrado: $45 en Yappy · Pago Yappy24.")).toBeVisible();

  // API: summary del día.
  const res = await context.request.get(`/api/admin/payments/summary?from=${day}&to=${day}`);
  expect(res.status(), await res.text()).toBe(200);
  const s = (await res.json()) as {
    collected: number; pending: number; pendingCount: number; bookings: number; cancelled: number; noShow: number; occupancyPct: number;
    byMethod: Record<string, number>; byDay: { date: string; collected: number }[];
  };
  expect(s).toMatchObject({ collected: 190, pending: 30, pendingCount: 1, bookings: 6, cancelled: 1, noShow: 1 });
  expect(s.byMethod).toEqual({ efectivo: 50, transferencia: 75, tarjeta: 20, yappy: 45 });
  expect(s.byDay).toEqual([{ date: day, collected: 190 }]);
  expect(s.occupancyPct).toBeGreaterThan(0);
  // Solo el admin: cliente 403, sin sesión 401.
  const client = await newContext(browser);
  await registerViaApi(client, "ca24");
  expect((await client.request.get(`/api/admin/payments/summary?from=${day}&to=${day}`)).status()).toBe(403);
  const anon = await newContext(browser);
  expect((await anon.request.get(`/api/admin/payments/summary?from=${day}&to=${day}`)).status()).toBe(401);
  await client.close();
  await anon.close();

  // Pestaña Pagos: misma página (sin recarga), `?vista=pagos`, rango Día.
  await page.evaluate(() => ((window as unknown as { __marca: number }).__marca = 1));
  await page.getByRole("tab", { name: "Pagos" }).click();
  await expect(page).toHaveURL(/vista=pagos/);
  await expect(page.getByRole("tab", { name: "Pagos" })).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => (window as unknown as { __marca?: number }).__marca)).toBe(1);
  await page.getByRole("radio", { name: "Día", exact: true }).click();
  await expect(page.getByTestId("kpi-cobrado")).toHaveText("$190");
  await expect(page.getByTestId("kpi-por-cobrar")).toHaveText("$30");
  await expect(page.getByTestId("kpi-reservas")).toHaveText("6");
  await expect(page.getByTestId("kpi-noshow")).toHaveText("1");
  await expect(page.getByTestId("kpi-ocupacion")).toContainText("%");
  const methods = page.getByTestId("por-metodo");
  for (const [name, amount] of [["Efectivo", "$50"], ["Transferencia", "$75"], ["Tarjeta", "$20"], ["Yappy", "$45"]] as const) {
    await expect(methods.getByRole("listitem").filter({ hasText: name })).toContainText(amount);
  }
  // Yappy 45/190 = 23,7 %; la lista va ordenada por monto.
  await expect(methods.getByRole("listitem").first()).toContainText("Transferencia");
  // Las barras se colorean por pago: 4 pagadas, 1 por cobrar, 1 no aplica (la cancelada no ocupa bloques).
  const board = page.getByRole("region", { name: "Tablero de canchas y horarios" });
  await expect(board.locator(".bbar.pay-paid")).toHaveCount(4);
  await expect(board.locator(".bbar.pay-due")).toHaveCount(1);
  await expect(board.locator(".bbar.pay-na")).toHaveCount(1);
  await expect(board.locator(`[data-booking="${yappy.id}"]`)).toContainText("$45 · Yappy");
  // Tarjeta de una pagada: método y monto.
  await board.locator(`[data-booking="${yappy.id}"]`).click();
  await expect(page.getByRole("dialog")).toContainText("Pagado $45 · Yappy");
  await page.keyboard.press("Escape");
  // El rango Semana incluye este día: su cobrado es al menos lo de este día y coincide con la API de la semana.
  await page.getByRole("radio", { name: "Semana", exact: true }).click();
  const week = await context.request.get(`/api/admin/payments/summary?from=${addDays(day, -((new Date(`${day}T00:00`).getDay() + 6) % 7))}&to=${addDays(day, 6 - ((new Date(`${day}T00:00`).getDay() + 6) % 7))}`);
  const wk = (await week.json()) as { collected: number };
  await expect(page.getByTestId("kpi-cobrado")).toHaveText(`$${wk.collected}`);
  expect(wk.collected).toBeGreaterThanOrEqual(190);
  // `/admin/pagos` redirige al tablero con la pestaña.
  await page.goto("/admin/pagos");
  await expect(page).toHaveURL(/\/admin\?vista=pagos/);
  await expect(page.getByRole("tab", { name: "Pagos" })).toHaveAttribute("aria-selected", "true");
  // 390 px: los indicadores se apilan sin desbordar.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/admin?vista=pagos&fecha=${day}&rango=dia`);
  await expect(page.getByTestId("kpi-cobrado")).toHaveText("$190");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("CA-25 el admin configura el % de socios: validaciones, permisos y solo afecta a reservas nuevas", async ({ page, context, browser }) => {
  const date = dayOffset(8);
  const admin = await loginAdminCtx(browser);
  const member = await newContext(browser);
  await registerViaApi(member, "ca25");
  const anon = await newContext(browser);
  try {
    expect(await publicLoyalty(anon.request)).toBe(10);
    const before = await member.request.post("/api/bookings", { data: { courtId: "media-b", date, startTime: "21:00", durationMin: 60 } });
    expect(await before.json()).toMatchObject({ basePrice: 50, discountPct: 10, price: 45 });
    const beforeId = ((await before.json()) as B).id;

    // 15 → 200 y el GET público lo devuelve.
    const put = await setLoyalty(admin.request, 15);
    expect(put.status()).toBe(200);
    expect(await put.json()).toEqual({ discountPct: 15 });
    expect(await publicLoyalty(anon.request)).toBe(15);
    expect(((await (await admin.request.get("/api/admin/settings/loyalty")).json()) as { discountPct: number }).discountPct).toBe(15);
    // Fuera de rango o no entero → 400 y el valor no cambia.
    for (const v of [51, -1, 10.5, "diez"]) {
      expect((await setLoyalty(admin.request, v)).status(), `valor ${v}`).toBe(400);
      expect(await publicLoyalty(anon.request)).toBe(15);
    }
    // Los extremos 0 y 50 son válidos.
    for (const v of [0, 50]) {
      expect((await setLoyalty(admin.request, v)).status()).toBe(200);
      expect(await publicLoyalty(anon.request)).toBe(v);
    }
    // Permisos.
    expect((await setLoyalty(member.request, 20)).status()).toBe(403);
    expect((await setLoyalty(anon.request, 20)).status()).toBe(401);
    expect((await member.request.get("/api/admin/settings/loyalty")).status()).toBe(403);
    expect((await anon.request.get("/api/admin/settings/loyalty")).status()).toBe(401);
    expect(await publicLoyalty(anon.request)).toBe(50);

    // Desde el backoffice: la tarjeta del tablero de Pagos guarda el 20 %.
    await loginAdmin(context);
    await page.goto("/admin?vista=pagos");
    const input = page.getByLabel("Descuento de socios (%)");
    await expect(input).toHaveValue("50");
    await input.fill("51");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Escribe un número entero entre 0 y 50.")).toBeVisible();
    expect(await publicLoyalty(anon.request)).toBe(50);
    await input.fill("20");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Guardado: los socios pagan 20 % menos en las reservas nuevas.")).toBeVisible();
    expect(await publicLoyalty(anon.request)).toBe(20);

    // Solo las reservas nuevas usan el 20 %: la anterior conserva 10 %; sin sesión sigue en 0 %.
    const after = await member.request.post("/api/bookings", { data: { courtId: "media-b", date, startTime: "22:00", durationMin: 60 } });
    expect(await after.json()).toMatchObject({ basePrice: 50, discountPct: 20, price: 40 });
    const guest = await anon.request.post("/api/bookings", { data: { courtId: "media-a", date, startTime: "22:00", durationMin: 60, guest: GUEST } });
    expect(await guest.json()).toMatchObject({ basePrice: 50, discountPct: 0, price: 50 });
    const mine = (await (await member.request.get("/api/bookings/mine")).json()) as B[];
    expect(mine.find((b) => b.id === beforeId)).toMatchObject({ discountPct: 10, price: 45 });
    // El admin las ve así en el tablero.
    const list = await adminBookings(admin.request, date);
    expect(list.find((b) => b.id === beforeId)).toMatchObject({ discountPct: 10, price: 45 });
    // La web de un socio muestra el 20 % vigente.
    const sp = await member.newPage();
    await sp.goto(gridUrl(date));
    await freeCell(sp, "Pádel 1", "6:00 p. m.").click();
    await expect(sp.getByTestId("socio-descuento")).toHaveText("Socio: −20 %");
    await expect(sp.getByTestId("precio-base")).toHaveText("$20");
    await expect(sp.getByTestId("precio-final")).toHaveText("$16");
  } finally {
    const res = await setLoyalty(admin.request, 10);
    expect(res.status()).toBe(200);
    await admin.close();
    await member.close();
    await anon.close();
  }
});
