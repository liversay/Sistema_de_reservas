import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { makeTestApp } from "../helpers/app";

let t: Awaited<ReturnType<typeof makeTestApp>>;
let admin: string;
let client: string;
beforeAll(async () => {
  t = await makeTestApp();
  admin = await t.loginAdmin();
  client = (await t.register("ana@x.com", "Ana Pérez")).cookie;
});
afterAll(async () => {
  await t.drop();
});
const guestBody = (startTime: string, extra: object = {}) => ({
  courtId: "padel-1",
  date: "2026-11-19",
  startTime,
  durationMin: 60,
  guest: { name: "Juan Invitado", phone: "+591 71111111" },
  ...extra,
});
const NOON_PAST = () => (t.clock.now = new Date(2026, 10, 19, 10, 0));

describe("admin reservas", () => {
  test("crea reserva de invitado 201; sin guest 400; 404/409/422", async () => {
    const r = await t.call("POST", "/api/admin/bookings", { cookie: admin, body: guestBody("16:00") });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ createdBy: "admin", guest: { name: "Juan Invitado" }, played: false, status: "confirmada" });
    expect(r.json.user).toBeUndefined();
    const { guest, ...noGuest } = guestBody("17:00");
    expect((await t.call("POST", "/api/admin/bookings", { cookie: admin, body: noGuest })).status).toBe(400);
    expect((await t.call("POST", "/api/admin/bookings", { cookie: admin, body: guestBody("17:00", { guest: { name: "J", phone: "+591 71111111" } }) })).status).toBe(400);
    expect((await t.call("POST", "/api/admin/bookings", { cookie: admin, body: guestBody("17:00", { courtId: "xx" }) })).status).toBe(404);
    expect((await t.call("POST", "/api/admin/bookings", { cookie: admin, body: guestBody("16:00") })).status).toBe(409);
    expect((await t.call("POST", "/api/admin/bookings", { cookie: admin, body: guestBody("08:00") })).status).toBe(422);
    expect((await t.call("POST", "/api/admin/bookings", { cookie: client, body: guestBody("18:00") })).status).toBe(403);
  });

  test("GET del día con played, user y guest; fecha inválida 400", async () => {
    await t.call("POST", "/api/bookings", { cookie: client, body: { courtId: "media-a", date: "2026-11-19", startTime: "20:00", durationMin: 60 } });
    const r = await t.call("GET", "/api/admin/bookings?date=2026-11-19", { cookie: admin });
    expect(r.status).toBe(200);
    expect(r.json.length).toBeGreaterThanOrEqual(2);
    expect(r.json.every((b: any) => typeof b.played === "boolean")).toBe(true);
    expect(r.json.some((b: any) => b.user?.name === "Ana Pérez")).toBe(true);
    expect(r.json.some((b: any) => b.guest?.name === "Juan Invitado")).toBe(true);
    expect((await t.call("GET", "/api/admin/bookings?date=xx", { cookie: admin })).status).toBe(400);
    expect((await t.call("GET", "/api/admin/bookings", { cookie: admin })).status).toBe(400);
  });

  test("pago: antes de terminar 422, después 200, de nuevo 409; validación y 404", async () => {
    const b = (await t.call("POST", "/api/admin/bookings", { cookie: admin, body: guestBody("17:00") })).json;
    const pay = (id: string, body: unknown = { amount: 18, method: "efectivo" }) =>
      t.call("POST", `/api/admin/bookings/${id}/payment`, { cookie: admin, body });
    expect((await pay(b.id)).status).toBe(422);
    expect((await pay(b.id, { amount: 0, method: "efectivo" })).status).toBe(400);
    expect((await pay(b.id, { amount: 10, method: "bitcoin" })).status).toBe(400);
    expect((await pay("nope")).status).toBe(404);
    t.clock.now = new Date(2026, 10, 19, 18, 0);
    const ok = await pay(b.id);
    expect(ok.status).toBe(200);
    expect(ok.json.payment).toMatchObject({ status: "pagado", amount: 18, method: "efectivo" });
    expect(ok.json.payment.paidBy).toBeTruthy();
    expect(ok.json.payment.paidAt).toBeTruthy();
    expect(ok.json.played).toBe(true);
    expect((await pay(b.id)).status).toBe(409);
    NOON_PAST();
  });

  test("reserva pagada no puede pasar a no-show (409) y el cliente no ve paidBy", async () => {
    const b = (await t.call("POST", "/api/bookings", { cookie: client, body: { courtId: "completa", date: "2026-11-19", startTime: "16:00", durationMin: 60 } })).json;
    t.clock.now = new Date(2026, 10, 19, 17, 30);
    const pay = await t.call("POST", `/api/admin/bookings/${b.id}/payment`, { cookie: admin, body: { amount: 90, method: "efectivo" } });
    expect(pay.status).toBe(200);
    expect(pay.json.payment.paidBy).toBeTruthy();
    expect((await t.call("POST", `/api/admin/bookings/${b.id}/no-show`, { cookie: admin })).status).toBe(409);
    const mine = await t.call("GET", "/api/bookings/mine", { cookie: client });
    const row = mine.json.find((x: any) => x.id === b.id);
    expect(row.payment.status).toBe("pagado");
    expect(row.payment.paidBy).toBeUndefined();
    NOON_PAST();
  });

  test("no-show: 422 antes, 200 después, luego pagar 409; cancelada no terminada -> 409", async () => {
    const b = (await t.call("POST", "/api/admin/bookings", { cookie: admin, body: guestBody("19:00") })).json;
    const ns = (id: string) => t.call("POST", `/api/admin/bookings/${id}/no-show`, { cookie: admin });
    expect((await ns(b.id)).status).toBe(422);
    expect((await ns("nope")).status).toBe(404);
    t.clock.now = new Date(2026, 10, 19, 20, 30);
    const ok = await ns(b.id);
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe("no_show");
    expect((await t.call("POST", `/api/admin/bookings/${b.id}/payment`, { cookie: admin, body: { amount: 20, method: "tarjeta" } })).status).toBe(409);
    expect((await ns(b.id)).status).toBe(409);
    NOON_PAST();

    const c = (await t.call("POST", "/api/admin/bookings", { cookie: admin, body: guestBody("21:00") })).json;
    expect((await t.call("POST", `/api/admin/bookings/${c.id}/cancel`, { cookie: admin })).status).toBe(200);
    expect((await ns(c.id)).status).toBe(409);
    expect((await t.call("POST", `/api/admin/bookings/${c.id}/payment`, { cookie: admin, body: { amount: 20, method: "tarjeta" } })).status).toBe(409);
    expect((await t.call("POST", `/api/admin/bookings/${c.id}/cancel`, { cookie: admin })).status).toBe(409);
  });

  test("admin cancela una reserva ya empezada de cliente (RN-06)", async () => {
    const b = (await t.call("POST", "/api/bookings", { cookie: client, body: { courtId: "basquet-1", date: "2026-11-19", startTime: "16:00", durationMin: 60 } })).json;
    t.clock.now = new Date(2026, 10, 19, 16, 30);
    const r = await t.call("POST", `/api/admin/bookings/${b.id}/cancel`, { cookie: admin });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe("cancelada");
    expect((await t.call("POST", "/api/admin/bookings/nope/cancel", { cookie: admin })).status).toBe(404);
    NOON_PAST();
  });

  test("pagos pending/paid", async () => {
    const b = (await t.call("POST", "/api/admin/bookings", { cookie: admin, body: guestBody("22:00") })).json;
    const list = async (s: string) => t.call("GET", `/api/admin/payments?status=${s}`, { cookie: admin });
    expect((await t.call("GET", "/api/admin/payments", { cookie: admin })).status).toBe(400);
    expect((await t.call("GET", "/api/admin/payments?status=otro", { cookie: admin })).status).toBe(400);
    expect((await list("pending")).json.some((x: any) => x.id === b.id)).toBe(false);
    t.clock.now = new Date(2026, 10, 19, 23, 30);
    const pend = await list("pending");
    expect(pend.json.some((x: any) => x.id === b.id)).toBe(true);
    expect(pend.json.every((x: any) => x.played && x.status === "confirmada" && x.payment.status === "pendiente")).toBe(true);
    await t.call("POST", `/api/admin/bookings/${b.id}/payment`, { cookie: admin, body: { amount: 15, method: "transferencia" } });
    expect((await list("pending")).json.some((x: any) => x.id === b.id)).toBe(false);
    const paid = await list("paid");
    expect(paid.json.some((x: any) => x.id === b.id && x.payment.amount === 15)).toBe(true);
    NOON_PAST();
  });
});

