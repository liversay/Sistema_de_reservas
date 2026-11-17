import { useEffect, useState } from "react";
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
  const compactView = useMedia("(max-width: 960px)");
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

        {!member && !compactView && <GuestFields variant="panel" guest={guest} errors={guestErrors} onGuest={onGuest} loyaltyPct={loyaltyPct} onLogin={onLogin} />}

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
        {!member && sel && compactView && <GuestFields variant="bar" guest={guest} errors={guestErrors} onGuest={onGuest} loyaltyPct={loyaltyPct} onLogin={onLogin} />}
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

/** Coincide con el breakpoint de CSS donde el panel lateral pasa a barra inferior. */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const h = () => setOn(m.matches);
    m.addEventListener("change", h);
    h();
    return () => m.removeEventListener("change", h);
  }, [query]);
  return on;
}

/**
 * Nombre y teléfono del invitado. Solo se renderiza la variante visible (panel o barra móvil),
 * así no hay ids ni campos duplicados en el DOM.
 */
function GuestFields({
  variant, guest, errors, onGuest, loyaltyPct, onLogin,
}: {
  variant: "panel" | "bar";
  guest: Guest;
  errors: Partial<Record<GuestField, string>>;
  onGuest: (g: Guest) => void;
  loyaltyPct: number | null;
  onLogin: () => void;
}) {
  const bar = variant === "bar";
  const id = (f: string) => `guest-${variant}-${f}`;
  const field = (f: GuestField, label: string, type: string, auto: string, hint?: string) => {
    const err = errors[f];
    const describedBy = err ? id(`${f}-err`) : hint ? id(`${f}-hint`) : undefined;
    return (
      <div className={`field${err ? " has-error" : ""}`}>
        <label className="field-label" htmlFor={id(f)}>
          {label}
        </label>
        <input
          id={id(f)}
          type={type}
          name={`guest-${f}`}
          autoComplete={auto}
          inputMode={f === "phone" ? "tel" : undefined}
          required
          data-guest={f}
          data-testid={bar ? `barra-${f === "name" ? "nombre" : "telefono"}` : `invitado-${f === "name" ? "nombre" : "telefono"}`}
          aria-invalid={!!err}
          aria-describedby={describedBy}
          value={guest[f]}
          onChange={(e) => onGuest({ ...guest, [f]: e.target.value })}
        />
        {err ? (
          <span id={id(`${f}-err`)} className="field-error" role="alert">
            {err}
          </span>
        ) : (
          hint && (
            <span id={id(`${f}-hint`)} className="field-hint">
              {hint}
            </span>
          )
        )}
      </div>
    );
  };
  return (
    <div className={bar ? "bar-guest" : "guest-fields"} data-testid={bar ? "datos-invitado-barra" : "datos-invitado"}>
      {!bar && <p className="guest-title">Tus datos</p>}
      {field("name", "Nombre", "text", "name")}
      {field("phone", "Teléfono", "tel", "tel", "Para avisarte si hay cambios. Ej.: +507 6000 1234")}
      {!bar && (
        <p className="guest-login">
          ¿Ya eres socio?{" "}
          <button type="button" className="linklike" onClick={onLogin}>
            Ingresa
          </button>
          {loyaltyPct ? ` y ahorra ${loyaltyPct} %.` : "."}
        </p>
      )}
    </div>
  );
}
