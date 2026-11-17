import type { Duration } from "./types";

export const DURATIONS = [60, 90, 120] as const;

/** "20:00" → 40 (bloques de 30 min desde 00:00). */
export function toSlot(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Hora inválida: ${hhmm}`);
  return Number(m[1]) * 2 + Math.floor(Number(m[2]) / 30);
}

export function fromSlot(slot: number): string {
  const h = Math.floor(slot / 2);
  const min = slot % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${min}`;
}

export function slotsFor(startSlot: number, durationMin: Duration): number[] {
  return Array.from({ length: durationMin / 30 }, (_, i) => startSlot + i);
}

/** Valida que `date` sea un día real con formato YYYY-MM-DD. */
export function isRealDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 0 = lunes … 6 = domingo. */
export function weekdayOf(date: string): number {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const js = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // 0 = domingo
  return (js + 6) % 7;
}

/** Suma `n` días a una fecha YYYY-MM-DD (calendario, sin zona horaria). */
export function addDays(date: string, n: number): string {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

/** Días de calendario entre dos fechas YYYY-MM-DD (to − from). */
export function daysBetween(from: string, to: string): number {
  const p = (s: string) => {
    const [y, mo, d] = s.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, mo - 1, d);
  };
  return Math.round((p(to) - p(from)) / 86_400_000);
}

/** Fecha local (YYYY-MM-DD) de un instante: «hoy» para RN-14. */
export function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
