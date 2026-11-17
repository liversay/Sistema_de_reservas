import { z } from "zod";
import type { Db } from "mongodb";
import { MongoServerError } from "mongodb";
import { CourtInput, hasEnded, type Booking, type Court, type PaymentMethod } from "@canchas/shared";
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
  spaceIds: z.array(z.string().min(1)).min(1),
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
