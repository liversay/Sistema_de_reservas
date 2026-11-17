import type { Duration } from "./types";

export function priceFor(prices: Record<"60" | "90" | "120", number>, durationMin: Duration): number {
  return prices[String(durationMin) as "60" | "90" | "120"];
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** RN-16: precio con descuento de socio. */
export const discounted = (base: number, pct: number): number => round2(base * (1 - pct / 100));
