import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { makeTestApp } from "../helpers/app";

let t: Awaited<ReturnType<typeof makeTestApp>>;
let ana: string;
let admin: string;
beforeAll(async () => {
  t = await makeTestApp();
  ana = (await t.register("ana@x.com", "Ana Pérez")).cookie;
  admin = await t.loginAdmin();
});
afterAll(async () => {
  await t.drop();
});

// DEFAULT_NOW = jueves 2026-11-19 10:00; horizonte = 2026-12-19
const body = (extra: object = {}) => ({ courtId: "media-a", date: "2026-11-20", startTime: "16:00", durationMin: 60, ...extra });
const guest = { name: "Luis Soto", phone: "+507 6000 1234" };

describe("CR-02 RN-15 reserva sin cuenta", () => {
  test("sin sesión con guest: 201, guest, createdBy client, sin descuento", async () => {
    const r = await t.call("POST", "/api/bookings", { body: body({ guest }) });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ guest, createdBy: "client", price: 50, basePrice: 50, discountPct: 0, status: "confirmada" });
    expect(r.json.user).toBeUndefined();
    expect(await t.db.collection("bookings").countDocuments({ userId: { $exists: true }, guest: { $exists: true } })).toBe(0);
  });

  test("sin sesión sin guest o guest inválido: 400 con fields y nada creado", async () => {
    const before = await t.db.collection("bookings").countDocuments();
    const a = await t.call("POST", "/api/bookings", { body: body({ startTime: "18:00" }) });
    expect(a.status).toBe(400);
    expect(a.json.fields["guest.name"]).toBeTruthy();
    expect(a.json.fields["guest.phone"]).toBeTruthy();
    const b = await t.call("POST", "/api/bookings", { body: body({ startTime: "18:00", guest: { name: "L", phone: "abc" } }) });
    expect(b.status).toBe(400);
    expect(b.json.fields["guest.name"]).toBeTruthy();
    expect(b.json.fields["guest.phone"]).toBeTruthy();
    expect(await t.db.collection("bookings").countDocuments()).toBe(before);
  });

  test("con sesión de cliente se ignora guest y se usa el usuario", async () => {
    const r = await t.call("POST", "/api/bookings", { cookie: ana, body: body({ startTime: "18:00", guest }) });
    expect(r.status).toBe(201);
    expect(r.json.user.name).toBe("Ana Pérez");
    expect(r.json.guest).toBeUndefined();
  });

  test("con sesión de cliente no hace falta guest; sesión admin cuenta como sin sesión", async () => {
    expect((await t.call("POST", "/api/bookings", { cookie: ana, body: body({ startTime: "19:00" }) })).status).toBe(201);
    expect((await t.call("POST", "/api/bookings", { cookie: admin, body: body({ startTime: "20:00" }) })).status).toBe(400);
    const r = await t.call("POST", "/api/bookings", { cookie: admin, body: body({ startTime: "20:00", guest }) });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ guest, discountPct: 0, price: 50 });
  });

  test("serie sin sesión: guest obligatorio (400) y con guest 201 sin descuento", async () => {
    const s = { courtId: "padel-1", date: "2026-11-21", startTime: "10:00", durationMin: 60, weeks: 2 };
    expect((await t.call("POST", "/api/bookings/series", { body: s })).status).toBe(400);
    const r = await t.call("POST", "/api/bookings/series", { body: { ...s, guest } });
    expect(r.status).toBe(201);
    for (const b of r.json.bookings) expect(b).toMatchObject({ guest, price: 20, basePrice: 20, discountPct: 0 });
  });

  test("mine y cancelar siguen exigiendo sesión (401)", async () => {
    expect((await t.call("GET", "/api/bookings/mine")).status).toBe(401);
    expect((await t.call("POST", "/api/bookings/x/cancel")).status).toBe(401);
  });
});

