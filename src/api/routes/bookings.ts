import { Hono } from "hono";
import type { Db, MongoClient } from "mongodb";
import { BookingInput, SeriesInput, type Booking } from "@canchas/shared";
import { requireUser, type AppEnv } from "../auth";
import { cancelBooking, cancelFutureInSeries, createBooking, createSeries } from "../bookings/service";
import { readBody } from "../http";
import { bookingResources } from "../resources";

export function bookingRoutes(deps: { db: Db; client: MongoClient; secret: string }) {
  const r = new Hono<AppEnv>();
  r.use("*", requireUser(deps.db, deps.secret));
  const ctx = (now: Date) => ({ db: deps.db, client: deps.client, now });

  r.post("/", async (c) => {
    const input = BookingInput.parse(await readBody(c));
    const now = c.get("now");
    const b = await createBooking(ctx(now), input, { userId: c.get("user")._id }, "client");
    return c.json((await bookingResources(deps.db, [b], now, { admin: false }))[0], 201);
  });

  // CR-01: antes de "/:id/..." no hay colisión (rutas de distinta forma), pero se agrupan aquí.
  r.post("/series", async (c) => {
    const input = SeriesInput.parse(await readBody(c));
    const now = c.get("now");
    const { seriesId, bookings } = await createSeries(ctx(now), input, { userId: c.get("user")._id }, "client");
    return c.json({ seriesId, bookings: await bookingResources(deps.db, bookings, now, { admin: false }) }, 201);
  });

  r.post("/series/:seriesId/cancel-future", async (c) => {
    const user = c.get("user");
    const cancelled = await cancelFutureInSeries(ctx(c.get("now")), c.req.param("seriesId"), {
      userId: user._id,
      role: "client",
    });
    return c.json({ cancelled });
  });

  r.get("/mine", async (c) => {
    const rows = await deps.db
      .collection<Booking>("bookings")
      .find({ userId: c.get("user")._id })
      .sort({ date: -1, startSlot: -1 })
      .toArray();
    return c.json(await bookingResources(deps.db, rows, c.get("now"), { admin: false }));
  });

  r.post("/:id/cancel", async (c) => {
    const user = c.get("user");
    const now = c.get("now");
    const id = c.req.param("id");
    await cancelBooking(ctx(now), id, { userId: user._id, role: "client" });
    const b = (await deps.db.collection<Booking>("bookings").findOne({ _id: id }))!;
    return c.json((await bookingResources(deps.db, [b], now, { admin: false }))[0]);
  });

  return r;
}
