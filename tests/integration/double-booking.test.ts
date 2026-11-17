import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConflictError } from "../../src/api/errors";
import { createBooking } from "../../src/api/bookings/service";
import { makeTestDb } from "../helpers/testDb";

// Suite obligatoria "no double booking" (RN-01, RN-02; CA-05, CA-06).
// `now` por defecto = jueves 2026-11-19 10:00, anterior a los turnos reservados (RN-05 no interfiere).
const DATE = "2026-11-19";
const MSG = "Ese horario ya fue tomado. Elige otro.";
const input = (courtId: string, startTime: string, durationMin: 60 | 90 | 120) => ({ courtId, date: DATE, startTime, durationMin });

let t: Awaited<ReturnType<typeof makeTestDb>>;
beforeEach(async () => {
  t = await makeTestDb(); // BD aislada por prueba
});
afterEach(async () => {
  await t.drop();
});

const book = (courtId: string, start: string, dur: 60 | 90 | 120, user: string) =>
  createBooking(t.ctx(), input(courtId, start, dur), { userId: user }, "client");

async function expectConflict(p: Promise<unknown>) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(ConflictError);
  expect(err.message).toBe(MSG);
}

const counts = async () => ({
  bookings: await t.db.collection("bookings").countDocuments({}),
  locks: await t.db.collection("slot_locks").countDocuments({}),
});

describe("doble reserva (RN-01, RN-02)", () => {
  test("RN-01: misma cancha mismo turno → 409", async () => {
    await book("padel-1", "20:00", 60, "u1");
    const before = await counts();
    await expectConflict(book("padel-1", "20:00", 60, "u2"));
    expect(await counts()).toEqual(before); // CA-05: sin reserva ni bloques adicionales
  });

  test("RN-01: solapamiento parcial 20:00/90 vs 21:00/60 → 409", async () => {
    await book("padel-1", "20:00", 90, "u1"); // 20:00-21:30
    const before = await counts();
    await expectConflict(book("padel-1", "21:00", 60, "u2")); // 21:00-22:00
    expect(await counts()).toEqual(before);
  });

  test("RN-02: completa bloquea ambas mitades", async () => {
    await book("completa", "20:00", 60, "u1");
    await expectConflict(book("media-a", "20:00", 60, "u2"));
    await expectConflict(book("media-b", "20:00", 60, "u3"));
    await expectConflict(book("media-a", "20:30", 60, "u4"));
  });

  test("RN-02: una mitad ocupada bloquea la completa", async () => {
    await book("media-a", "20:00", 60, "u1");
    await expectConflict(book("completa", "20:00", 60, "u2"));
    // Media B sigue reservable en el mismo horario
    const b = await book("media-b", "20:00", 60, "u3");
    expect(b.status).toBe("confirmada");
  });

  test("RN-02: completa 20:00/60 con Media A 20:30/60 → 409", async () => {
    await book("completa", "20:00", 60, "u1"); // 20:00-21:00
    await expectConflict(book("media-a", "20:30", 60, "u2")); // 20:30-21:30 solapa 20:30-21:00
    // y a la inversa (CA-06): Media A 20:00/60 y Completa 20:30/60
    await t.db.collection("bookings").deleteMany({});
    await t.db.collection("slot_locks").deleteMany({});
    await book("media-a", "20:00", 60, "u3");
    await expectConflict(book("completa", "20:30", 60, "u4"));
  });

  test("RN-01: 10 reservas concurrentes al mismo turno → exactamente 1 éxito y 9 ConflictError", async () => {
    const res = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => book("media-a", "20:00", 60, `c${i}`)));
    const ok = res.filter((r) => r.status === "fulfilled");
    const rejected = res.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok.length).toBe(1);
    expect(rejected.length).toBe(9);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(ConflictError);
    // 60 min en media cancha = 2 bloques de 30 min = 2 locks; una sola reserva
    expect(await t.db.collection("slot_locks").countDocuments({ spaceId: "futbol-media-a", date: DATE })).toBe(2);
    expect(await counts()).toEqual({ bookings: 1, locks: 2 });
  });
});