describe("CR-02 RN-16 fidelidad", () => {
  test("GET público devuelve 10 por defecto", async () => {
    const r = await t.call("GET", "/api/settings/loyalty");
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ discountPct: 10 });
  });

  test("con sesión: Media A 60 min, 10 % -> price 45, basePrice 50; cambiar % no altera previas", async () => {
    const a = await t.call("POST", "/api/bookings", { cookie: ana, body: body({ date: "2026-11-23", startTime: "16:00" }) });
    expect(a.json).toMatchObject({ price: 45, basePrice: 50, discountPct: 10 });
    expect((await t.call("PUT", "/api/admin/settings/loyalty", { cookie: admin, body: { discountPct: 25 } })).json).toEqual({ discountPct: 25 });
    expect((await t.call("GET", "/api/settings/loyalty")).json).toEqual({ discountPct: 25 });
    const b = await t.call("POST", "/api/bookings", { cookie: ana, body: body({ date: "2026-11-23", startTime: "18:00" }) });
    expect(b.json).toMatchObject({ price: 37.5, basePrice: 50, discountPct: 25 });
    const mine = (await t.call("GET", "/api/bookings/mine", { cookie: ana })).json;
    expect(mine.find((x: any) => x.id === a.json.id)).toMatchObject({ price: 45, discountPct: 10 });
    const stored = await t.db.collection("bookings").findOne({ _id: a.json.id as never });
    expect(stored).toMatchObject({ price: 45, basePrice: 50, discountPct: 10 });
    await t.call("PUT", "/api/admin/settings/loyalty", { cookie: admin, body: { discountPct: 10 } });
  });

  test("redondeo a 2 decimales y serie con descuento por ocurrencia", async () => {
    await t.call("PUT", "/api/admin/settings/loyalty", { cookie: admin, body: { discountPct: 33 } });
    const r = await t.call("POST", "/api/bookings/series", {
      cookie: ana,
      body: { courtId: "padel-1", date: "2026-11-24", startTime: "17:00", durationMin: 90, weeks: 2 },
    });
    expect(r.status).toBe(201);
    for (const b of r.json.bookings) expect(b).toMatchObject({ basePrice: 30, discountPct: 33, price: 20.1 });
    await t.call("PUT", "/api/admin/settings/loyalty", { cookie: admin, body: { discountPct: 10 } });
  });

  test("las reservas del admin no llevan descuento", async () => {
    const r = await t.call("POST", "/api/admin/bookings", { cookie: admin, body: body({ date: "2026-11-25", guest }) });
    expect(r.json).toMatchObject({ price: 50, basePrice: 50, discountPct: 0 });
  });

  test("reservas antiguas sin basePrice se leen con basePrice = price y discountPct 0", async () => {
    const r = await t.call("POST", "/api/bookings", { body: body({ date: "2026-11-26", guest }) });
    await t.db.collection("bookings").updateOne({ _id: r.json.id as never }, { $unset: { basePrice: "", discountPct: "" } });
    const list = (await t.call("GET", "/api/admin/bookings?date=2026-11-26", { cookie: admin })).json;
    expect(list[0]).toMatchObject({ price: 50, basePrice: 50, discountPct: 0 });
  });

  test("PUT valida 0..50 entero (400)", async () => {
    for (const discountPct of [-1, 51, 10.5, "10", null]) {
      expect((await t.call("PUT", "/api/admin/settings/loyalty", { cookie: admin, body: { discountPct } })).status).toBe(400);
    }
    expect((await t.call("PUT", "/api/admin/settings/loyalty", { cookie: admin, body: { discountPct: 0 } })).status).toBe(200);
    await t.call("PUT", "/api/admin/settings/loyalty", { cookie: admin, body: { discountPct: 10 } });
  });

  test("admin GET settings; admin-only (401/403)", async () => {
    expect((await t.call("GET", "/api/admin/settings/loyalty", { cookie: admin })).json).toEqual({ discountPct: 10 });
    for (const [m, p, b] of [
      ["GET", "/api/admin/settings/loyalty"],
      ["PUT", "/api/admin/settings/loyalty", { discountPct: 5 }],
      ["GET", "/api/admin/bookings/calendar?from=2026-11-01&to=2026-11-30"],
      ["GET", "/api/admin/payments/summary?from=2026-11-01&to=2026-11-30"],
    ] as const) {
      expect((await t.call(m, p, { cookie: ana, body: b })).status).toBe(403);
      expect((await t.call(m, p, { body: b })).status).toBe(401);
    }
  });
});

