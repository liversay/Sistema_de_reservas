import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { makeTestApp } from "../helpers/app";

let t: Awaited<ReturnType<typeof makeTestApp>>;
let ana: string;
let beto: string;
let admin: string;
beforeAll(async () => {
  t = await makeTestApp();
  ana = (await t.register("ana@x.com", "Ana Pérez")).cookie;
  beto = (await t.register("beto@x.com", "Beto Gómez")).cookie;
  admin = await t.loginAdmin();
});
afterAll(async () => {
  await t.drop();
});

// DEFAULT_NOW = jueves 2026-11-19 10:00
const series = (extra: object = {}) => ({
  courtId: "media-a",
  date: "2026-11-26",
  startTime: "18:00",
  durationMin: 60,
  weeks: 4,
  ...extra,
});
const count = (filter: object = {}) => t.db.collection("bookings").countDocuments(filter);

describe("CR-01 crear serie (CA-15)", () => {
  test("4 semanas: 201, 4 reservas con el mismo seriesId, fechas +7, precio por ocurrencia, sin paidBy", async () => {
    const r = await t.call("POST", "/api/bookings/series", { cookie: ana, body: series() });
    expect(r.status).toBe(201);
    expect(r.json.seriesId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.json.bookings.map((b: any) => b.date)).toEqual(["2026-11-26", "2026-12-03", "2026-12-10", "2026-12-17"]);
    for (const b of r.json.bookings) {
      expect(b).toMatchObject({ seriesId: r.json.seriesId, price: 50, status: "confirmada", createdBy: "client", user: { name: "Ana Pérez" } });
      expect(b.payment.paidBy).toBeUndefined();
    }
    expect(await count({ seriesId: r.json.seriesId })).toBe(4);
    expect(await t.db.collection("slot_locks").countDocuments({ bookingId: { $in: r.json.bookings.map((b: any) => b.id) } })).toBe(
      4 * 1 * 2, // 4 ocurrencias × 1 espacio (Media A) × 2 bloques
    );
  });

  test("400: weeks fuera de 2..8 o no entero, sin sesión 401", async () => {
    for (const weeks of [1, 9, 2.5, "4"]) {
      expect((await t.call("POST", "/api/bookings/series", { cookie: ana, body: series({ weeks, startTime: "20:00" }) })).status).toBe(400);
    }
    expect((await t.call("POST", "/api/bookings/series", { body: series() })).status).toBe(401);
    expect(await count({ startTime: "20:00" })).toBe(0);
  });

  test("404 cancha", async () => {
    expect((await t.call("POST", "/api/bookings/series", { cookie: ana, body: series({ courtId: "nada" }) })).status).toBe(404);
  });
});

