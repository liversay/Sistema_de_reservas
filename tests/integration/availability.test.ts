import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getAvailability } from "../../src/api/availability";
import { createBooking } from "../../src/api/bookings/service";
import { makeTestDb } from "../helpers/testDb";

const DATE = "2026-11-19"; // jueves
let t: Awaited<ReturnType<typeof makeTestDb>>;
const state = (av: Awaited<ReturnType<typeof getAvailability>>, court: string, time: string) =>
  av.find((c) => c.name === court)!.slots.find((s) => s.time === time)!.state;

beforeAll(async () => {
  t = await makeTestDb();
});
afterAll(async () => {
  await t.drop();
});

describe("disponibilidad", () => {
  test("jueves: Media A 20:00 libre; cubre 16:00 a 23:00; solo canchas activas", async () => {
    const av = await getAvailability(t.db, DATE, t.ctx().now);
    expect(av.map((c) => c.name).sort()).toEqual(
      ["Básquet 1", "Fútbol · Completa", "Fútbol · Media A", "Fútbol · Media B", "Pádel 1"].sort(),
    );
    expect(state(av, "Fútbol · Media A", "20:00")).toBe("libre");
    const slots = av[0]!.slots;
    expect(slots[0]!.time).toBe("16:00");
    expect(slots.at(-1)!.time).toBe("22:30");
  });

  test("estados pasado y cerrado", async () => {
    const av = await getAvailability(t.db, DATE, new Date(2026, 10, 19, 17, 0));
    expect(state(av, "Pádel 1", "16:00")).toBe("pasado");
    expect(state(av, "Pádel 1", "17:00")).toBe("pasado");
    expect(state(av, "Pádel 1", "17:30")).toBe("libre");
    await t.db.collection("courts").updateOne(
      { name: "Pádel 1" },
      { $set: { "schedule.3.open": "18:00" } },
    );
    const av2 = await getAvailability(t.db, DATE, t.ctx().now);
    expect(state(av2, "Pádel 1", "16:00")).toBe("cerrado");
    expect(state(av2, "Pádel 1", "18:00")).toBe("libre");
    await t.db.collection("courts").updateOne({ name: "Pádel 1" }, { $set: { "schedule.3.open": "16:00" } });
  });

  test("reservar Media A 20:00/60 ocupa A y Completa, no B", async () => {
    await createBooking(t.ctx(), { courtId: "media-a", date: DATE, startTime: "20:00", durationMin: 60 }, { userId: "u1" }, "client");
    const av = await getAvailability(t.db, DATE, t.ctx().now);
    expect(state(av, "Fútbol · Media A", "20:00")).toBe("ocupado");
    expect(state(av, "Fútbol · Media A", "20:30")).toBe("ocupado");
    expect(state(av, "Fútbol · Media A", "21:00")).toBe("libre");
    expect(state(av, "Fútbol · Completa", "20:00")).toBe("ocupado");
    expect(state(av, "Fútbol · Media B", "20:00")).toBe("libre");
  });

  test("cancha inactiva no aparece", async () => {
    await t.db.collection("courts").updateOne({ _id: "basquet-1" as never }, { $set: { active: false } });
    const av = await getAvailability(t.db, DATE, t.ctx().now);
    expect(av.find((c) => c.name === "Básquet 1")).toBeUndefined();
  });
});
