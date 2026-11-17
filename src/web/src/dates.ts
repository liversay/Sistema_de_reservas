/** Fecha local del navegador en formato YYYY-MM-DD. */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseIso(date: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** RN-14: se puede reservar hasta hoy + 30 días (31 días contando hoy). */
export const HORIZON_DAYS = 30;

/** Diferencia en días enteros (b − a) entre dos fechas YYYY-MM-DD. */
export function diffDays(a: string, b: string): number {
  const x = parseIso(a);
  const y = parseIso(b);
  return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 86400000);
}

export function nextDays(count: number, from = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    return isoDate(d);
  });
}

const WEEKDAY = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function shortWeekday(date: string): string {
  return WEEKDAY[parseIso(date).getDay()]!;
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** Horas en pasos de 30 min (00:00 … 23:30). */
export function timeOptions(): string[] {
  return TIME_OPTIONS;
}

/** Lunes = 0, como el esquema de horarios de la API. */
export const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function addDays(date: string, n: number): string {
  const d = parseIso(date);
  return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Lunes = 0 para una fecha YYYY-MM-DD. */
export function weekdayIndex(date: string): number {
  return (parseIso(date).getDay() + 6) % 7;
}

export function money(n: number): string {
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

export function durationLabel(min: number): string {
  return min === 60 ? "1 h" : min === 90 ? "1 h 30" : "2 h";
}
