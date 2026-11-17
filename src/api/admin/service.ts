import { z } from "zod";
import type { Db } from "mongodb";
import { MongoServerError } from "mongodb";
import { CourtInput, addDays, hasEnded, round2, toSlot, weekdayOf, type Booking, type Court, type PaymentMethod } from "@canchas/shared";
import { ConflictError, NotFoundError, RuleError } from "../errors";
import type { Ctx } from "../bookings/service";

async function findBooking(db: Db, id: string): Promise<Booking> {
  const b = await db.collection<Booking>("bookings").findOne({ _id: id });
  if (!b) throw new NotFoundError("Reserva no encontrada");
  return b;
}

/** Orden: 404 -> 409 (no confirmada / ya pagada) -> 422 (aún no terminó). */
export async function registerPayment(
  ctx: Ctx,
  id: string,
  input: { amount: number; method: PaymentMethod },
  adminId: string,
): Promise<Booking> {
  const b = await findBooking(ctx.db, id);
  if (b.status !== "confirmada") throw new ConflictError("La reserva no está confirmada.");
  if (b.payment.status === "pagado") throw new ConflictError("La reserva ya fue pagada.");
  if (!hasEnded(b.date, b.startSlot, b.durationMin, ctx.now)) throw new RuleError("El turno aún no terminó.");
  const res = await ctx.db.collection<Booking>("bookings").findOneAndUpdate(
    { _id: id, status: "confirmada", "payment.status": "pendiente" },
    {
      $set: {
        payment: {
          status: "pagado",
          amount: input.amount,
          method: input.method,
          paidAt: ctx.now.toISOString(),
          paidBy: adminId,
        },
      },
    },
    { returnDocument: "after" },
  );
  if (!res) throw new ConflictError("La reserva ya fue pagada.");
  return res;
}

/** Conserva los bloques (slot_locks) a propósito. */
export async function markNoShow(ctx: Ctx, id: string): Promise<Booking> {
  const b = await findBooking(ctx.db, id);
  if (b.status !== "confirmada") throw new ConflictError("La reserva no está confirmada.");
  if (b.payment.status === "pagado") throw new ConflictError("La reserva ya fue pagada.");
  if (!hasEnded(b.date, b.startSlot, b.durationMin, ctx.now)) throw new RuleError("El turno aún no terminó.");
  const res = await ctx.db
    .collection<Booking>("bookings")
    .findOneAndUpdate({ _id: id, status: "confirmada", "payment.status": "pendiente" }, { $set: { status: "no_show" } }, { returnDocument: "after" });
  if (!res) throw new ConflictError("La reserva no está confirmada.");
  return res;
}

export async function getBooking(db: Db, id: string): Promise<Booking> {
  return findBooking(db, id);
}

export async function listBookingsByDate(db: Db, date: string): Promise<Booking[]> {
  return db.collection<Booking>("bookings").find({ date }).sort({ startSlot: 1 }).toArray();
}

export async function listPayments(db: Db, status: "pending" | "paid", now: Date): Promise<Booking[]> {
  const col = db.collection<Booking>("bookings");
  if (status === "paid") return col.find({ "payment.status": "pagado" }).sort({ date: 1, startSlot: 1 }).toArray();
  const rows = await col
    .find({ status: "confirmada", "payment.status": "pendiente" })
    .sort({ date: 1, startSlot: 1 })
    .toArray();
  return rows.filter((b) => hasEnded(b.date, b.startSlot, b.durationMin, now));
}

// ---- Canchas ----

const hhmm = (s: string) => s;
export const CourtBody = CourtInput.extend({
  id: z.string().regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones").optional(),
  spaceIds: z
    .array(z.string().min(1))
    .min(1)
    .refine((a) => new Set(a).size === a.length, "Espacio repetido"),
  prices: z.object({
    "60": z.number().positive(),
    "90": z.number().positive(),
    "120": z.number().positive(),
  }),
  schedule: CourtInput.shape.schedule.superRefine((days, ctx) => {
    const seen = new Set<number>();
    days.forEach((d, i) => {
      if (seen.has(d.weekday)) ctx.addIssue({ code: "custom", path: [i, "weekday"], message: "Día repetido" });
      seen.add(d.weekday);
      if (!d.closed && !(hhmm(d.open) < hhmm(d.close))) {
        ctx.addIssue({ code: "custom", path: [i, "open"], message: "La apertura debe ser anterior al cierre" });
      }
    });
  }),
});
export type CourtBodyT = z.infer<typeof CourtBody>;

