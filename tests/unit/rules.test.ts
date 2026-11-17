import { describe, expect, test } from "bun:test";
import { fitsSchedule, hasEnded, isPast, toSlot, type ScheduleDay } from "@canchas/shared";

const LV16a23: ScheduleDay[] = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  open: weekday < 5 ? "16:00" : "08:00",
  close: "23:00",
  closed: false,
}));

describe("fitsSchedule", () => {
  test("22:00 con 120 no cabe; con 60 sí", () => {
    expect(fitsSchedule(LV16a23, "2026-11-19", toSlot("22:00"), 120)).toBe(false);
    expect(fitsSchedule(LV16a23, "2026-11-19", toSlot("22:00"), 60)).toBe(true);
  });
  test("antes de abrir", () => {
    expect(fitsSchedule(LV16a23, "2026-11-19", toSlot("15:30"), 60)).toBe(false);
    expect(fitsSchedule(LV16a23, "2026-11-21", toSlot("08:00"), 60)).toBe(true);
  });
  test("día cerrado", () => {
    const s = LV16a23.map((d) => (d.weekday === 3 ? { ...d, closed: true } : d));
    expect(fitsSchedule(s, "2026-11-19", toSlot("18:00"), 60)).toBe(false);
  });
});

describe("isPast / hasEnded", () => {
  test("isPast", () => {
    expect(isPast("2026-11-19", 40, new Date("2026-11-19T20:10"))).toBe(true);
    expect(isPast("2026-11-19", 40, new Date("2026-11-19T19:59"))).toBe(false);
  });
  test("hasEnded", () => {
    expect(hasEnded("2026-11-19", 40, 90, new Date("2026-11-19T21:29"))).toBe(false);
    expect(hasEnded("2026-11-19", 40, 90, new Date("2026-11-19T21:30"))).toBe(true);
  });
});
