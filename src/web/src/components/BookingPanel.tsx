import { fromSlot, priceFor, type Duration } from "../shared";
import type { CourtAvailability } from "../api";
import { durationLabel, longDate } from "../dates";
import { courtMeta, shortName } from "./AvailabilityGrid";
import { AlertIcon } from "./Icons";

interface Props {
  court: CourtAvailability | undefined;
  slot: number | null;
  date: string;
  duration: Duration;
  fits: boolean;
  loggedIn: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onLogin: () => void;
}

/**
 * Panel "Tu reserva". En escritorio es una tarjeta lateral; en móvil se muestra como barra fija
 * inferior (las dos variantes se alternan con CSS, `display: none` las saca también del árbol
 * de accesibilidad).
 */
export function BookingPanel({ court, slot, date, duration, fits, loggedIn, submitting, onConfirm, onLogin }: Props) {
  const sel = court && slot !== null ? { court, slot } : null;
  const start = sel ? fromSlot(sel.slot) : "";
  const end = sel ? fromSlot(sel.slot + duration / 30) : "";
  const price = court ? priceFor(court.prices, duration) : null;
  const canBook = !!sel && fits && !submitting;

  const cta = (compact: boolean) =>
    loggedIn ? (
      <button type="button" className={`btn btn-primary${compact ? "" : " btn-block"}`} disabled={!canBook} onClick={onConfirm}>
        {submitting ? "Reservando…" : compact ? "Reservar" : "Confirmar reserva"}
      </button>
    ) : (
      <button type="button" className={`btn btn-primary${compact ? "" : " btn-block"}`} disabled={!sel || !fits} onClick={onLogin}>
        Ingresa para reservar
      </button>
    );

  return (
    <>
      <aside className="panel" aria-labelledby="panel-title">
        <h2 id="panel-title" className="panel-title">
          Tu reserva
        </h2>

        {!sel ? (
          <p className="panel-empty">Toca un bloque libre de la cuadrícula para elegir cancha y hora de inicio.</p>
        ) : (
          <dl className="panel-list">
            <dt>Cancha</dt>
            <dd>{sel.court.name}</dd>
            <dt>Tipo</dt>
            <dd>{courtMeta(sel.court)}</dd>
            <dt>Día</dt>
            <dd className="cap">{longDate(date)}</dd>
            <dt>Hora</dt>
            <dd className="num">
              {start} – {end}
            </dd>
            <dt>Duración</dt>
            <dd>{durationLabel(duration)}</dd>
          </dl>
        )}
        {sel && !fits && (
          <p className="panel-warn">
            <AlertIcon />
            <span>Elige otra hora o una duración más corta.</span>
          </p>
        )}

        <div className="panel-total">
          <span>A pagar al terminar de jugar</span>
          <strong className={`price${sel ? "" : " is-empty"}`}>{sel && price !== null ? `$${price}` : "—"}</strong>
        </div>
        {cta(false)}
        <p className="panel-note">Se paga en el complejo. Puedes cancelar antes de la hora de inicio.</p>
      </aside>

      <div className="bar" role="region" aria-label="Tu reserva">
        <div className="bar-text">
          <div className="bar-title">{sel ? `${shortName(sel.court.name)} · ${start}` : "Elige un bloque libre"}</div>
          <div className={`bar-sub${sel && !fits ? " warn" : ""}`}>
            {!sel
              ? `${durationLabel(duration)} · pagas al terminar`
              : fits
                ? `$${price} · ${durationLabel(duration)} · hasta ${end}`
                : "No cabe en ese horario"}
          </div>
        </div>
        {cta(true)}
      </div>
    </>
  );
}
