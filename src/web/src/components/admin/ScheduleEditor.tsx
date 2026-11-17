import type { ScheduleDay } from "../../api";
import { timeOptions, WEEKDAYS } from "../../dates";
import { formatTime12 } from "../../format";

export function defaultSchedule(): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, weekday) => ({ weekday, open: "16:00", close: "23:00", closed: false }));
}

/** Errores por día: abrir debe ser antes de cerrar cuando el día está abierto. */
export function scheduleErrors(s: ScheduleDay[]): Record<number, string> {
  const out: Record<number, string> = {};
  for (const d of s) if (!d.closed && d.open >= d.close) out[d.weekday] = "Abre debe ser antes de cierra.";
  return out;
}

function Options({ value }: { value: string }) {
  const all = timeOptions();
  return (
    <>
      {!all.includes(value) && <option value={value}>{formatTime12(value)}</option>}
      {all.map((t) => (
        <option key={t} value={t}>
          {formatTime12(t)}
        </option>
      ))}
    </>
  );
}

/** Horario semanal: 7 filas con interruptor de abierto, abre y cierra en pasos de 30 min. */
export function ScheduleEditor({
  value,
  onChange,
  idPrefix,
}: {
  value: ScheduleDay[];
  onChange: (v: ScheduleDay[]) => void;
  idPrefix: string;
}) {
  const errors = scheduleErrors(value);
  const rows = [...value].sort((a, b) => a.weekday - b.weekday);
  const patch = (weekday: number, p: Partial<ScheduleDay>) =>
    onChange(value.map((d) => (d.weekday === weekday ? { ...d, ...p } : d)));

  return (
    <div className="schedule-scroll" role="region" aria-label="Horario semanal" tabIndex={0}>
      <table className="schedule">
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col">Abierto</th>
            <th scope="col">Abre</th>
            <th scope="col">Cierra</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const name = WEEKDAYS[d.weekday]!;
            const err = errors[d.weekday];
            return (
              <tr key={d.weekday}>
                <th scope="row">{name}</th>
                <td>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!d.closed}
                    aria-label={`Abierto ${name}`}
                    className="switch"
                    onClick={() => patch(d.weekday, { closed: !d.closed })}
                  >
                    <span className="switch-knob" />
                  </button>
                </td>
                {d.closed ? (
                  <td colSpan={2} className="muted">
                    Cerrado
                  </td>
                ) : (
                  <>
                    <td>
                      <select
                        id={`${idPrefix}-open-${d.weekday}`}
                        className="time-select"
                        aria-label={`Abre ${name}`}
                        aria-invalid={err ? true : undefined}
                        value={d.open}
                        onChange={(e) => patch(d.weekday, { open: e.target.value })}
                      >
                        <Options value={d.open} />
                      </select>
                    </td>
                    <td>
                      <select
                        className="time-select"
                        aria-label={`Cierra ${name}`}
                        aria-invalid={err ? true : undefined}
                        aria-describedby={err ? `${idPrefix}-err-${d.weekday}` : undefined}
                        value={d.close}
                        onChange={(e) => patch(d.weekday, { close: e.target.value })}
                      >
                        <Options value={d.close} />
                      </select>
                      {err && (
                        <span className="field-error" id={`${idPrefix}-err-${d.weekday}`}>
                          {err}
                        </span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
