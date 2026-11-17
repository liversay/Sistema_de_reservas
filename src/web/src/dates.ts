/** Fecha local del navegador en formato YYYY-MM-DD. */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseIso(date: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function nextDays(count: number, from = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    return isoDate(d);
  });
}

const WEEKDAY = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAY_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function shortWeekday(date: string): string {
  return WEEKDAY[parseIso(date).getDay()]!;
}

/** "jueves 19 nov" */
export function longDate(date: string): string {
  const d = parseIso(date);
  return `${WEEKDAY_LONG[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

export function durationLabel(min: number): string {
  return min === 60 ? "1 h" : min === 90 ? "1 h 30" : "2 h";
}
