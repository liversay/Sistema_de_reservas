import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import type { Db } from "mongodb";
import type { User } from "@canchas/shared";

export type AppEnv = {
  Variables: { user: User; now: Date };
};

export const SESSION_COOKIE = "sid";

export class HttpError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export function publicUser(u: User) {
  return { id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role };
}

export async function startSession(c: Context, secret: string, userId: string) {
  await setSignedCookie(c, SESSION_COOKIE, userId, secret, { httpOnly: true, sameSite: "Lax", path: "/" });
}

export function endSession(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Firma inválida o usuario inexistente se tratan como sin sesión. El rol se lee de la BD en cada petición. */
export function requireUser(db: Db, secret: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const sid = await getSignedCookie(c, secret, SESSION_COOKIE);
    const user = sid ? await db.collection<User>("users").findOne({ _id: sid }) : null;
    if (!user) throw new HttpError(401, "Inicia sesión para continuar.");
    c.set("user", user);
    await next();
  };
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user").role !== "admin") throw new HttpError(403, "Solo administradores.");
  await next();
};
