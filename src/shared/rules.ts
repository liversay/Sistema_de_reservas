import { toSlot, weekdayOf } from "./time";
import type { Duration, ScheduleDay } from "./types";

/** El rango [start, start+duración) debe caer dentro de [open, close) y el día no estar cerrado. */
export function fitsSchedule(
  schedule: ScheduleDay[],
  date: string,
  startSlot: number,
  durationMin: Duration,
): boolean {
  const day = schedule.find((d) => d.weekday === weekdayOf(date));
  if (!day || day.closed) return false;
  const endSlot = startSlot + durationMin / 30;
  return startSlot >= toSlot(day.open) && endSlot <= toSlot(day.close);
}

function localInstant(date: string, slot: number): Date {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(y, mo - 1, d, 0, slot * 30, 0, 0);
}

/** RN-05: un turno que ya empezó es pasado. Hora local. */
export function isPast(date: string, startSlot: number, now: Date): boolean {
  return localInstant(date, startSlot).getTime() <= now.getTime();
}

export function hasEnded(date: string, startSlot: number, durationMin: Duration, now: Date): boolean {
  return localInstant(date, startSlot + durationMin / 30).getTime() <= now.getTime();
}
