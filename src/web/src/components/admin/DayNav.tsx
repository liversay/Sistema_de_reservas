import { addDays, isoDate, longDate } from "../../dates";

/** Navegación por día: anterior, selector de fecha, siguiente y "Hoy". */
export function DayNav({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const today = isoDate(new Date());
  return (
    <div className="daynav" role="group" aria-label="Día">
      <button type="button" className="btn btn-secondary btn-small" onClick={() => onChange(addDays(date, -1))}>
        <span aria-hidden="true">‹</span> Anterior
      </button>
      <label className="daynav-pick">
        <span className="sr-only">Fecha</span>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
        />
      </label>
      <button type="button" className="btn btn-secondary btn-small" onClick={() => onChange(addDays(date, 1))}>
        Siguiente <span aria-hidden="true">›</span>
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        disabled={date === today}
        onClick={() => onChange(today)}
      >
        Hoy
      </button>
      <span className="daynav-label cap" aria-live="polite">
        {longDate(date)}
      </span>
    </div>
  );
}
