import { test as base, expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { MongoClient } from "mongodb";

export { expect };

export const CONFLICT = "Ese horario ya fue tomado. Elige otro.";
export const ADMIN = { email: "admin@canchas.local", password: "admin12345" };
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://127.0.0.1:27027/?replicaSet=rs0";
const E2E_DB = "canchas_e2e";

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha local YYYY-MM-DD, `offset` días desde hoy (el navegador y la API usan la hora local). */
export function dayOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Primer día dentro de la tira de 7 días (mañana en adelante) con ese día de la semana (0 = domingo). */
export function nextWeekday(jsDay: number): string {
  for (let i = 1; i <= 7; i++) {
    const [y, m, d] = dayOffset(i).split("-").map(Number) as [number, number, number];
    if (new Date(y, m - 1, d).getDay() === jsDay) return dayOffset(i);
  }
  throw new Error("unreachable");
}

let counter = 0;
export function newUser(tag = "u") {
  counter += 1;
  const stamp = `${Date.now()}${counter}`;
  return { name: `Cliente ${tag}`, email: `${tag}-${stamp}@prueba.local`, phone: "+593 99 123 4567", password: "clave12345" };
}

/** Crea una cuenta por la API y deja la sesión (cookie) en el contexto. */
export async function registerViaApi(context: BrowserContext, tag = "u") {
  const user = newUser(tag);
  const res = await context.request.post("/api/auth/register", { data: user });
  expect(res.status(), await res.text()).toBe(201);
  return user;
}

export async function loginAdmin(context: BrowserContext) {
  const res = await context.request.post("/api/auth/login", { data: ADMIN });
  expect(res.status(), await res.text()).toBe(200);
}

export const gridUrl = (date: string, extra = "") => `/?fecha=${date}${extra}`;
export const freeCell = (page: Page, court: string, time: string) =>
  page.getByRole("button", { name: `${court} ${time} libre`, exact: true });
export const cell = (page: Page, court: string, time: string, state: "libre" | "ocupado" | "cerrado" | "ya pasó") =>
  page.getByLabel(`${court} ${time} ${state}`, { exact: true });

/** Reserva por la API (sesión del contexto dado) y devuelve la reserva. */
export async function bookViaApi(
  request: APIRequestContext,
  b: { courtId: string; date: string; startTime: string; durationMin: 60 | 90 | 120 },
) {
  const res = await request.post("/api/bookings", { data: b });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string };
}

/**
 * Reserva en el PASADO (ayer o antes; con `daysAgo` negativo, en el futuro). La API rechaza turnos pasados (RN-05) y el reloj no se puede
 * adelantar en un servidor real, así que el fixture escribe directo en MongoDB `canchas_e2e`, con la
 * misma forma que `createBooking` (src/api/bookings/service.ts): una reserva `confirmada` con pago
 * `pendiente` y un `slot_lock` por (espacio × bloque). Es la única forma de llegar a "jugada".
 */
export async function seedPastBooking(opts: {
  courtId: string;
  spaceIds: string[];
  daysAgo: number;
  startSlot: number; // bloques de 30 min desde 00:00 (36 = 18:00)
  durationMin?: 60 | 90 | 120;
  price: number;
  guest?: { name: string; phone: string };
  userId?: string;
  /** CR-01: la agrega a una serie existente (p. ej. una ocurrencia ya jugada de una serie real). */
  seriesId?: string;
}): Promise<{ id: string; date: string }> {
  const durationMin = opts.durationMin ?? 60;
  const date = dayOffset(-opts.daysAgo);
  const id = crypto.randomUUID();
  const client = new MongoClient(MONGO_URL);
  try {
    await client.connect();
    const db = client.db(E2E_DB);
    await db.collection("bookings").insertOne({
      _id: id as never,
      courtId: opts.courtId,
      ...(opts.userId ? { userId: opts.userId } : { guest: opts.guest }),
      createdBy: opts.userId ? "client" : "admin",
      ...(opts.seriesId ? { seriesId: opts.seriesId } : {}),
      date,
      startSlot: opts.startSlot,
      durationMin,
      spaceIds: opts.spaceIds,
      price: opts.price,
      status: "confirmada",
      payment: { status: "pendiente" },
      createdAt: new Date().toISOString(),
    });
    const locks = opts.spaceIds.flatMap((spaceId) =>
      Array.from({ length: durationMin / 30 }, (_, i) => ({ spaceId, date, slot: opts.startSlot + i, bookingId: id })),
    );
    await db.collection("slot_locks").insertMany(locks);
  } finally {
    await client.close();
  }
  return { id, date };
}

export const BASE_URL = "http://localhost:5173";
/** Contexto de navegador independiente (otra sesión) para escenarios de dos usuarios. */
export const newContext = (browser: import("@playwright/test").Browser) => browser.newContext({ baseURL: BASE_URL });

export const test = base;
