import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ConflictError, NotFoundError, RuleError } from "../../src/api/errors";
import { cancelBooking, createBooking } from "../../src/api/bookings/service";
import { makeTestDb } from "../helpers/testDb";

const DATE = "2026-11-19";
let t: Awaited<ReturnType<typeof makeTestDb>>;
const input = (courtId: string, startTime: string, durationMin: 60 | 90 | 120) => ({ courtId, date: DATE, startTime, durationMin });

beforeAll(async () => {
  t = await makeTestDb();
});
afterAll(async () => {
  await t.drop();
});

describe("createBooking", () => {
  test("22:00/120 no cabe en el horario -> RuleError", async () => {
    await expect(createBooking(t.ctx(), input("media-a", "22:00", 120), { userId: "u1" }, "client")).rejects.toBeInstanceOf(RuleError);
  });

  test("RN-03: hora fuera de bloque o duración inválida -> RuleError", async () => {
    await expect(createBooking(t.ctx(), input("media-a", "20:15", 60), { userId: "u1" }, "client")).rejects.toBeInstanceOf(RuleError);
    await expect(createBooking(t.ctx(), { courtId: "media-a", date: DATE, startTime: "20:00", durationMin: 45 as never }, { userId: "u1" }, "client")).rejects.toBeInstanceOf(RuleError);
  });

  test("turno pasado -> RuleError", async () => {
    await expect(createBooking(t.ctx(), input("media-a", "09:00", 60), { userId: "u1" }, "client")).rejects.toBeInstanceOf(RuleError);
    await expect(createBooking(t.ctx(), input("media-a", "10:00", 60), { userId: "u1" }, "client")).rejects.toBeInstanceOf(RuleError);
  });

  test("cancha inexistente -> NotFoundError", async () => {
    await expect(createBooking(t.ctx(), input("nada", "18:00", 60), { userId: "u1" }, "client")).rejects.toBeInstanceOf(NotFoundError);
  });

  test("precio guardado: Completa 90 min = 140; copia spaceIds", async () => {
    const b = await createBooking(t.ctx(), input("completa", "17:00", 90), { userId: "u1" }, "client");
    expect(b.price).toBe(140);
    expect(b.spaceIds.sort()).toEqual(["futbol-media-a", "futbol-media-b"]);
    expect(b.status).toBe("confirmada");
    expect(b.payment.status).toBe("pendiente");
    expect(await t.db.collection("slot_locks").countDocuments({ bookingId: b._id })).toBe(6);
  });

  test("reserva de invitado por admin", async () => {
    const b = await createBooking(t.ctx(), input("padel-1", "18:00", 60), { guest: { name: "Ana", phone: "+51999888777" } }, "admin");
    expect(b.guest?.name).toBe("Ana");
    expect(b.createdBy).toBe("admin");
    expect(b.userId).toBeUndefined();
    expect(b.price).toBe(20);
  });

  test("misma reserva dos veces -> ConflictError con mensaje exacto; sin reserva huérfana", async () => {
    await createBooking(t.ctx(), input("media-b", "20:00", 60), { userId: "u1" }, "client");
    const err = await createBooking(t.ctx(), input("media-b", "20:00", 60), { userId: "u2" }, "client").catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe("Ese horario ya fue tomado. Elige otro.");
    expect(await t.db.collection("bookings").countDocuments({ courtId: "media-b", startSlot: 40 })).toBe(1);
  });

  test("Completa choca con una mitad ocupada", async () => {
    await createBooking(t.ctx(), input("media-a", "21:30", 60), { userId: "u1" }, "client");
    await expect(createBooking(t.ctx(), input("completa", "21:00", 60), { userId: "u2" }, "client")).rejects.toBeInstanceOf(ConflictError);
  });

  test("concurrencia: 8 intentos simultáneos, solo uno gana", async () => {
    const res = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => createBooking(t.ctx(), input("basquet-1", "19:00", 60), { userId: `c${i}` }, "client")),
    );
    expect(res.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(res.filter((r) => r.status === "rejected" && r.reason instanceof ConflictError).length).toBe(7);
  });

  test("cancha inactiva -> RuleError", async () => {
    await t.db.collection("courts").updateOne({ _id: "padel-1" as never }, { $set: { active: false } });
    await expect(createBooking(t.ctx(), input("padel-1", "20:00", 60), { userId: "u1" }, "client")).rejects.toBeInstanceOf(RuleError);
  });
});

describe("cancelBooking", () => {
  test("cancelar libera y se puede reservar de nuevo el mismo turno", async () => {
    const b = await createBooking(t.ctx(), input("media-a", "16:00", 60), { userId: "u1" }, "client");
    await cancelBooking(t.ctx(), b._id, { userId: "u1", role: "client" });
    expect(await t.db.collection("slot_locks").countDocuments({ bookingId: b._id })).toBe(0);
    const b2 = await createBooking(t.ctx(), input("media-a", "16:00", 60), { userId: "u3" }, "client");
    expect(b2._id).not.toBe(b._id);
  });

  test("cliente no cancela la de otro; admin sí", async () => {
    const b = await createBooking(t.ctx(), input("media-a", "18:30", 60), { userId: "u1" }, "client");
    await expect(cancelBooking(t.ctx(), b._id, { userId: "u2", role: "client" })).rejects.toBeInstanceOf(NotFoundError);
    await cancelBooking(t.ctx(), b._id, { userId: "adm", role: "admin" });
    expect((await t.db.collection("bookings").findOne({ _id: b._id as never }))?.status).toBe("cancelada");
  });

  test("cliente no cancela una que ya empezó", async () => {
    const b = await createBooking(t.ctx(), input("media-a", "19:00", 60), { userId: "u1" }, "client");
    const later = new Date(2026, 10, 19, 19, 15);
    await expect(cancelBooking(t.ctx(later), b._id, { userId: "u1", role: "client" })).rejects.toBeInstanceOf(RuleError);
  });

  test("inexistente -> NotFoundError; ya cancelada -> ConflictError", async () => {
    await expect(cancelBooking(t.ctx(), "nope", { userId: "u1", role: "client" })).rejects.toBeInstanceOf(NotFoundError);
    const b = await createBooking(t.ctx(), input("media-a", "20:30", 60), { userId: "u1" }, "client");
    await cancelBooking(t.ctx(), b._id, { userId: "u1", role: "client" });
    await expect(cancelBooking(t.ctx(), b._id, { userId: "u1", role: "client" })).rejects.toBeInstanceOf(ConflictError);
  });
});
