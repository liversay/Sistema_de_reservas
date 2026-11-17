import { useId } from "react";
import { addDays, money } from "../dates";
import { formatLongDate } from "../format";

export const MIN_WEEKS = 2;
export const MAX_WEEKS = 8;

interface Props {
  /** Fecha de la 1.ª ocurrencia (YYYY-MM-DD); vacía si aún no hay selección. */
  date: string;
  /** Precio de una ocurrencia; null si aún no se conoce. */
  price: number | null;
  repeat: boolean;
  weeks: number;
  /** Semanas máximas para que la última ocurrencia quede dentro de hoy + 30 días (RN-14). */
  maxWeeks: number;
  /** Último día reservable (hoy + 30 días). */
  horizonDate: string;
  onRepeat: (v: boolean) => void;
  onWeeks: (n: number) => void;
  /** En la barra móvil solo se muestra el resumen corto. */
  compact?: boolean;
}

/** CR-01 / RF-15: casilla "Repetir cada semana" + selector de semanas con fechas y total. */
export function RepeatOption({ date, price, repeat, weeks, maxWeeks, horizonDate, onRepeat, onWeeks, compact }: Props) {
  const id = useId();
  const canRepeat = maxWeeks >= MIN_WEEKS;
  const top = Math.min(MAX_WEEKS, Math.max(maxWeeks, MIN_WEEKS));
  const dates = date ? Array.from({ length: weeks }, (_, k) => addDays(date, 7 * k)) : [];
  const total = price === null ? null : price * weeks;
  return (
    <div className={`repeat${compact ? " repeat-compact" : ""}`} data-testid={compact ? "repetir-compacto" : "repetir"}>
      <label className="repeat-check" htmlFor={`${id}-chk`}>
        <input id={`${id}-chk`} type="checkbox" checked={repeat && canRepeat} disabled={!canRepeat} aria-describedby={!canRepeat || maxWeeks < MAX_WEEKS ? `${id}-why` : undefined} onChange={(e) => onRepeat(e.target.checked)} />
        <span>Repetir cada semana</span>
      </label>
      {date && (!canRepeat || maxWeeks < MAX_WEEKS) && (!compact || repeat || !canRepeat) && (
        <p id={`${id}-why`} className="repeat-why" data-testid="serie-limite">
          {canRepeat
            ? `Máximo ${maxWeeks} semanas: se puede reservar hasta ${formatLongDate(horizonDate)} (30 días de anticipación).`
            : `No se puede repetir: la 2.ª semana pasaría del límite de ${formatLongDate(horizonDate)} (30 días de anticipación).`}
        </p>
      )}
      {repeat && canRepeat && (
        <>
          <label className="repeat-weeks" htmlFor={`${id}-weeks`}>
            <span>Semanas</span>
            <select id={`${id}-weeks`} value={weeks} onChange={(e) => onWeeks(Number(e.target.value))}>
              {Array.from({ length: top - MIN_WEEKS + 1 }, (_, i) => MIN_WEEKS + i).map((n) => (
                <option key={n} value={n}>
                  {n} semanas
                </option>
              ))}
            </select>
          </label>
          {!compact && dates.length > 0 && (
            <ul className="repeat-dates" aria-label="Fechas de la serie">
              {dates.map((d) => (
                <li key={d} className="cap">
                  {formatLongDate(d)}
                </li>
              ))}
            </ul>
          )}
          {total !== null && (
            <p className="repeat-total" data-testid="serie-total">
              {weeks} reservas · total <strong>{money(total)}</strong>
            </p>
          )}
        </>
      )}
    </div>
  );
}
