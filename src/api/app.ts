import { Hono } from "hono";
import type { Db, MongoClient } from "mongodb";
import { ZodError } from "zod";
import { HttpError, type AppEnv } from "./auth";
import { fieldsOf } from "./http";
import { adminRoutes } from "./routes/admin";
import { bookingRoutes } from "./routes/bookings";
import { publicRoutes } from "./routes/public";

export interface AppDeps {
  db: Db;
  client: MongoClient;
  now?: () => Date;
  secret: string;
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const clock = deps.now ?? (() => new Date());
  const app = new Hono<AppEnv>();

  // now() se llama una sola vez por petición.
  app.use("*", async (c, next) => {
    c.set("now", clock());
    await next();
  });

  app.route("/api", publicRoutes(deps));
  app.route("/api/bookings", bookingRoutes(deps));
  app.route("/api/admin", adminRoutes(deps));

  app.notFound((c) => c.json({ error: "No encontrado" }, 404));
  app.onError((e, c) => {
    if (e instanceof ZodError) return c.json({ error: "Datos inválidos", fields: fieldsOf(e) }, 400);
    if (e instanceof HttpError) return c.json({ error: e.message }, e.status);
    const status = (e as { status?: number }).status;
    if (status === 404 || status === 409 || status === 422) return c.json({ error: e.message }, status);
    console.error(e);
    return c.json({ error: "Error interno" }, 500);
  });
  return app;
}
