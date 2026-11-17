import { Hono } from "hono";
import type { Db, MongoClient } from "mongodb";
import { BookingInput, GuestBookingInput, GuestSeriesInput, SeriesInput, type Booking, type User } from "@canchas/shared";
import type { Context } from "hono";
import { optionalUser, requireUser, type AppEnv } from "../auth";
import { cancelBooking, cancelFutureInSeries, createBooking, createSeries } from "../bookings/service";
import { readBody } from "../http";
import { bookingResources } from "../resources";

export function bookingRoutes(deps: { db: Db; client: MongoClient; secret: string }) {
  const r = new Hono<AppEnv>();
  const auth = requireUser(deps.db, deps.secret);
  const ctx = (now: Date) => ({ db: deps.db, client: deps.client, now });

  /** CR-02 / RN-15: dueño de la reserva. Con sesión de cliente se usa el usuario (y se ignora `guest`);
   * sin sesión (o con sesión de admin) `guest` es obligatorio. */
  const ownerOf = (c: Context<AppEnv>) => {
    const user = c.var.user as User | undefined;
    return user && user.role === "client" ? ({ userId: user._id } as const) : null;
  };
  /** Sin `guest` el 400 señala `guest.name` y `guest.phone`, como con un guest inválido. */
  const withGuest = (raw: unknown) =>
    raw && typeof raw === "object" && !("guest" in raw) ? { ...raw, guest: {} } : raw;

  r.post("/", optionalUser(deps.db, deps.secret), async (c) => {
    const raw = await readBody(c);
    const now = c.get("now");
    const sessionOwner = ownerOf(c);
    let input, owner;
    if (sessionOwner) {
      input = BookingInput.parse(raw);
      owner = sessionOwner;
    } else {
      const { guest, ...rest } = GuestBookingInput.parse(withGuest(raw));
      input = rest;
      owner = { guest };
    }
    const b = await createBooking(ctx(now), input, owner, "client");
    return c.json((await bookingResources(deps.db, [b], now, { admin: false }))[0], 201);
  });

  // CR-01: antes de "/:id/..." no hay colisión (rutas de distinta forma), pero se agrupan aquí.
  r.post("/series", optionalUser(deps.db, deps.secret), async (c) => {
    const raw = await readBody(c);
    const now = c.get("now");
    const sessionOwner = ownerOf(c);
    let input, owner;
    if (sessionOwner) {
      input = SeriesInput.parse(raw);
      owner = sessionOwner;
    } else {
      const { guest, ...rest } = GuestSeriesInput.parse(withGuest(raw));
      input = rest;
      owner = { guest };
    }
    const { seriesId, bookings } = await createSeries(ctx(now), input, owner, "client");
    return c.json({ seriesId, bookings: await bookingResources(deps.db, bookings, now, { admin: false }) }, 201);
  });

  r.post("/series/:seriesId/cancel-future", auth, async (c) => {
    const user = c.get("user");
    const cancelled = await cancelFutureInSeries(ctx(c.get("now")), c.req.param("seriesId"), {
      userId: user._id,
      role: "client",
    });
    return c.json({ cancelled });
  });

  r.get("/mine", auth, async (c) => {
    const rows = await deps.db
      .collection<Booking>("bookings")
      .find({ userId: c.get("user")._id })
      .sort({ date: -1, startSlot: -1 })
      .toArray();
    return c.json(await bookingResources(deps.db, rows, c.get("now"), { admin: false }));
  });

  r.post("/:id/cancel", auth, async (c) => {
    const user = c.get("user");
    const now = c.get("now");
    const id = c.req.param("id");
    await cancelBooking(ctx(now), id, { userId: user._id, role: "client" });
    const b = (await deps.db.collection<Booking>("bookings").findOne({ _id: id }))!;
    return c.json((await bookingResources(deps.db, [b], now, { admin: false }))[0]);
  });

  return r;
}