async function upsertSpaces(db: Db, spaceIds: string[]) {
  for (const s of spaceIds) {
    await db.collection<{ _id: string }>("spaces").updateOne({ _id: s }, { $setOnInsert: { _id: s, name: s } }, { upsert: true });
  }
}

export const listCourts = (db: Db) => db.collection<Court>("courts").find().sort({ _id: 1 }).toArray();

export async function getCourt(db: Db, id: string): Promise<Court> {
  const c = await db.collection<Court>("courts").findOne({ _id: id });
  if (!c) throw new NotFoundError("Cancha no encontrada");
  return c;
}

export async function createCourt(db: Db, input: CourtBodyT & { id: string }): Promise<Court> {
  const { id, ...rest } = input;
  const court: Court = { _id: id, ...rest };
  await upsertSpaces(db, court.spaceIds);
  try {
    await db.collection<Court>("courts").insertOne(court);
  } catch (e) {
    if (e instanceof MongoServerError && e.code === 11000) throw new ConflictError("Ya existe una cancha con ese id.");
    throw e;
  }
  return court;
}

/** Reemplazo completo; no toca reservas existentes (RN-10). */
export async function replaceCourt(db: Db, id: string, input: CourtBodyT): Promise<Court> {
  await getCourt(db, id);
  const { id: _ignored, ...rest } = input;
  const court: Court = { _id: id, ...rest };
  await upsertSpaces(db, court.spaceIds);
  await db.collection<Court>("courts").replaceOne({ _id: id }, court);
  return court;
}

export async function deleteCourt(db: Db, id: string): Promise<void> {
  await getCourt(db, id);
  if ((await db.collection("bookings").countDocuments({ courtId: id }, { limit: 1 })) > 0) {
    throw new ConflictError("La cancha tiene reservas; desactívala en su lugar.");
  }
  await db.collection<Court>("courts").deleteOne({ _id: id });
}

// ---- CR-02: tablero ----

/** Reservas no canceladas por día en [from, to]; solo días con reservas, ascendente. */
export async function bookingCalendar(db: Db, from: string, to: string): Promise<{ date: string; count: number }[]> {
  const rows = await db
    .collection<Booking>("bookings")
    .aggregate<{ _id: string; count: number }>([
      { $match: { date: { $gte: from, $lte: to }, status: { $ne: "cancelada" } } },
      { $group: { _id: "$date", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  return rows.map((r) => ({ date: r._id, count: r.count }));
}

const METHODS = ["efectivo", "transferencia", "tarjeta", "yappy"] as const;

/** Indicadores de cobros y ocupación del rango (CA-24). Las fechas son las de la reserva. */
export async function paymentsSummary(db: Db, from: string, to: string, now: Date) {
  const rows = await db
    .collection<Booking>("bookings")
    .find({ date: { $gte: from, $lte: to } })
    .toArray();
  const byMethod: Record<(typeof METHODS)[number], number> = { efectivo: 0, transferencia: 0, tarjeta: 0, yappy: 0 };
  const byDay = new Map<string, number>();
  let collected = 0;
  let pending = 0;
  let pendingCount = 0;
  let bookings = 0;
  let cancelled = 0;
  let noShow = 0;
  let reservedBlocks = 0;
  for (const b of rows) {
    if (b.status === "cancelada") {
      cancelled++;
      continue;
    }
    bookings++;
    reservedBlocks += b.durationMin / 30;
    if (b.status === "no_show") noShow++;
    if (b.payment.status === "pagado") {
      const amount = b.payment.amount ?? 0;
      collected += amount;
      if (b.payment.method) byMethod[b.payment.method] += amount;
      byDay.set(b.date, (byDay.get(b.date) ?? 0) + amount);
    } else if (b.status === "confirmada" && hasEnded(b.date, b.startSlot, b.durationMin, now)) {
      pending += b.price;
      pendingCount++;
    }
  }

  const courts = await db.collection<Court>("courts").find({ active: true }).toArray();
  let openBlocks = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    for (const c of courts) {
      const day = c.schedule.find((s) => s.weekday === wd);
      if (day && !day.closed) openBlocks += Math.max(0, toSlot(day.close) - toSlot(day.open));
    }
  }

  return {
    collected: round2(collected),
    pending: round2(pending),
    pendingCount,
    bookings,
    cancelled,
    noShow,
    byMethod: Object.fromEntries(METHODS.map((m) => [m, round2(byMethod[m])])) as typeof byMethod,
    byDay: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, c]) => ({ date, collected: round2(c) })),
    occupancyPct: openBlocks === 0 ? 0 : Math.round((reservedBlocks / openBlocks) * 1000) / 10,
  };
}
