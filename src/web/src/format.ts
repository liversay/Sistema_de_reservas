// Formato de presentación (CR-02 / RF-22). La API sigue usando HH:MM de 24 h y YYYY-MM-DD.

/** "20:00" → "8:00 p. m.", "12:00" → "12:00 p. m.", "00:30" → "12:30 a. m.". */
export function formatTime12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${h < 12 ? "a. m." : "p. m."}`;
}

/** "08:00","09:30" → "8:00 a. m. – 9:30 a. m.". */
export function formatRange12(start: string, end: string): string {
  return `${formatTime12(start)} – ${formatTime12(end)}`;
}

const WEEKDAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-11-12" → "jueves 12 de noviembre de 2026". */
export function formatLongDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} de ${MONTH[d.getMonth()]} de ${d.getFullYear()}`;
}
