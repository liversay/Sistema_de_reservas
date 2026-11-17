import { Hono } from "hono";
import { MongoServerError } from "mongodb";
import type { Db } from "mongodb";
import { LoginInput, RegisterInput, isRealDate, type User } from "@canchas/shared";
import { getAvailability } from "../availability";
import { HttpError, publicUser, requireUser, startSession, endSession, type AppEnv } from "../auth";
import { ConflictError } from "../errors";
import { readBody } from "../http";
import { getLoyaltyPct } from "../settings";

export function publicRoutes(deps: { db: Db; secret: string }) {
  const r = new Hono<AppEnv>();
  const users = () => deps.db.collection<User>("users");

  r.get("/availability", async (c) => {
    const date = c.req.query("date");
    if (!date || !isRealDate(date)) {
      return c.json({ error: "Datos inválidos", fields: { date: "Fecha inválida (YYYY-MM-DD)" } }, 400);
    }
    return c.json(await getAvailability(deps.db, date, c.get("now")));
  });

  r.get("/settings/loyalty", async (c) => c.json({ discountPct: await getLoyaltyPct(deps.db) }));

  r.post("/auth/register", async (c) => {
    const input = RegisterInput.parse(await readBody(c));
    const user: User = {
      _id: crypto.randomUUID(),
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone,
      passwordHash: await Bun.password.hash(input.password),
      role: "client",
    };
    try {
      await users().insertOne(user);
    } catch (e) {
      if (e instanceof MongoServerError && e.code === 11000) throw new ConflictError("Ese email ya está registrado.");
      throw e;
    }
    await startSession(c, deps.secret, user._id, c.get("now"));
    return c.json(publicUser(user), 201);
  });

  r.post("/auth/login", async (c) => {
    const input = LoginInput.parse(await readBody(c));
    const user = await users().findOne({ email: input.email.toLowerCase() });
    const ok = user ? await Bun.password.verify(input.password, user.passwordHash) : false;
    if (!user || !ok) throw new HttpError(401, "Credenciales inválidas.");
    await startSession(c, deps.secret, user._id, c.get("now"));
    return c.json(publicUser(user));
  });

  r.post("/auth/logout", (c) => {
    endSession(c);
    return c.body(null, 204);
  });

  r.get("/auth/me", requireUser(deps.db, deps.secret), (c) => c.json(publicUser(c.get("user"))));

  return r;
}
