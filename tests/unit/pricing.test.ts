import { expect, test } from "bun:test";
import { priceFor } from "@canchas/shared";

test("priceFor", () => {
  const p = { "60": 50, "90": 75, "120": 95 };
  expect(priceFor(p, 60)).toBe(50);
  expect(priceFor(p, 90)).toBe(75);
  expect(priceFor(p, 120)).toBe(95);
});
