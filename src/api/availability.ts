import type { Db } from "mongodb";
import { fromSlot, isPast, toSlot, weekdayOf, type Court, type Sport } from "@canchas/shared";

export type SlotState = "libre" | "ocupado" | "cerrado" | "pasado";
export interface AvailabilityCourt {
  courtId: string;
  name: string;
  sport: Sport;
  format?: "5vs5" | "7vs7";
  prices: Court["prices"];
  slots: { slot: number; time: string; state: SlotState }[];
}

export async function getAvailability(db: Db, date: string, now: Date): Promise<AvailabilityCourt[]> {
  const courts = await db.collection<Court>("courts").find({ active: true }).toArray();
  if (courts.length === 0) return [];
  const wd = weekdayOf(date);
  const dayOf = (c: Court) => c.schedule.find((d) => d.weekday === wd);

  const open = courts.flatMap((c) => {
    const d = dayOf(c);
    return d && !d.closed ? [toSlot(d.open)] : [];
  });
  const close = courts.flatMap((c) => {
    const d = dayOf(c);
    return d && !d.closed ? [toSlot(d.close)] : [];
  });
  if (open.length === 0) {
    return courts.map(toEntry(() => []));
  }
  const minOpen = Math.min(...open);
  const maxClose = Math.max(...close);

  const locks = await db
    .collection<{ spaceId: string; slot: number }>("slot_locks")
    .find({ date })
    .toArray();
  const taken = new Set(locks.map((l) => `${l.spaceId}:${l.slot}`));

  return courts.map(
    toEntry((c) => {
      const d = dayOf(c);
      const slots: AvailabilityCourt["slots"] = [];
      for (let slot = minOpen; slot < maxClose; slot++) {
        let state: SlotState;
        if (isPast(date, slot, now)) state = "pasado";
        else if (!d || d.closed || slot < toSlot(d.open) || slot >= toSlot(d.close)) state = "cerrado";
        else if (c.spaceIds.some((s) => taken.has(`${s}:${slot}`))) state = "ocupado";
        else state = "libre";
        slots.push({ slot, time: fromSlot(slot), state });
      }
      return slots;
    }),
  );
}

function toEntry(slotsOf: (c: Court) => AvailabilityCourt["slots"]) {
  return (c: Court): AvailabilityCourt => ({
    courtId: c._id,
    name: c.name,
    sport: c.sport,
    ...(c.format ? { format: c.format } : {}),
    prices: c.prices,
    slots: slotsOf(c),
  });
}
