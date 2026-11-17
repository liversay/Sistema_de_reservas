import { useEffect, useId, useRef } from "react";
import { addDays, parseIso, shortWeekday } from "../../dates";
import { formatLongDate } from "../../format";

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Tira de 31 días del backoffice (CR-02 / CA-23): mismo aspecto que la del cliente, con un punto en
 * los días que tienen reservas no canceladas (`counts`), día anterior/siguiente, «Hoy» y selector de fecha.
 * A diferencia del cliente, el admin puede ir a días pasados (cobros, historial).
 */
export function AdminDayStrip({
  days,
  value,
  today,
  counts,
  onChange,
}: {
  days: string[];
  value: string;
  today: string;
  counts: Map<string, number> | null;
  onChange: (d: string) => void;
}) {
  const id = useId();
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(".day.is-on");
    const box = strip.current;
    if (!el || !box) return;
    if (el.offsetLeft < box.scrollLeft || el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollLeft = Math.max(0, el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2);
    }
  }, [value, days[0]]);

  return (
    <div className="daynav adaynav">
      <div className="adaynav-head">
        <div className="adaynav-step" role="group" aria-label="Cambiar de día">
          <button type="button" className="step-btn" aria-label="Día anterior" onClick={() => onChange(addDays(value, -1))}>
            ‹
          </button>
          <button type="button" className="step-btn step-today" disabled={value === today} onClick={() => onChange(today)}>
            Hoy
          </button>
          <button type="button" className="step-btn" aria-label="Día siguiente" onClick={() => onChange(addDays(value, 1))}>
            ›
          </button>
        </div>
        <label className="datepick" htmlFor={`${id}-date`}>
          <span>Ir a</span>
          <input
            id={`${id}-date`}
            type="date"
            value={value}
            onChange={(e) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onChange(e.target.value);
            }}
          />
        </label>
        <span className="daystrip-hint">
          <span className="dot-key" aria-hidden="true" /> Días con reservas
        </span>
      </div>
      <div className="daystrip" role="group" aria-label="Día" ref={strip}>
        {days.map((d, i) => {
          const on = d === value;
          const dt = parseIso(d);
          const n = dt.getDate();
          const count = counts?.get(d) ?? 0;
          const isToday = d === today;
          return (
            <button
              key={d}
              type="button"
              className={`day${on ? " is-on" : ""}${isToday ? " is-today" : ""}${d < today ? " is-past" : ""}`}
              aria-pressed={on}
              aria-label={`${isToday ? "Hoy, " : ""}${formatLongDate(d)}${count ? `, ${count} ${count === 1 ? "reserva" : "reservas"}` : ", sin reservas"}`}
              data-day={d}
              onClick={() => onChange(d)}
            >
              <span className="day-w">{isToday ? "Hoy" : shortWeekday(d)}</span>
              <span className="day-n">{n}</span>
              <span className="day-m">{i === 0 || n === 1 ? MONTH_SHORT[dt.getMonth()] : ""}</span>
              <span className={`day-dot${count ? " has" : ""}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