describe("CR-01 todo-o-nada (CA-16, RN-12)", () => {
  test("una semana ocupada: 409 con esa fecha y 0 reservas nuevas", async () => {
    const blocker = await t.call("POST", "/api/bookings", { cookie: beto, body: { courtId: "media-a", date: "2026-12-10", startTime: "19:00", durationMin: 60 } });
    expect(blocker.status).toBe(201);
    const before = await count();
    const locksBefore = await t.db.collection("slot_locks").countDocuments();
    const r = await t.call("POST", "/api/bookings/series", { cookie: ana, body: series({ startTime: "19:00" }) });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("Ese horario ya fue tomado el 2026-12-10. Elige otro.");
    expect(await count()).toBe(before);
    expect(await t.db.collection("slot_locks").countDocuments()).toBe(locksBefore);
  });

  test("dos choques: nombra el primero en orden de fecha", async () => {
    for (const date of ["2026-12-17", "2026-12-03"]) {
      await t.call("POST", "/api/bookings", { cookie: beto, body: { courtId: "media-a", date, startTime: "21:00", durationMin: 60 } });
    }
    const r = await t.call("POST", "/api/bookings/series", { cookie: ana, body: series({ startTime: "21:00" }) });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("Ese horario ya fue tomado el 2026-12-03. Elige otro.");
  });

  test("mixto 422 + 409: gana el 422 y nombra su fecha", async () => {
    await t.call("POST", "/api/bookings", { cookie: beto, body: { courtId: "media-a", date: "2026-11-26", startTime: "16:00", durationMin: 60 } });
    // Aún no empezó hoy: solo choca la 2.ª fecha → 409 con esa fecha.
    const r409 = await t.call("POST", "/api/bookings/series", { cookie: ana, body: series({ date: "2026-11-19", startTime: "16:00" }) });
    expect(r409.status).toBe(409);
    expect(r409.json.error).toBe("Ese horario ya fue tomado el 2026-11-26. Elige otro.");
    // A las 17:00 la 1.ª (2026-11-19 16:00) ya empezó (422) y la 2.ª sigue chocando (409): responde 422.
    t.clock.now = new Date(2026, 10, 19, 17, 0);
    const r = await t.call("POST", "/api/bookings/series", { cookie: ana, body: series({ date: "2026-11-19", startTime: "16:00" }) });
    t.clock.now = new Date(2026, 10, 19, 10, 0);
    expect(r.status).toBe(422);
    expect(r.json.error).toContain("2026-11-19");
  });

  test("422 por cancha inactiva y fuera de horario nombran la fecha", async () => {
    const out = await t.call("POST", "/api/bookings/series", { cookie: ana, body: series({ startTime: "22:30", durationMin: 120 }) });
    expect(out.status).toBe(422);
    expect(out.json.error).toContain("2026-11-26");
    await t.db.collection<any>("courts").updateOne({ _id: "padel-1" }, { $set: { active: false } });
    const inactive = await t.call("POST", "/api/bookings/series", { cookie: ana, body: series({ courtId: "padel-1" }) });
    expect(inactive.status).toBe(422);
    await t.db.collection<any>("courts").updateOne({ _id: "padel-1" }, { $set: { active: true } });
  });

  test("422 por fecha posterior fuera de horario (cancha cerrada un día de la serie)", async () => {
    const court = await t.db.collection<any>("courts").findOne({ _id: "basquet-1" });
    const sched = court.schedule.map((d: any) => (d.weekday === 3 ? { ...d, closed: true } : d)); // jueves
    // Jueves cerrado: 2026-11-26 (1.ª ocurrencia) cae en jueves.
    await t.db.collection<any>("courts").updateOne({ _id: "basquet-1" }, { $set: { schedule: sched } });
    const r = await t.call("POST", "/api/bookings/series", { cookie: ana, body: series({ courtId: "basquet-1" }) });
    expect(r.status).toBe(422);
    expect(r.json.error).toContain("2026-11-26");
    await t.db.collection<any>("courts").updateOne({ _id: "basquet-1" }, { $set: { schedule: court.schedule } });
  });
});

