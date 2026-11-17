import { fromSlot, priceFor, type Duration } from "../shared";
import type { CourtAvailability, Guest } from "../api";
import { durationLabel, money } from "../dates";
import { formatLongDate, formatTime12 } from "../format";
import { discounted } from "../loyalty";
import { courtMeta, shortName } from "./AvailabilityGrid";
import { AlertIcon } from "./Icons";
import { RepeatOption } from "./RepeatOption";

export type GuestField = keyof Guest;

interface Props {
  court: CourtAvailability | undefined;
  slot: number | null;
  date: string;
  duration: Duration;
  fits: boolean;
  /** Sesión de cliente: es socio y recibe descuento; sin sesión se reserva como invitado. */
  member: boolean;
  /** % de descuento de socios (null mientras carga). */
  loyaltyPct: number | null;
  guest: Guest;
  guestErrors: Partial<Record<GuestField, string>>;
  onGuest: (g: Guest) => void;
  submitting: boolean;
  repeat: boolean;
  weeks: number;
  /** Máximo de semanas que respeta el horizonte de 30 días desde la fecha elegida. */
  maxWeeks: number;
  horizonDate: string;
  onRepeat: (v: boolean) => void;
  onWeeks: (n: number) => void;
  onConfirm: () => void;
  onLogin: () => void;
}

/**
 * Panel "Tu reserva". En escritorio es una tarjeta lateral; en móvil se muestra como barra fija
 * inferior (las dos variantes se alternan con CSS, `display: none` las saca también del árbol
 * de accesibilidad).
 */
export function BookingPanel({
  court, slot, date, duration, fits, member, loyaltyPct, guest, guestErrors, onGuest, submitting,
  repeat, weeks, maxWeeks, horizonDate, onRepeat, onWeeks, onConfirm, onLogin,
}: Props) {
  const sel = court && slot !== null ? { court, slot } : null;
  const start = sel ? fromSlot(sel.slot) : "";
  const end = sel ? fromSlot(sel.slot + duration / 30) : "";
  const base = court ? priceFor(court.prices, duration) : null;
  const pct = member && loyaltyPct ? loyaltyPct : 0;
  const price = base !== null ? discounted(base, pct) : null;
  const n = repeat ? weeks : 1;
  const canBook = !!sel && fits && !submitting;

  const cta = (compact: boolean) => (
    <button type="button" className={`btn btn-primary${compact ? "" : " btn-block"}`} disabled={!canBook} onClick={onConfirm}>
      {submitting ? "Reservando…" : repeat ? (compact ? `Reservar ${weeks}` : `Confirmar ${weeks} reservas`) : compact ? "Reservar" : "Confirmar reserva"}
    </button>
  );

  const repeatProps = { date: sel ? date : "", price: sel ? price : null, repeat, weeks, maxWeeks, horizonDate, onRepeat, onWeeks };

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
            <dd className="cap">{formatLongDate(date)}</dd>
            <dt>Hora</dt>
            <dd className="num">
              {formatTime12(start)} – {formatTime12(end)}
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

        {!member && (
          <div className="guest-fields" data-testid="datos-invitado">
            <p className="guest-title">Tus datos</p>
            <label className={`field${guestErrors.name ? " has-error" : ""}`}>
              <span className="field-label">Nombre</span>
              <input
                type="text"
                name="guest-name"
                data-testid="invitado-nombre"
                autoComplete="name"
                required
                aria-invalid={!!guestErrors.name}
                aria-describedby={guestErrors.name ? "guest-name-err" : undefined}
                value={guest.name}
                onChange={(e) => onGuest({ ...guest, name: e.target.value })}
              />
              {guestErrors.name && (
                <span id="guest-name-err" className="field-error">
                  {guestErrors.name}
                </span>
              )}
            </label>
            <label className={`field${guestErrors.phone ? " has-error" : ""}`}>
              <span className="field-label">Teléfono</span>
              <input
                type="tel"
                name="guest-phone"
                data-testid="invitado-telefono"
                autoComplete="tel"
                inputMode="tel"
                required
                aria-invalid={!!guestErrors.phone}
                aria-describedby={guestErrors.phone ? "guest-phone-err" : "guest-phone-hint"}
                value={guest.phone}
                onChange={(e) => onGuest({ ...guest, phone: e.target.value })}
              />
              {guestErrors.phone ? (
                <span id="guest-phone-err" className="field-error">
                  {guestErrors.phone}
                </span>
              ) : (
                <span id="guest-phone-hint" className="field-hint">
                  Para avisarte si hay cambios. Ej.: +507 6000 1234
                </span>
              )}
            </label>
            <p className="guest-login">
              ¿Ya eres socio?{" "}
              <button type="button" className="linklike" onClick={onLogin}>
                Ingresa
              </button>
              {loyaltyPct ? ` y ahorra ${loyaltyPct} %.` : "."}
            </p>
          </div>
        )}

        <RepeatOption {...repeatProps} />

        {member && pct > 0 && (
          <p className="member-badge" data-testid="socio-descuento">
            Socio: −{pct} %
          </p>
        )}
        <div className="panel-total">
          <span>{repeat ? "Total de la serie (se paga por partido)" : "A pagar al terminar de jugar"}</span>
          <span className="price-stack">
            {sel && base !== null && pct > 0 && (
              <s className="price-old" data-testid="precio-base">
                {money(base * n)}
              </s>
            )}
            <strong className={`price${sel ? "" : " is-empty"}`} data-testid="precio-final">
              {sel && price !== null ? money(price * n) : "—"}
            </strong>
          </span>
        </div>
        {cta(false)}
        <p className="panel-note">
          {member
            ? "Se paga en el complejo. Puedes cancelar antes de la hora de inicio."
            : "Se paga en el complejo. Para cancelar llama al complejo."}
        </p>
      </aside>

      <div className="bar" role="region" aria-label="Tu reserva">
        {!member && sel && (
          <div className="bar-guest">
            <input
              type="text"
              aria-label="Nombre"
              placeholder="Nombre"
              data-testid="barra-nombre"
              autoComplete="name"
              aria-invalid={!!guestErrors.name}
              value={guest.name}
              onChange={(e) => onGuest({ ...guest, name: e.target.value })}
            />
            <input
              type="tel"
              aria-label="Teléfono"
              placeholder="Teléfono"
              data-testid="barra-telefono"
              autoComplete="tel"
              inputMode="tel"
              aria-invalid={!!guestErrors.phone}
              value={guest.phone}
              onChange={(e) => onGuest({ ...guest, phone: e.target.value })}
            />
            {(guestErrors.name || guestErrors.phone) && (
              <p className="field-error" role="alert">
                {guestErrors.name ?? guestErrors.phone}
              </p>
            )}
          </div>
        )}
        <RepeatOption compact {...repeatProps} />
        <div className="bar-text">
          <div className="bar-title">{sel ? `${shortName(sel.court.name)} · ${formatTime12(start)}` : "Elige un bloque libre"}</div>
          <div className={`bar-sub${sel && !fits ? " warn" : ""}`}>
            {!sel
              ? `${durationLabel(duration)} · pagas al terminar`
              : fits
                ? `${pct > 0 ? `Socio −${pct} % · ` : ""}${money(price! * n)} · ${durationLabel(duration)} · hasta ${formatTime12(end)}`
                : "No cabe en ese horario"}
          </div>
        </div>
        {cta(true)}
      </div>
    </>
  );
}
