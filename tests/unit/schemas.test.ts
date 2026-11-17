import { describe, expect, test } from "bun:test";
import { BookingInput, CourtInput, GuestBookingInput, PaymentInput, RegisterInput } from "@canchas/shared";

const booking = { courtId: "c1", date: "2026-11-19", startTime: "20:00", durationMin: 90 };

describe("BookingInput", () => {
  test("válido", () => expect(BookingInput.safeParse(booking).success).toBe(true));
  test("rechaza 20:15", () => expect(BookingInput.safeParse({ ...booking, startTime: "20:15" }).success).toBe(false));
  test("rechaza 2026-13-40", () => expect(BookingInput.safeParse({ ...booking, date: "2026-13-40" }).success).toBe(false));
  test("rechaza duración 45", () => expect(BookingInput.safeParse({ ...booking, durationMin: 45 }).success).toBe(false));
});

test("GuestBookingInput", () => {
  expect(GuestBookingInput.safeParse({ ...booking, guest: { name: "Ana", phone: "+598 99123456" } }).success).toBe(true);
  expect(GuestBookingInput.safeParse(booking).success).toBe(false);
});

describe("RegisterInput", () => {
  const ok = { name: "Ana", email: "a@b.com", phone: "099123456", password: "12345678" };
  test("válido", () => expect(RegisterInput.safeParse(ok).success).toBe(true));
  test("email inválido", () => expect(RegisterInput.safeParse({ ...ok, email: "x" }).success).toBe(false));
  test("teléfono abc", () => expect(RegisterInput.safeParse({ ...ok, phone: "abc" }).success).toBe(false));
  test("contraseña de 7", () => expect(RegisterInput.safeParse({ ...ok, password: "1234567" }).success).toBe(false));
});

test("PaymentInput", () => {
  expect(PaymentInput.safeParse({ amount: 50, method: "efectivo" }).success).toBe(true);
  expect(PaymentInput.safeParse({ amount: 0, method: "efectivo" }).success).toBe(false);
  expect(PaymentInput.safeParse({ amount: 5, method: "bitcoin" }).success).toBe(false);
});

test("CourtInput", () => {
  const c = {
    name: "Media A", sport: "futbol", format: "5vs5", spaceIds: ["futbol-media-a"], active: true,
    prices: { "60": 50, "90": 75, "120": 95 },
    schedule: [{ weekday: 0, open: "16:00", close: "23:00", closed: false }],
  };
  expect(CourtInput.safeParse(c).success).toBe(true);
  expect(CourtInput.safeParse({ ...c, spaceIds: [] }).success).toBe(false);
});
