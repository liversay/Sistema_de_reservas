import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, type AdminBooking, type PaymentMethod } from "../../api";
import { durationLabel, money } from "../../dates";
import { formatLongDate, formatRange12 } from "../../format";
import { AlertIcon } from "../Icons";
import { bookingTone, clientOf, METHOD_LABEL, METHOD_ORDER, PAY_LABEL, PHASE_LABEL, payTone, phaseOf, TONE_LABEL } from "./board";

export type CardAction = "pay" | "noshow" | "cancel" | "series";

const CARD_W = 344;
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Posición fija junto a la barra: debajo si cabe, si no arriba; siempre dentro de la ventana. */
function place(anchor: DOMRect, h: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(Math.max(12, anchor.left), vw - CARD_W - 12);
  const below = anchor.bottom + 8;
  const top = below + h <= vh - 12 ? below : Math.max(12, anchor.top - 8 - h);
  return { left, top };
}

/**
 * Tarjeta de detalle de una reserva (CR-02 / CA-23): popover junto a la barra (cursor, foco o toque);
 * en pantallas angostas se muestra como hoja inferior. `role="dialog"`, Esc cierra y devuelve el foco.
 */
export function BookingCard({
  booking: b,
  anchor,
  pinned,
  sheet,
  now,
  onClose,
  onPin,
  onHoverChange,
  onAction,
}: {
  booking: AdminBooking;
  anchor: HTMLElement | null;
  pinned: boolean;
  sheet: boolean;
  now: Date;
  onClose: (returnFocus: boolean) => void;
  onPin: () => void;
  onHoverChange: (inside: boolean) => void;
  /** Ejecuta la acción; resuelve con el mensaje de éxito o lanza ApiError. */
  onAction: (action: CardAction, input?: { amount: number; method: PaymentMethod }) => Promise<void>;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [mode, setMode] = useState<"view" | "pay" | CardAction>("view");
  const [amount, setAmount] = useState(String(b.price));
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const c = clientOf(b);
  const tone = bookingTone(b, now);
  const pay = payTone(b, now);
  const phase = phaseOf(b, now);
  const confirmed = b.status === "confirmada";
  const canCharge = confirmed && phase === "termino" && b.payment.status === "pendiente";
  const notStarted = confirmed && phase === "por-jugar";
  const discount = (b.discountPct ?? 0) > 0 && b.basePrice !== undefined;

  // Reposiciona junto a la barra (también al desplazar el tablero o la página).
  useLayoutEffect(() => {
    if (sheet) return setPos(null);
    const update = () => {
      if (!anchor || !box.current || !anchor.isConnected) return;
      setPos(place(anchor.getBoundingClientRect(), box.current.offsetHeight));
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor, sheet, mode, b.id, error]);

  // Al fijarla (clic, toque o Enter) el foco entra en la tarjeta.
  useEffect(() => {
    if (pinned) box.current?.focus();
  }, [pinned]);

  useEffect(() => {
    setMode("view");
    setError(null);
    setAmount(String(b.price));
    setAmountError(null);
  }, [b.id, b.price]);

  async function run(action: CardAction, input?: { amount: number; method: PaymentMethod }) {
    setBusy(true);
    setError(null);
    try {
      await onAction(action, input);
    } catch (e) {
      if (e instanceof ApiError && e.fields?.amount) setAmountError(e.fields.amount);
      else setError(e instanceof ApiError ? e.message : "No pudimos completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  function submitPay(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!/^\d+([.,]\d{1,2})?$/.test(amount.trim()) || !Number.isFinite(value) || value <= 0) {
      setAmountError("Escribe un monto mayor que 0, con hasta 2 decimales.");
      return;
    }
    setAmountError(null);
    void run("pay", { amount: value, method });
  }

  const style = sheet ? undefined : pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 };

  return (
    <>
      {sheet && pinned && <div className="bcard-backdrop" onClick={() => onClose(true)} aria-hidden="true" />}
      <div
        ref={box}
        className={`bcard${sheet ? " is-sheet" : ""}${pinned ? " is-pinned" : ""}`}
        style={style}
        role="dialog"
        aria-modal={sheet && pinned ? true : undefined}
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
        tabIndex={-1}
        onPointerEnter={(e) => e.pointerType === "mouse" && onHoverChange(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && onHoverChange(false)}
        onPointerDown={() => !pinned && onPin()}
        onFocus={() => !pinned && onPin()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            if (mode !== "view" && !busy) setMode("view");
            else onClose(true);
            return;
          }
          // Hoja inferior modal (móvil): el foco no sale de la tarjeta con Tab / Mayús+Tab.
          if (e.key === "Tab" && sheet && pinned && box.current) {
            const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute("disabled"));
            if (items.length === 0) {
              e.preventDefault();
              return;
            }
            const first = items[0]!;
            const last = items[items.length - 1]!;
            const active = document.activeElement;
            if (e.shiftKey && (active === first || active === box.current)) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && active === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className={`bcard-band tone-${tone}`}>
          <span className="bcard-status">{tone === "live" ? "Confirmada" : TONE_LABEL[tone]}</span>
          {b.status !== "cancelada" && <span className="bcard-phase">{PHASE_LABEL[phase]}</span>}
          {b.seriesId && <span className="bcard-chip">↻ Serie semanal</span>}
          <button type="button" className="bcard-x" aria-label="Cerrar tarjeta" onClick={() => onClose(true)}>
            ×
          </button>
        </div>
        <div className="bcard-body">
          <h3 className="bcard-name" id={`${id}-t`}>
            {c.name}
          </h3>
          <p className="bcard-who">
            <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="num">
              {c.phone}
            </a>
            <span className="muted"> · {c.guest ? "Invitado" : discount ? `Socio −${b.discountPct} %` : "Con cuenta"}</span>
          </p>
          <dl className="bcard-list" id={`${id}-d`}>
            <dt>Fecha</dt>
            <dd className="cap">{formatLongDate(b.date)}</dd>
            <dt>Horario</dt>
            <dd className="num">
              {formatRange12(b.startTime, b.endTime)} <span className="muted">· {durationLabel(b.durationMin)}</span>
            </dd>
            <dt>Cancha</dt>
            <dd>{b.courtName}</dd>
            <dt>Precio</dt>
            <dd className="num">
              <strong>{money(b.price)}</strong>
              {discount && (
                <span className="muted">
                  {" "}
                  · <s>{money(b.basePrice!)}</s> −{b.discountPct} %
                </span>
              )}
            </dd>
            <dt>Pago</dt>
            <dd>
              <span className={`bpay bpay-${pay}`}>
                {pay === "paid"
                  ? `Pagado ${money(b.payment.amount ?? b.price)}${b.payment.method ? ` · ${METHOD_LABEL[b.payment.method]}` : ""}`
                  : pay === "due"
                    ? "Pendiente · por cobrar"
                    : b.status === "confirmada"
                      ? "Pendiente · se cobra al terminar"
                      : PAY_LABEL.na}
              </span>
            </dd>
          </dl>

          {error && (
            <p className="form-error" role="alert">
              <AlertIcon />
              {error}
            </p>
          )}

          {mode === "pay" && canCharge && (
            <form className="bcard-pay" onSubmit={submitPay} noValidate aria-label="Registrar pago">
              <label className={`field${amountError ? " has-error" : ""}`}>
                <span className="field-label">Monto cobrado ($)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  autoFocus
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={amountError ? true : undefined}
                  aria-describedby={`${id}-amount`}
                />
                <span className={amountError ? "field-error" : "field-hint"} id={`${id}-amount`}>
                  {amountError ?? `Precio de la reserva: ${money(b.price)}. Puedes ajustarlo.`}
                </span>
              </label>
              <fieldset className="bcard-methods">
                <legend className="field-label">Método de pago</legend>
                <div className="method-grid">
                  {METHOD_ORDER.map((m) => (
                    <label key={m} className={`method${m === method ? " is-on" : ""}`}>
                      <input type="radio" name={`${id}-metodo`} value={m} checked={m === method} onChange={() => setMethod(m)} />
                      <span>{METHOD_LABEL[m]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="bcard-actions">
                <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
                  {busy ? "Registrando…" : "Registrar pago"}
                </button>
                <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => setMode("view")}>
                  Volver
                </button>
              </div>
            </form>
          )}

          {(mode === "cancel" || mode === "noshow" || mode === "series") && (
            <div className="bcard-confirm" role="group" aria-label="Confirmar acción">
              <p>
                {mode === "series"
                  ? "¿Cancelar las próximas reservas de esta serie? Las ya jugadas no cambian."
                  : mode === "cancel"
                    ? b.payment.status === "pagado"
                      ? `Esta reserva ya está pagada (${money(b.payment.amount ?? b.price)}). ¿Cancelar igualmente?`
                      : "¿Cancelar esta reserva? El horario queda libre."
                    : "¿Marcar como no se presentó? Conserva el horario y no se cobra."}
              </p>
              <div className="bcard-actions">
                <button type="button" className="btn btn-danger btn-small" disabled={busy} autoFocus onClick={() => void run(mode)}>
                  {busy ? "Un momento…" : mode === "noshow" ? "Sí, no se presentó" : "Sí, cancelar"}
                </button>
                <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => setMode("view")}>
                  Volver
                </button>
              </div>
            </div>
          )}

          {mode === "view" && (canCharge || confirmed) && (
            <div className="bcard-actions">
              {canCharge && (
                <>
                  <button type="button" className="btn btn-accent btn-small" onClick={() => { onPin(); setMode("pay"); }}>
                    Cobrar {money(b.price)}
                  </button>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => { onPin(); setMode("noshow"); }}>
                    No se presentó
                  </button>
                </>
              )}
              {confirmed && (
                <button type="button" className="btn btn-secondary btn-small" onClick={() => { onPin(); setMode("cancel"); }}>
                  Cancelar
                </button>
              )}
              {notStarted && b.seriesId && (
                <button type="button" className="btn btn-secondary btn-small" onClick={() => { onPin(); setMode("series"); }}>
                  Cancelar las próximas de la serie
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
