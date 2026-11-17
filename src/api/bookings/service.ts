import { MongoServerError, type Db, type MongoClient } from "mongodb";
import {
  DURATIONS,
  fitsSchedule,
  isPast,
  priceFor,
  slotsFor,
  toSlot,
  type Booking,
  type Court,
} from "@canchas/shared";
import { ConflictError, NotFoundError, RuleError } from "../errors";

export interface Ctx {
  db: Db;
  client: MongoClient;
  now: Date;
}
type Owner = { userId: string } | { guest: { name: string; phone: string } };
type Input = { courtId: string; date: string; startTime: string; durationMin: 60 | 90 | 120 };

const isDuplicate = (e: unknown) =>
  e instanceof MongoServerError &&
  (e.code === 11000 || e.code === 112 || e.codeName === "DuplicateKey" || e.hasErrorLabel("TransientTransactionError"));

export async function createBooking(
  ctx: Ctx,
  input: Input,
  owner: Owner,
  createdBy: "client" | "admin",
): Promise<Booking> {
  if (!/^([01]\d|2[0-3]):(00|30)$/.test(input.startTime)) {
    throw new RuleError("La hora debe ser en bloques de 30 minutos (HH:MM).");
  }
  if (!(DURATIONS as readonly number[]).includes(input.durationMin)) {
    throw new RuleError("La duración debe ser 60, 90 o 120 minutos.");
  }
  const court = await ctx.db.collection<Court>("courts").findOne({ _id: input.courtId });
  if (!court) throw new NotFoundError("Cancha no encontrada");
  if (!court.active) throw new RuleError("La cancha está en mantenimiento.");
  const startSlot = toSlot(input.startTime);
  if (isPast(input.date, startSlot, ctx.now)) throw new RuleError("Ese turno ya empezó.");
  if (!fitsSchedule(court.schedule, input.date, startSlot, input.durationMin)) {
    throw new RuleError("El turno queda fuera del horario de atención.");
  }

  const booking: Booking = {
    _id: crypto.randomUUID(),
    courtId: court._id,
    ...("userId" in owner ? { userId: owner.userId } : { guest: owner.guest }),
    createdBy,
    date: input.date,
    startSlot,
    durationMin: input.durationMin,
    spaceIds: [...court.spaceIds],
    price: priceFor(court.prices, input.durationMin),
    status: "confirmada",
    payment: { status: "pendiente" },
    createdAt: ctx.now.toISOString(),
  };
  const locks = court.spaceIds.flatMap((spaceId) =>
    slotsFor(startSlot, input.durationMin).map((slot) => ({
      spaceId,
      date: input.date,
      slot,
      bookingId: booking._id,
    })),
  );

  const session = ctx.client.startSession();
  try {
    await session.withTransaction(async () => {
      await ctx.db.collection<Booking>("bookings").insertOne(booking, { session });
      await ctx.db.collection("slot_locks").insertMany(locks, { session });
    });
  } catch (e) {
    if (isDuplicate(e)) throw new ConflictError("Ese horario ya fue tomado. Elige otro.");
    throw e;
  } finally {
    await session.endSession();
  }
  return booking;
}

export async function cancelBooking(
  ctx: Ctx,
  bookingId: string,
  actor: { userId: string; role: "client" | "admin" },
): Promise<void> {
  const bookings = ctx.db.collection<Booking>("bookings");
  const booking = await bookings.findOne({ _id: bookingId });
  if (!booking || (actor.role !== "admin" && booking.userId !== actor.userId)) {
    throw new NotFoundError("Reserva no encontrada");
  }
  if (booking.status !== "confirmada") throw new ConflictError("La reserva no está activa.");
  if (actor.role !== "admin" && isPast(booking.date, booking.startSlot, ctx.now)) {
    throw new RuleError("La reserva ya empezó y no se puede cancelar.");
  }

  const session = ctx.client.startSession();
  try {
    await session.withTransaction(async () => {
      const res = await bookings.updateOne(
        { _id: bookingId, status: "confirmada" },
        { $set: { status: "cancelada" } },
        { session },
      );
      if (res.modifiedCount !== 1) throw new ConflictError("La reserva no está activa.");
      await ctx.db.collection("slot_locks").deleteMany({ bookingId }, { session });
    });
  } finally {
    await session.endSession();
  }
}
