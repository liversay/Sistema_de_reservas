import { parseIso, shortWeekday } from "../dates";

export function DayStrip({ days, value, onChange }: { days: string[]; value: string; onChange: (d: string) => void }) {
  return (
    <div className="daystrip" role="group" aria-label="Día">
      {days.map((d, i) => {
        const on = d === value;
        const w = i === 0 ? "Hoy" : shortWeekday(d);
        const n = parseIso(d).getDate();
        return (
          <button
            key={d}
            type="button"
            className={`day${on ? " is-on" : ""}`}
            aria-pressed={on}
            aria-label={`${i === 0 ? "Hoy, " : ""}${shortWeekday(d)} ${n}`}
            onClick={() => onChange(d)}
          >
            <span className="day-w">{w}</span>
            <span className="day-n">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