describe("CR-02 RN-14 horizonte de 30 días", () => {
  test("hoy+30 se acepta; hoy+31 -> 422", async () => {
    const ok = await t.call("POST", "/api/bookings", { body: body({ date: "2026-12-19", guest }) });
    expect(ok.status).toBe(201);
    const r = await t.call("POST", "/api/bookings", { body: body({ date: "2026-12-20", guest }) });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe("Solo se puede reservar hasta 30 días de anticipación.");
    expect((await t.call("POST", "/api/bookings", { cookie: ana, body: body({ date: "2026-12-20" }) })).status).toBe(422);
  });

  test("serie: nombra la fecha de la primera ocurrencia fuera de horizonte y no crea nada", async () => {
    const before = await t.db.collection("bookings").countDocuments();
    const r = await t.call("POST", "/api/bookings/series", {
      cookie: ana,
      body: { courtId: "basquet-1", date: "2026-12-05", startTime: "18:00", durationMin: 60, weeks: 4 },
    });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe("Turno del 2026-12-26: Solo se puede reservar hasta 30 días de anticipación.");
    expect(await t.db.collection("bookings").countDocuments()).toBe(before);
  });

  test("también aplica a reservas y series del admin", async () => {
    const a = await t.call("POST", "/api/admin/bookings", { cookie: admin, body: body({ date: "2026-12-20", guest }) });
    expect(a.status).toBe(422);
    const s = await t.call("POST", "/api/admin/bookings/series", {
      cookie: admin,
      body: { courtId: "basquet-1", date: "2026-12-12", startTime: "18:00", durationMin: 60, weeks: 3, guest },
    });
    expect(s.status).toBe(422);
    expect(s.json.error).toContain("2026-12-26");
  });

  test("«hoy» es la fecha local de now (cerca de medianoche)", async () => {
    t.clock.now = new Date(2026, 10, 19, 23, 50, 0, 0);
    expect((await t.call("POST", "/api/bookings", { body: body({ courtId: "padel-1", date: "2026-12-19", startTime: "20:00", guest }) })).status).toBe(201);
    expect((await t.call("POST", "/api/bookings", { body: body({ courtId: "padel-1", date: "2026-12-20", startTime: "20:00", guest }) })).status).toBe(422);
    t.clock.now = new Date(2026, 10, 19, 10, 0, 0, 0);
  });
});

describe("CR-02 pago yappy", () => {
  test("yappy 200; método inválido 400", async () => {
    const b = await t.call("POST", "/api/bookings", { body: body({ courtId: "basquet-1", date: "2026-11-20", startTime: "21:00", guest }) });
    t.clock.now = new Date(2026, 10, 21, 10, 0, 0, 0);
    expect((await t.call("POST", `/api/admin/bookings/${b.json.id}/payment`, { cookie: admin, body: { amount: 30, method: "paypal" } })).status).toBe(400);
    const r = await t.call("POST", `/api/admin/bookings/${b.json.id}/payment`, { cookie: admin, body: { amount: 30, method: "yappy" } });
    expect(r.status).toBe(200);
    expect(r.json.payment).toMatchObject({ status: "pagado", method: "yappy", amount: 30 });
    t.clock.now = new Date(2026, 10, 19, 10, 0, 0, 0);
  });
});

