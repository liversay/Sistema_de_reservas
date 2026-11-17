import type { Duration, Sport } from "./shared";

export type SlotState = "libre" | "ocupado" | "cerrado" | "pasado";
export type Prices = Record<"60" | "90" | "120", number>;

export interface CourtAvailability {
  courtId: string;
  name: string;
  sport: Sport;
  format?: "5vs5" | "7vs7";
  prices: Prices;
  slots: { slot: number; time: string; state: SlotState }[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "client" | "admin";
}

export interface Booking {
  id: string;
  courtId: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMin: Duration;
  price: number;
  status: "confirmada" | "cancelada" | "no_show";
  payment: { status: "pendiente" | "pagado"; amount?: number };
  createdAt: string;
}

/** Error de la API con el cuerpo `{ error, fields? }` de specs/api.md. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const CONFLICT_MESSAGE = "Ese horario ya fue tomado. Elige otro.";

async function request<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init?.method ?? "GET",
      credentials: "include",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
    });
  } catch (e) {
    // Una petición cancelada a propósito no es un error de conexión: se propaga tal cual.
    if (init?.signal?.aborted) throw e;
    throw new ApiError(0, "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const body = data as { error?: string; fields?: Record<string, string> };
    throw new ApiError(res.status, body.error ?? "Algo salió mal. Inténtalo de nuevo.", body.fields);
  }
  return data as T;
}

export const api = {
  availability: (date: string, signal?: AbortSignal) =>
    request<CourtAvailability[]>(`/availability?date=${encodeURIComponent(date)}`, { signal }),
  me: () => request<User>("/auth/me"),
  login: (email: string, password: string) =>
    request<User>("/auth/login", { method: "POST", body: { email, password } }),
  register: (input: { name: string; email: string; phone: string; password: string }) =>
    request<User>("/auth/register", { method: "POST", body: input }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  book: (input: { courtId: string; date: string; startTime: string; durationMin: Duration }) =>
    request<Booking>("/bookings", { method: "POST", body: input }),
  myBookings: () => request<Booking[]>("/bookings/mine"),
  cancel: (id: string) => request<Booking>(`/bookings/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
};
