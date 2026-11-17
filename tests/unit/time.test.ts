import { describe, expect, test } from "bun:test";
import { DURATIONS, fromSlot, slotsFor, toSlot, weekdayOf } from "@canchas/shared";

describe("time", () => {
  test("DURATIONS", () => expect([...DURATIONS]).toEqual([60, 90, 120]));
  test("toSlot", () => {
    expect(toSlot("20:00")).toBe(40);
    expect(toSlot("08:30")).toBe(17);
    expect(toSlot("00:00")).toBe(0);
  });
  test("fromSlot", () => {
    expect(fromSlot(40)).toBe("20:00");
    expect(fromSlot(17)).toBe("08:30");
  });
  test("slotsFor", () => {
    expect(slotsFor(40, 90)).toEqual([40, 41, 42]);
    expect(slotsFor(40, 60)).toEqual([40, 41]);
    expect(slotsFor(40, 120)).toEqual([40, 41, 42, 43]);
  });
  test("weekdayOf: 0 = lunes", () => {
    expect(weekdayOf("2026-11-16")).toBe(0);
    expect(weekdayOf("2026-11-19")).toBe(3);
    expect(weekdayOf("2026-11-22")).toBe(6);
  });
});