describe("CR-02 calendar y summary (base limpia)", () => {
  let t2: Awaited<ReturnType<typeof makeTestApp>>;
  let adm: string;
  beforeAll(async () => {
    t2 = await makeTestApp();
    adm = await t2.loginAdmin();
    const mk = (courtId: string, date: string, startTime: string, durationMin = 60) =>
      t2.call("POST", "/api/bookings", { body: { courtId, date, startTime, durationMin, guest } });
    const a = await mk("media-a", "2026-11-20", "16:00"); // 50
    const b = await mk("media-b", "2026-11-20", "16:00"); // 50
    const c = await mk("padel-1", "2026-11-20", "17:00"); // 20
    const d = await mk("media-a", "2026-11-21", "10:00"); // 50
    const e = await mk("padel-1", "2026-11-22", "10:00"); // cancelada
    await mk("basquet-1", "2026-11-22", "10:00"); // futura (no jugada, no cuenta como por cobrar)
    await mk("padel-1", "2026-11-21", "18:00"); // jugada sin cobrar -> por cobrar (20)
    await t2.call("POST", `/api/admin/bookings/${e.json.id}/cancel`, { cookie: adm });
    t2.clock.now = new Date(2026, 10, 22, 8, 0, 0, 0);
    await t2.call("POST", `/api/admin/bookings/${a.json.id}/payment`, { cookie: adm, body: { amount: 50, method: "efectivo" } });
    await t2.call("POST", `/api/admin/bookings/${b.json.id}/payment`, { cookie: adm, body: { amount: 45, method: "yappy" } });
    await t2.call("POST", `/api/admin/bookings/${c.json.id}/payment`, { cookie: adm, body: { amount: 20, method: "tarjeta" } });
    await t2.call("POST", `/api/admin/bookings/${d.json.id}/no-show`, { cookie: adm });
    await mk("completa", "2026-11-23", "10:00", 120); // futura
  });
  afterAll(async () => {
    await t2.drop();
  });

  test("calendar cuenta no canceladas por día, ascendente", async () => {
    const r = await t2.call("GET", "/api/admin/bookings/calendar?from=2026-11-19&to=2026-11-30", { cookie: adm });
    expect(r.status).toBe(200);
    expect(r.json).toEqual([
      { date: "2026-11-20", count: 3 },
      { date: "2026-11-21", count: 2 },
      { date: "2026-11-22", count: 1 },
      { date: "2026-11-23", count: 1 },
    ]);
  });

  test("calendar/summary validan from/to: faltan, inválidas, from>to, rango > 62 días -> 400", async () => {
    for (const path of ["/api/admin/bookings/calendar", "/api/admin/payments/summary"]) {
      for (const q of ["", "?from=2026-11-01", "?from=2026-13-01&to=2026-11-02", "?from=2026-11-05&to=2026-11-01", "?from=2026-01-01&to=2026-03-10"]) {
        expect((await t2.call("GET", path + q, { cookie: adm })).status).toBe(400);
      }
      expect((await t2.call("GET", `${path}?from=2026-01-01&to=2026-03-04`, { cookie: adm })).status).toBe(200); // 62 días
    }
  });

  test("summary: cobrado por método y por día, pendientes, conteos y ocupación", async () => {
    const r = await t2.call("GET", "/api/admin/payments/summary?from=2026-11-20&to=2026-11-22", { cookie: adm });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      collected: 115,
      pending: 20,
      pendingCount: 1,
      bookings: 6,
      cancelled: 1,
      noShow: 1,
      byMethod: { efectivo: 50, transferencia: 0, tarjeta: 20, yappy: 45 },
      byDay: [{ date: "2026-11-20", collected: 115 }],
    });
    // 12 bloques reservados (6 reservas × 2) / (14 + 30 + 30) bloques abiertos × 5 canchas = 12/370
    expect(r.json.occupancyPct).toBeCloseTo(3.2, 1);
    expect((await t2.call("GET", "/api/admin/payments/summary?from=2026-12-01&to=2026-12-02", { cookie: adm })).json).toMatchObject({
      collected: 0, pending: 0, pendingCount: 0, bookings: 0, byMethod: { efectivo: 0, transferencia: 0, tarjeta: 0, yappy: 0 }, byDay: [], occupancyPct: 0,
    });
  });
});
