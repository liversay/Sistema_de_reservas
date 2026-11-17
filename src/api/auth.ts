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

export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;

/** Valor de la cookie: "userId.issuedAtMs". */
export async function startSession(c: Context, secret: string, userId: string, now: Date) {
  await setSignedCookie(c, SESSION_COOKIE, `${userId}.${now.getTime()}`, secret, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
    secure: process.env.NODE_ENV === "production",
  });
}

export function endSession(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Firma inválida o usuario inexistente se tratan como sin sesión. El rol se lee de la BD en cada petición. */
async function sessionUser(db: Db, secret: string, c: Context<AppEnv>): Promise<User | null> {
  const sid = await getSignedCookie(c, secret, SESSION_COOKIE);
  const i = sid ? sid.lastIndexOf(".") : -1;
  const issuedAt = i > 0 ? Number((sid as string).slice(i + 1)) : NaN;
  const fresh = Number.isFinite(issuedAt) && c.get("now").getTime() - issuedAt <= SESSION_MAX_AGE_S * 1000;
  return sid && fresh ? await db.collection<User>("users").findOne({ _id: (sid as string).slice(0, i) }) : null;
}

export function requireUser(db: Db, secret: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = await sessionUser(db, secret, c);
    if (!user) throw new HttpError(401, "Inicia sesión para continuar.");
    c.set("user", user);
    await next();
  };
}

/** CR-02: lee la sesión si existe; sin sesión válida sigue sin `user` (no responde 401). */
export function optionalUser(db: Db, secret: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = await sessionUser(db, secret, c);
    if (user) c.set("user", user);
    await next();
  };
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user").role !== "admin") throw new HttpError(403, "Solo administradores.");
  await next();
};
