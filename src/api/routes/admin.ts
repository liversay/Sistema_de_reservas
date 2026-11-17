import { Hono } from "hono";
import type { Db, MongoClient } from "mongodb";
import { DateRangeQuery, GuestBookingInput, GuestSeriesInput, LoyaltyInput, PaymentInput, isRealDate, type Booking } from "@canchas/shared";
import { ZodError } from "zod";
import { requireAdmin, requireUser, type AppEnv } from "../auth";
import { cancelBooking, cancelFutureInSeries, createBooking, createSeries } from "../bookings/service";
import {
  CourtBody,
  createCourt,
  deleteCourt,
  bookingCalendar,
  getBooking,
  paymentsSummary,
  getCourt,
  listBookingsByDate,
  listCourts,
  listPayments,
  markNoShow,
  registerPayment,
  replaceCourt,
} from "../admin/service";
import { readBody } from "../http";
import { getLoyaltyPct, setLoyaltyPct } from "../settings";
import { bookingResources, courtResource } from "../resources";

const bad = (path: string, message: string) => new ZodError([{ code: "custom", path: [path], message }]);

export function adminRoutes(deps: { db: Db; client: MongoClient; secret: string }) {
  const r = new Hono<AppEnv>();
  r.use("*", requireUser(deps.db, deps.secret), requireAdmin);
  const ctx = (now: Date) => ({ db: deps.db, client: deps.client, now });
  const out = async (c: { get: (k: "now") => Date }, rows: Booking[]) =>
    bookingResources(deps.db, rows, c.get("now"), { admin: true });

  r.get("/bookings", async (c) => {
    const date = c.req.query("date");
    if (!date || !isRealDate(date)) throw bad("date", "Fecha inválida (YYYY-MM-DD)");
    return c.json(await out(c, await listBookingsByDate(deps.db, date)));
  });

  r.get("/bookings/calendar", async (c) => {
    const { from, to } = DateRangeQuery.parse({ from: c.req.query("from"), to: c.req.query("to") });
    return c.json(await bookingCalendar(deps.db, from, to));
  });

  r.post("/bookings", async (c) => {
    const { guest, ...input } = GuestBookingInput.parse(await readBody(c));
    const b = await createBooking(ctx(c.get("now")), input, { guest }, "admin");
    return c.json((await out(c, [b]))[0], 201);
  });

  r.post("/bookings/series", async (c) => {
    const { guest, ...input } = GuestSeriesInput.parse(await readBody(c));
    const { seriesId, bookings } = await createSeries(ctx(c.get("now")), input, { guest }, "admin");
    return c.json({ seriesId, bookings: await out(c, bookings) }, 201);
  });

  r.post("/bookings/series/:seriesId/cancel-future", async (c) => {
    const user = c.get("user");
    const cancelled = await cancelFutureInSeries(ctx(c.get("now")), c.req.param("seriesId"), {
      userId: user._id,
      role: "admin",
    });
    return c.json({ cancelled });
  });

  r.post("/bookings/:id/payment", async (c) => {
    const input = PaymentInput.parse(await readBody(c));
    const b = await registerPayment(ctx(c.get("now")), c.req.param("id"), input, c.get("user")._id);
    return c.json((await out(c, [b]))[0]);
  });

  r.post("/bookings/:id/no-show", async (c) => {
    const b = await markNoShow(ctx(c.get("now")), c.req.param("id"));
    return c.json((await out(c, [b]))[0]);
  });

  r.post("/bookings/:id/cancel", async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    await cancelBooking(ctx(c.get("now")), id, { userId: user._id, role: "admin" });
    return c.json((await out(c, [await getBooking(deps.db, id)]))[0]);
  });

  r.get("/payments", async (c) => {
    const status = c.req.query("status");
    if (status !== "pending" && status !== "paid") throw bad("status", "Debe ser pending o paid");
    return c.json(await out(c, await listPayments(deps.db, status, c.get("now"))));
  });

  r.get("/payments/summary", async (c) => {
    const { from, to } = DateRangeQuery.parse({ from: c.req.query("from"), to: c.req.query("to") });
    return c.json(await paymentsSummary(deps.db, from, to, c.get("now")));
  });

  r.get("/settings/loyalty", async (c) => c.json({ discountPct: await getLoyaltyPct(deps.db) }));
  r.put("/settings/loyalty", async (c) => {
    const { discountPct } = LoyaltyInput.parse(await readBody(c));
    return c.json({ discountPct: await setLoyaltyPct(deps.db, discountPct) });
  });

  r.get("/courts", async (c) => c.json((await listCourts(deps.db)).map(courtResource)));
  r.get("/courts/:id", async (c) => c.json(courtResource(await getCourt(deps.db, c.req.param("id")))));

  r.post("/courts", async (c) => {
    const input = CourtBody.parse(await readBody(c));
    if (!input.id) throw bad("id", "El id es obligatorio");
    return c.json(courtResource(await createCourt(deps.db, { ...input, id: input.id })), 201);
  });

  r.put("/courts/:id", async (c) => {
    const id = c.req.param("id");
    const input = CourtBody.parse(await readBody(c));
    if (input.id !== undefined && input.id !== id) throw bad("id", "El id de la cancha es inmutable");
    return c.json(courtResource(await replaceCourt(deps.db, id, input)));
  });

  r.delete("/courts/:id", async (c) => {
    await deleteCourt(deps.db, c.req.param("id"));
    return c.body(null, 204);
  });

  return r;
}
