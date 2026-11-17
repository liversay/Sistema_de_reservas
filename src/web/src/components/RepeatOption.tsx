import { useId } from "react";
import { addDays, longDate, money } from "../dates";

export const MIN_WEEKS = 2;
export const MAX_WEEKS = 8;

interface Props {
  /** Fecha de la 1.ª ocurrencia (YYYY-MM-DD); vacía si aún no hay selección. */
  date: string;
  /** Precio de una ocurrencia; null si aún no se conoce. */
  price: number | null;
  repeat: boolean;
  weeks: number;
  onRepeat: (v: boolean) => void;
  onWeeks: (n: number) => void;
  /** En la barra móvil solo se muestra el resumen corto. */
  compact?: boolean;
}

/** CR-01 / RF-15: casilla "Repetir cada semana" + selector de semanas con fechas y total. */
export function RepeatOption({ date, price, repeat, weeks, onRepeat, onWeeks, compact }: Props) {
  const id = useId();
  const dates = date ? Array.from({ length: weeks }, (_, k) => addDays(date, 7 * k)) : [];
  const total = price === null ? null : price * weeks;
  return (
    <div className={`repeat${compact ? " repeat-compact" : ""}`} data-testid={compact ? "repetir-compacto" : "repetir"}>
      <label className="repeat-check" htmlFor={`${id}-chk`}>
        <input id={`${id}-chk`} type="checkbox" checked={repeat} onChange={(e) => onRepeat(e.target.checked)} />
        <span>Repetir cada semana</span>
      </label>
      {repeat && (
        <>
          <label className="repeat-weeks" htmlFor={`${id}-weeks`}>
            <span>Semanas</span>
            <select id={`${id}-weeks`} value={weeks} onChange={(e) => onWeeks(Number(e.target.value))}>
              {Array.from({ length: MAX_WEEKS - MIN_WEEKS + 1 }, (_, i) => MIN_WEEKS + i).map((n) => (
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
                  {longDate(d)}
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