const court = (extra: object = {}) => ({
  id: "padel-2",
  name: "Pádel 2",
  sport: "padel",
  spaceIds: ["padel-2"],
  active: true,
  prices: { "60": 20, "90": 30, "120": 40 },
  schedule: Array.from({ length: 7 }, (_, weekday) => ({ weekday, open: "10:00", close: "22:00", closed: false })),
  ...extra,
});

describe("admin canchas", () => {
  test("listar y obtener", async () => {
    const l = await t.call("GET", "/api/admin/courts", { cookie: admin });
    expect(l.status).toBe(200);
    expect(l.json).toHaveLength(5);
    expect(l.json[0].id).toBeTruthy();
    expect(l.json[0]._id).toBeUndefined();
    expect((await t.call("GET", "/api/admin/courts/media-a", { cookie: admin })).json.name).toBe("Fútbol · Media A");
    expect((await t.call("GET", "/api/admin/courts/nada", { cookie: admin })).status).toBe(404);
  });

  test("POST crea, upserta spaces; 409 id repetido; 400 id/horario inválidos", async () => {
    const r = await t.call("POST", "/api/admin/courts", { cookie: admin, body: court() });
    expect(r.status).toBe(201);
    expect(r.json.id).toBe("padel-2");
    expect(await t.db.collection("spaces").findOne({ _id: "padel-2" as never })).toBeTruthy();
    expect((await t.call("POST", "/api/admin/courts", { cookie: admin, body: court() })).status).toBe(409);
    expect((await t.call("POST", "/api/admin/courts", { cookie: admin, body: court({ id: "Padel 3" }) })).status).toBe(400);
    const { id, ...noId } = court();
    expect((await t.call("POST", "/api/admin/courts", { cookie: admin, body: noId })).status).toBe(400);
    expect((await t.call("POST", "/api/admin/courts", { cookie: admin, body: court({ id: "x1", prices: { "60": 0, "90": 1, "120": 1 } }) })).status).toBe(400);
    const bad = court({ id: "x2" }) as any;
    bad.schedule[0].open = "23:00";
    expect((await t.call("POST", "/api/admin/courts", { cookie: admin, body: bad })).status).toBe(400);
    const dup = court({ id: "x3" }) as any;
    dup.schedule[1].weekday = 0;
    expect((await t.call("POST", "/api/admin/courts", { cookie: admin, body: dup })).status).toBe(400);
    const closed = court({ id: "x4" }) as any;
    closed.schedule[0] = { weekday: 0, open: "23:00", close: "10:00", closed: true };
    expect((await t.call("POST", "/api/admin/courts", { cookie: admin, body: closed })).status).toBe(201);
  });

  test("PUT: active:false la quita de availability; id inmutable; 404; RN-10", async () => {
    const mine = await t.call("POST", "/api/bookings", { cookie: client, body: { courtId: "basquet-1", date: "2026-11-25", startTime: "18:00", durationMin: 60 } });
    expect(mine.status).toBe(201);
    const cur = (await t.call("GET", "/api/admin/courts/basquet-1", { cookie: admin })).json;
    const { id, ...rest } = cur;
    const put = await t.call("PUT", "/api/admin/courts/basquet-1", { cookie: admin, body: { ...rest, active: false, prices: { "60": 99, "90": 99, "120": 99 }, spaceIds: ["basquet-1", "basquet-extra"] } });
    expect(put.status).toBe(200);
    expect(put.json.active).toBe(false);
    expect(await t.db.collection("spaces").findOne({ _id: "basquet-extra" as never })).toBeTruthy();
    const av = await t.call("GET", "/api/availability?date=2026-11-25");
    expect(av.json.some((c: any) => c.courtId === "basquet-1")).toBe(false);
    const stored = await t.db.collection("bookings").findOne({ _id: mine.json.id as never });
    expect((stored as any).price).toBe(30);
    expect((await t.call("PUT", "/api/admin/courts/basquet-1", { cookie: admin, body: { ...rest, id: "otro" } })).status).toBe(400);
    expect((await t.call("PUT", "/api/admin/courts/basquet-1", { cookie: admin, body: { ...rest, id: "basquet-1" } })).status).toBe(200);
    expect((await t.call("PUT", "/api/admin/courts/nada", { cookie: admin, body: rest })).status).toBe(404);
    expect((await t.call("PUT", "/api/admin/courts/basquet-1", { cookie: admin, body: { ...rest, name: "" } })).status).toBe(400);
    expect((await t.call("PUT", "/api/admin/courts/basquet-1", { cookie: client, body: rest })).status).toBe(403);
  });

  test("DELETE: con reservas 409; sin reservas 204 y luego 404", async () => {
    expect((await t.call("DELETE", "/api/admin/courts/basquet-1", { cookie: admin })).status).toBe(409);
    expect((await t.call("DELETE", "/api/admin/courts/padel-2", { cookie: admin })).status).toBe(204);
    expect((await t.call("DELETE", "/api/admin/courts/padel-2", { cookie: admin })).status).toBe(404);
  });
});
