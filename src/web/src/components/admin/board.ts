// Lógica pura del tablero del backoffice (CR-02 / RF-20, RF-21): estados, colores y columnas.
import type { AdminBooking, AdminCourt, PaymentMethod } from "../../api";
import { toSlot } from "../../shared";
import { weekdayIndex } from "../../dates";

export type Vista = "reservas" | "pagos";

/** Momento de la reserva respecto de `now`: «Por jugar», «En curso» o «Terminó». */
export type Phase = "por-jugar" | "en-curso" | "termino";

function instant(date: string, hhmm: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [h, min] = hhmm.split(":").map(Number) as [number, number];
  return new Date(y, m - 1, d, h, min).getTime();
}

export function phaseOf(b: AdminBooking, now: Date): Phase {
  // `played` viene de la API (misma regla hasEnded); el inicio se calcula con la hora local.
  if (b.played || instant(b.date, b.endTime) <= now.getTime()) return "termino";
  return instant(b.date, b.startTime) <= now.getTime() ? "en-curso" : "por-jugar";
}

export const PHASE_LABEL: Record<Phase, string> = { "por-jugar": "Por jugar", "en-curso": "En curso", termino: "Terminó" };

/** Estado de la reserva para la pestaña Reservas. */
export type BookingTone = "upcoming" | "live" | "played" | "noshow" | "cancelled";

export function bookingTone(b: AdminBooking, now: Date): BookingTone {
  if (b.status === "cancelada") return "cancelled";
  if (b.status === "no_show") return "noshow";
  const p = phaseOf(b, now);
  return p === "termino" ? "played" : p === "en-curso" ? "live" : "upcoming";
}

export const TONE_LABEL: Record<BookingTone, string> = {
  upcoming: "Confirmada",
  live: "En curso",
  played: "Jugada",
  noshow: "No se presentó",
  cancelled: "Cancelada",
};

/** Estado de cobro para la pestaña Pagos: pagado / por cobrar / no aplica. */
export type PayTone = "paid" | "due" | "na";

export function payTone(b: AdminBooking, now: Date): PayTone {
  if (b.payment.status === "pagado") return "paid";
  if (b.status === "confirmada" && phaseOf(b, now) === "termino") return "due";
  return "na";
}

export const PAY_LABEL: Record<PayTone, string> = { paid: "Pagado", due: "Por cobrar", na: "No aplica" };

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  yappy: "Yappy",
  transferencia: "Transferencia",
};
export const METHOD_ORDER: PaymentMethod[] = ["efectivo", "tarjeta", "yappy", "transferencia"];

export function clientOf(b: AdminBooking): { name: string; phone: string; guest: boolean } {
  return b.guest ? { ...b.guest, guest: true } : { name: b.user?.name ?? "", phone: b.user?.phone ?? "", guest: false };
}

/** "Ana María Gómez" → "Ana G."; un solo nombre queda igual. */
export function shortPerson(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

/** Bloques de 30 min (índices) que abren las canchas activas ese día: [desde, hasta). */
export function dayRange(courts: AdminCourt[], date: string): { from: number; to: number } | null {
  const wd = weekdayIndex(date);
  let from = Infinity;
  let to = -Infinity;
  for (const c of courts) {
    const d = c.schedule.find((s) => s.weekday === wd);
    if (!d || d.closed) continue;
    from = Math.min(from, toSlot(d.open));
    to = Math.max(to, toSlot(d.close));
  }
  return Number.isFinite(from) && to > from ? { from, to } : null;
}

/** Horario de una cancha ese día como índices de bloque, o null si cierra. */
export function courtHours(c: AdminCourt, date: string): { open: number; close: number } | null {
  const d = c.schedule.find((s) => s.weekday === weekdayIndex(date));
  return d && !d.closed ? { open: toSlot(d.open), close: toSlot(d.close) } : null;
}

export function startSlotOf(b: AdminBooking): number {
  return toSlot(b.startTime);
}
