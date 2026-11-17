import type { Duration } from "./types";

export function priceFor(prices: Record<"60" | "90" | "120", number>, durationMin: Duration): number {
  return prices[String(durationMin) as "60" | "90" | "120"];
}
