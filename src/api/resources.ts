import type { Db } from "mongodb";
import { fromSlot, hasEnded, type Booking, type Court, type User } from "@canchas/shared";

/** Recurso Reserva de api.md. `played` solo en respuestas de admin. */
export async function bookingResources(db: Db, bookings: Booking[], now: Date, opts: { admin: boolean }) {
  if (bookings.length === 0) return [];
  const courtIds = [...new Set(bookings.map((b) => b.courtId))];
  const userIds = [...new Set(bookings.flatMap((b) => (b.userId ? [b.userId] : [])))];
  const courts = new Map(
    (await db.collection<Court>("courts").find({ _id: { $in: courtIds } }).toArray()).map((c) => [c._id, c]),
  );
  const users = new Map(
    (await db.collection<User>("users").find({ _id: { $in: userIds } }).toArray()).map((u) => [u._id, u]),
  );
  return bookings.map((b) => {
    const u = b.userId ? users.get(b.userId) : undefined;
    return {
      id: b._id,
      courtId: b.courtId,
      courtName: courts.get(b.courtId)?.name ?? b.courtId,
      date: b.date,
      startTime: fromSlot(b.startSlot),
      endTime: fromSlot(b.startSlot + b.durationMin / 30),
      durationMin: b.durationMin,
      spaceIds: b.spaceIds,
      price: b.price,
      status: b.status,
      payment: b.payment,
      createdBy: b.createdBy,
      ...(b.userId ? { user: { name: u?.name ?? "", phone: u?.phone ?? "" } } : {}),
      ...(b.guest ? { guest: b.guest } : {}),
      createdAt: b.createdAt,
      ...(opts.admin ? { played: hasEnded(b.date, b.startSlot, b.durationMin, now) } : {}),
    };
  });
}

export function courtResource(c: Court) {
  const { _id, ...rest } = c;
  return { id: _id, ...rest };
}
