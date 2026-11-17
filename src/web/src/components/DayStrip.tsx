import { useEffect, useId, useRef } from "react";
import { parseIso, shortWeekday } from "../dates";
import { formatLongDate } from "../format";

const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * CR-02 / RF-19: 31 días desde hoy (desplazable) + selector de fecha nativo limitado a [hoy, hoy + 30].
 * `days[0]` es hoy y `days[days.length - 1]` el último día reservable.
 */
export function DayStrip({ days, value, onChange }: { days: string[]; value: string; onChange: (d: string) => void }) {
  const id = useId();
  const strip = useRef<HTMLDivElement>(null);
  const min = days[0]!;
  const max = days[days.length - 1]!;

  // Lleva el día elegido a la vista cuando cambia desde el selector de fecha o la URL.
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(".day.is-on");
    const box = strip.current;
    if (!el || !box) return;
    if (el.offsetLeft < box.scrollLeft || el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollLeft = Math.max(0, el.offsetLeft - 16);
    }
  }, [value]);

  return (
    <div className="daynav">
      <div className="daystrip-head">
        <label className="datepick" htmlFor={`${id}-date`}>
          <span>Otro día</span>
          <input
            id={`${id}-date`}
            type="date"
            min={min}
            max={max}
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              if (v >= min && v <= max) onChange(v);
            }}
          />
        </label>
        <span className="daystrip-hint">Puedes reservar hasta {formatLongDate(max)}.</span>
      </div>
      <div className="daystrip" role="group" aria-label="Día" ref={strip}>
        {days.map((d, i) => {
          const on = d === value;
          const w = i === 0 ? "Hoy" : shortWeekday(d);
          const dt = parseIso(d);
          const n = dt.getDate();
          const firstOfMonth = i === 0 || n === 1;
          return (
            <button
              key={d}
              type="button"
              className={`day${on ? " is-on" : ""}`}
              aria-pressed={on}
              aria-label={`${i === 0 ? "Hoy, " : ""}${formatLongDate(d)}`}
              data-day={d}
              onClick={() => onChange(d)}
            >
              <span className="day-w">{w}</span>
              <span className="day-n">{n}</span>
              <span className="day-m">{firstOfMonth ? MONTH_SHORT[dt.getMonth()] : ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
