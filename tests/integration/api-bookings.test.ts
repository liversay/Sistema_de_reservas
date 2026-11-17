import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { makeTestApp } from "../helpers/app";

let t: Awaited<ReturnType<typeof makeTestApp>>;
let ana: string;
let beto: string;
beforeAll(async () => {
  t = await makeTestApp();
  ana = (await t.register("ana@x.com", "Ana Pérez")).cookie;
  beto = (await t.register("beto@x.com", "Beto Gómez")).cookie;
});
afterAll(async () => {
  await t.drop();
});
const body = (startTime: string, extra: object = {}) => ({ courtId: "media-a", date: "2026-11-20", startTime, durationMin: 60, ...extra });

describe("reservas de cliente", () => {
  test("reserva OK 201 con forma de recurso, y repetida 409 con mensaje exacto", async () => {
    const r = await t.call("POST", "/api/bookings", { cookie: ana, body: body("18:00") });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({
      courtId: "media-a",
      courtName: "Fútbol · Media A",
      date: "2026-11-20",
      startTime: "18:00",
      endTime: "19:00",
      durationMin: 60,
      price: 45, // CR-02: cliente con sesión, 10 % de socio sobre 50
      basePrice: 50,
      discountPct: 10,
      status: "confirmada",
      payment: { status: "pendiente" },
      createdBy: "client",
      user: { name: "Ana Pérez" },
    });
    expect(r.json.guest).toBeUndefined();
    expect(r.json.played).toBeUndefined();
    const dup = await t.call("POST", "/api/bookings", { cookie: beto, body: body("18:00") });
    expect(dup.status).toBe(409);
    expect(dup.json.error).toBe("Ese horario ya fue tomado. Elige otro.");
  });

  test("el cliente no puede forzar el precio; validación 400, 404 cancha, 422 reglas", async () => {
    const r = await t.call("POST", "/api/bookings", { cookie: ana, body: body("19:00", { price: 1 }) });
    expect(r.json.price).toBe(45); // 50 con 10 % de socio (CR-02); no el 1 enviado
    expect((await t.call("POST", "/api/bookings", { cookie: ana, body: body("19:15") })).status).toBe(400);
    expect((await t.call("POST", "/api/bookings", { cookie: ana, body: body("20:00", { durationMin: 45 }) })).status).toBe(400);
    expect((await t.call("POST", "/api/bookings", { cookie: ana, body: body("20:00", { courtId: "nada" }) })).status).toBe(404);
    expect((await t.call("POST", "/api/bookings", { cookie: ana, body: body("22:30", { durationMin: 120 }) })).status).toBe(422);
    expect((await t.call("POST", "/api/bookings", { cookie: ana, body: body("20:00", { date: "2026-11-19" }) })).status).toBe(201);
    expect((await t.call("POST", "/api/bookings", { cookie: ana, body: body("09:00", { date: "2026-11-19" }) })).status).toBe(422);
  });

  test("GET /mine solo las propias, orden descendente", async () => {
    const a = await t.call("GET", "/api/bookings/mine", { cookie: ana });
    expect(a.status).toBe(200);
    expect(a.json.every((b: any) => b.user.name === "Ana Pérez")).toBe(true);
    const keys = a.json.map((b: any) => `${b.date} ${b.startTime}`);
    expect(keys).toEqual([...keys].sort().reverse());
    const b = await t.call("GET", "/api/bookings/mine", { cookie: beto });
    expect(b.json).toHaveLength(0);
  });

  test("cancelar: ajena 404, propia 200 libera, repetida 409, empezada 422", async () => {
    const mine = (await t.call("POST", "/api/bookings", { cookie: ana, body: body("21:00") })).json;
    expect((await t.call("POST", `/api/bookings/${mine.id}/cancel`, { cookie: beto })).status).toBe(404);
    expect((await t.call("POST", "/api/bookings/inexistente/cancel", { cookie: ana })).status).toBe(404);
    const ok = await t.call("POST", `/api/bookings/${mine.id}/cancel`, { cookie: ana });
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe("cancelada");
    expect((await t.call("POST", `/api/bookings/${mine.id}/cancel`, { cookie: ana })).status).toBe(409);
    expect((await t.call("POST", "/api/bookings", { cookie: beto, body: body("21:00") })).status).toBe(201);

    const started = (await t.call("POST", "/api/bookings", { cookie: ana, body: body("22:00", { date: "2026-11-19" }) })).json;
    t.clock.now = new Date(2026, 10, 19, 22, 30);
    expect((await t.call("POST", `/api/bookings/${started.id}/cancel`, { cookie: ana })).status).toBe(422);
    t.clock.now = new Date(2026, 10, 19, 10, 0);
  });
});