describe("CR-01 concurrencia", () => {
  test("dos series solapadas a la vez: una gana con 4 reservas, la otra 409 con fecha y 0 reservas", async () => {
    const body = series({ courtId: "padel-1", startTime: "22:00" });
    const [a, b] = await Promise.all([
      t.call("POST", "/api/bookings/series", { cookie: ana, body }),
      t.call("POST", "/api/bookings/series", { cookie: beto, body }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.json.error).toMatch(/^Ese horario ya fue tomado el 2026-1[12]-\d\d\. Elige otro\.$/);
    expect(await count({ courtId: "padel-1", startSlot: 44 })).toBe(4);
  });
});

describe("CR-01 ocurrencias independientes (CA-17, RN-13)", () => {
  let seriesId: string;
  let ids: string[];
  beforeAll(async () => {
    const r = await t.call("POST", "/api/bookings/series", { cookie: ana, body: series({ courtId: "completa", startTime: "08:00", date: "2026-11-19" }) });
    // 08:00 entre semana queda fuera de horario (abre 16:00): 422 y no se crea nada

    expect(r.status).toBe(422);
    const ok = await t.call("POST", "/api/bookings/series", { cookie: ana, body: series({ courtId: "completa", startTime: "20:00", date: "2026-11-19" }) });
    expect(ok.status).toBe(201);
    seriesId = ok.json.seriesId;
    ids = ok.json.bookings.map((b: any) => b.id);
  });

  test("cancelar una ocurrencia deja las otras confirmadas", async () => {
    const r = await t.call("POST", `/api/bookings/${ids[1]}/cancel`, { cookie: ana });
    expect(r.status).toBe(200);
    expect(await count({ seriesId, status: "confirmada" })).toBe(3);
    expect(await count({ seriesId, status: "cancelada" })).toBe(1);
  });

  test("cada ocurrencia se cobra por separado", async () => {
    t.clock.now = new Date(2026, 10, 19, 21, 0); // terminó la 1.ª
    const p1 = await t.call("POST", `/api/admin/bookings/${ids[0]}/payment`, { cookie: admin, body: { amount: 100, method: "efectivo" } });
    expect(p1.status).toBe(200);
    expect(p1.json.payment.status).toBe("pagado");
    expect(await count({ seriesId, "payment.status": "pagado" })).toBe(1);
    expect(await count({ seriesId, "payment.status": "pendiente" })).toBe(3);
    t.clock.now = new Date(2026, 10, 19, 10, 0);
  });

  test("client cancel-future en serie ajena: 404; sin sesión 401; serie inexistente 404", async () => {
    expect((await t.call("POST", `/api/bookings/series/${seriesId}/cancel-future`, { cookie: beto })).status).toBe(404);
    expect((await t.call("POST", `/api/bookings/series/${seriesId}/cancel-future`)).status).toBe(401);
    expect((await t.call("POST", "/api/bookings/series/no-existe/cancel-future", { cookie: ana })).status).toBe(404);
    expect(await count({ seriesId, status: "confirmada" })).toBe(3);
  });

  test("cancel-future solo toca las confirmadas que no empezaron; repetir → 0", async () => {
    // 1.ª (2026-11-19) ya empezada, 2.ª cancelada; quedan 2026-12-03 y 2026-12-10 por cancelar
    t.clock.now = new Date(2026, 10, 19, 21, 0);
    const r = await t.call("POST", `/api/bookings/series/${seriesId}/cancel-future`, { cookie: ana });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ cancelled: 2 });
    const rows = await t.db.collection<any>("bookings").find({ seriesId }).sort({ date: 1 }).toArray();
    expect(rows.map((b) => b.status)).toEqual(["confirmada", "cancelada", "cancelada", "cancelada"]);
    expect(rows[0].payment.status).toBe("pagado");
    expect(await t.db.collection("slot_locks").countDocuments({ bookingId: { $in: rows.map((b) => b._id) } })).toBe(2 * 2 * 1); // solo la 1.ª conserva bloques
    const again = await t.call("POST", `/api/bookings/series/${seriesId}/cancel-future`, { cookie: ana });
    expect(again.json).toEqual({ cancelled: 0 });
    t.clock.now = new Date(2026, 10, 19, 10, 0);
  });

  test("admin cancel-future sobre serie de cliente; 404 si no existe", async () => {
    const s = await t.call("POST", "/api/bookings/series", { cookie: ana, body: series({ courtId: "padel-1", startTime: "18:00" }) });
    expect(s.status).toBe(201);
    const r = await t.call("POST", `/api/admin/bookings/series/${s.json.seriesId}/cancel-future`, { cookie: admin });
    expect(r.json).toEqual({ cancelled: 4 });
    expect((await t.call("POST", "/api/admin/bookings/series/nada/cancel-future", { cookie: admin })).status).toBe(404);
    expect((await t.call("POST", `/api/admin/bookings/series/${s.json.seriesId}/cancel-future`, { cookie: ana })).status).toBe(403);
  });
});

describe("CR-01 serie de admin (CA-18)", () => {
  test("201 con guest y createdBy admin, con played; 400 sin guest; 409 con fecha", async () => {
    const body = series({ courtId: "basquet-1", startTime: "17:00", guest: { name: "Luis Invitado", phone: "70011223" } });
    const r = await t.call("POST", "/api/admin/bookings/series", { cookie: admin, body });
    expect(r.status).toBe(201);
    expect(r.json.bookings).toHaveLength(4);
    expect(r.json.bookings[0]).toMatchObject({ createdBy: "admin", guest: { name: "Luis Invitado" }, seriesId: r.json.seriesId, played: false });
    const { guest: _g, ...noGuest } = body as any;
    expect((await t.call("POST", "/api/admin/bookings/series", { cookie: admin, body: noGuest })).status).toBe(400);
    const dup = await t.call("POST", "/api/admin/bookings/series", { cookie: admin, body });
    expect(dup.status).toBe(409);
    expect(dup.json.error).toBe("Ese horario ya fue tomado el 2026-11-26. Elige otro.");
    expect((await t.call("POST", "/api/admin/bookings/series", { cookie: ana, body })).status).toBe(403);
  });
});
