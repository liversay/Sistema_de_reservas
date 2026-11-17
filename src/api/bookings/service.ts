import { MongoServerError, type ClientSession, type Db, type MongoClient } from "mongodb";
import {
  DURATIONS,
  addDays,
  fitsSchedule,
  isPast,
  priceFor,
  slotsFor,
  toSlot,
  type Booking,
  type Court,
  type SeriesInput,
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

/** Formato de hora/duración (la capa Zod de las rutas ya lo filtra; el servicio no confía en ello). */
function checkFormat(input: Input): void {
  if (!/^([01]\d|2[0-3]):(00|30)$/.test(input.startTime)) {
    throw new RuleError("La hora debe ser en bloques de 30 minutos (HH:MM).");
  }
  if (!(DURATIONS as readonly number[]).includes(input.durationMin)) {
    throw new RuleError("La duración debe ser 60, 90 o 120 minutos.");
  }
}

async function loadCourt(ctx: Ctx, courtId: string): Promise<Court> {
  const court = await ctx.db.collection<Court>("courts").findOne({ _id: courtId });
  if (!court) throw new NotFoundError("Cancha no encontrada");
  return court;
}

/** Reglas de negocio (422) de una ocurrencia: mensaje de la primera que falla, o null. Fuente única
 * para la reserva suelta y para cada fecha de una serie. */
function ruleViolation(ctx: Ctx, court: Court, input: Input, date: string): string | null {
  if (!court.active) return "La cancha está en mantenimiento.";
  const startSlot = toSlot(input.startTime);
  if (isPast(date, startSlot, ctx.now)) return "Ese turno ya empezó.";
  if (!fitsSchedule(court.schedule, date, startSlot, input.durationMin)) {
    return "El turno queda fuera del horario de atención.";
  }
  return null;
}

function buildOccurrence(
  ctx: Ctx,
  court: Court,
  input: Input,
  date: string,
  owner: Owner,
  createdBy: "client" | "admin",
  seriesId?: string,
) {
  const startSlot = toSlot(input.startTime);
  const booking: Booking = {
    _id: crypto.randomUUID(),
    courtId: court._id,
    ...("userId" in owner ? { userId: owner.userId } : { guest: owner.guest }),
    createdBy,
    date,
    startSlot,
    durationMin: input.durationMin,
    spaceIds: [...court.spaceIds],
    price: priceFor(court.prices, input.durationMin),
    status: "confirmada",
    payment: { status: "pendiente" },
    createdAt: ctx.now.toISOString(),
    ...(seriesId ? { seriesId } : {}),
  };
  const locks = court.spaceIds.flatMap((spaceId) =>
    slotsFor(startSlot, input.durationMin).map((slot) => ({ spaceId, date, slot, bookingId: booking._id })),
  );
  return { booking, locks };
}

export async function createBooking(
  ctx: Ctx,
  input: Input,
  owner: Owner,
  createdBy: "client" | "admin",
): Promise<Booking> {
  checkFormat(input);
  const court = await loadCourt(ctx, input.courtId);
  const violation = ruleViolation(ctx, court, input, input.date);
  if (violation) throw new RuleError(violation);
  const { booking, locks } = buildOccurrence(ctx, court, input, input.date, owner, createdBy);

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

const conflictOn = (date: string) => new ConflictError(`Ese horario ya fue tomado el ${date}. Elige otro.`);

/** CR-01 / RN-12: `weeks` ocurrencias (date + 7·k) en UNA transacción; todo o nada. */
export async function createSeries(
  ctx: Ctx,
  input: SeriesInput,
  owner: Owner,
  createdBy: "client" | "admin",
): Promise<{ seriesId: string; bookings: Booking[] }> {
  checkFormat(input);
  const court = await loadCourt(ctx, input.courtId);
  const dates = Array.from({ length: input.weeks }, (_, k) => addDays(input.date, 7 * k));
  for (const date of dates) {
    const violation = ruleViolation(ctx, court, input, date);
    if (violation) throw new RuleError(`Turno del ${date}: ${violation}`);
  }

  const seriesId = crypto.randomUUID();
  const rows = dates.map((date) => buildOccurrence(ctx, court, input, date, owner, createdBy, seriesId));
  const bookings = rows.map((r) => r.booking);
  const locks = rows.flatMap((r) => r.locks);
  const slots = slotsFor(toSlot(input.startTime), input.durationMin);
  const locksColl = ctx.db.collection<{ spaceId: string; date: string; slot: number }>("slot_locks");
  /** Primera fecha (en orden) con algún bloque ya tomado. */
  const firstTaken = async (session?: ClientSession): Promise<string | undefined> => {
    const taken = await locksColl
      .find({ spaceId: { $in: court.spaceIds }, date: { $in: dates }, slot: { $in: slots } }, session ? { session } : {})
      .toArray();
    const set = new Set(taken.map((l) => l.date));
    return dates.find((d) => set.has(d));
  };

  const session = ctx.client.startSession();
  try {
    await session.withTransaction(async () => {
      const taken = await firstTaken(session);
      if (taken) throw conflictOn(taken);
      await ctx.db.collection<Booking>("bookings").insertMany(bookings, { session });
      await locksColl.insertMany(locks as never[], { session });
    });
  } catch (e) {
    if (isDuplicate(e)) {
      const fromKey = e instanceof MongoServerError ? (e.keyValue as { date?: string } | undefined)?.date : undefined;
      throw conflictOn(fromKey && dates.includes(fromKey) ? fromKey : ((await firstTaken()) ?? dates[0]!));
    }
    throw e;
  } finally {
    await session.endSession();
  }
  return { seriesId, bookings };
}

/** CR-01 / RN-13: cancela las ocurrencias `confirmadas` que no han empezado. Devuelve cuántas. */
export async function cancelFutureInSeries(
  ctx: Ctx,
  seriesId: string,
  actor: { userId: string; role: "client" | "admin" },
): Promise<number> {
  const bookings = ctx.db.collection<Booking>("bookings");
  const rows = await bookings.find({ seriesId }).toArray();
  if (rows.length === 0 || (actor.role !== "admin" && !rows.every((b) => b.userId === actor.userId))) {
    throw new NotFoundError("Serie no encontrada");
  }

  const session = ctx.client.startSession();
  let cancelled = 0;
  try {
    await session.withTransaction(async () => {
      // Los objetivos se eligen dentro de la transacción (lectura consistente con la escritura):
      // una reserva marcada no_show o cancelada entretanto no se toca y conserva sus bloques.
      const ids = (await bookings.find({ seriesId, status: "confirmada" }, { session }).toArray())
        .filter((b) => !isPast(b.date, b.startSlot, ctx.now))
        .map((b) => b._id);
      cancelled = 0;
      if (ids.length === 0) return;
      const res = await bookings.updateMany(
        { _id: { $in: ids }, status: "confirmada" },
        { $set: { status: "cancelada" } },
        { session },
      );
      if (res.modifiedCount !== ids.length) throw new ConflictError("La serie cambió; reintenta.");
      cancelled = res.modifiedCount;
      await ctx.db.collection("slot_locks").deleteMany({ bookingId: { $in: ids } }, { session });
    });
  } finally {
    await session.endSession();
  }
  return cancelled;
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
