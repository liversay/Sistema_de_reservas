import { Hono } from "hono";
import type { Db, MongoClient } from "mongodb";
import { BookingInput, type Booking } from "@canchas/shared";
import { requireUser, type AppEnv } from "../auth";
import { cancelBooking, createBooking } from "../bookings/service";
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
