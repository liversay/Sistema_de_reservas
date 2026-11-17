import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, type AdminBooking, type PaymentMethod } from "../../api";
import { longDate, money } from "../../dates";
import { AlertIcon } from "../Icons";

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "transferencia", label: "Transferencia" },
  { id: "tarjeta", label: "Tarjeta" },
];

export function clientOf(b: AdminBooking): { name: string; phone: string; guest: boolean } {
  return b.guest ? { ...b.guest, guest: true } : { name: b.user?.name ?? "", phone: b.user?.phone ?? "", guest: false };
}

/** Registrar pago: monto prellenado con el precio (ajustable, > 0) y método. */
export function PaymentForm({
  booking,
  onPaid,
  onClose,
}: {
  booking: AdminBooking;
  onPaid: (b: AdminBooking) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(booking.price));
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const c = clientOf(booking);

  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView?.({ block: "nearest" });
  }, [booking.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount.replace(",", "."));
    if (!/^\d+([.,]\d{1,2})?$/.test(amount.trim()) || !Number.isFinite(value) || value <= 0) {
      setAmountError("Escribe un monto mayor que 0, con hasta 2 decimales.");
      return;
    }
    setAmountError(null);
    setBusy(true);
    try {
      onPaid(await api.admin.pay(booking.id, { amount: value, method }));
    } catch (err) {
      if (err instanceof ApiError && err.fields?.amount) setAmountError(err.fields.amount);
      else setError(err instanceof ApiError ? err.message : "No pudimos registrar el pago.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel admin-panel form" onSubmit={submit} noValidate aria-labelledby={`pay-${booking.id}`}>
      <div>
        <h2 className="panel-title" id={`pay-${booking.id}`} tabIndex={-1} ref={heading}>
          Registrar pago
        </h2>
        <p className="muted small admin-panel-sub">
          {c.name} · {booking.courtName} · <span className="cap-inline">{longDate(booking.date)}</span>{" "}
          {booking.startTime}–{booking.endTime}
        </p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          <AlertIcon />
          {error}
        </p>
      )}
      <label className={`field${amountError ? " has-error" : ""}`}>
        <span className="field-label">Monto cobrado ($)</span>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={amountError ? true : undefined}
          aria-describedby={`amount-hint-${booking.id}`}
        />
        <span className={amountError ? "field-error" : "field-hint"} id={`amount-hint-${booking.id}`}>
          {amountError ?? `Precio de la reserva: ${money(booking.price)}. Puedes ajustarlo (descuento).`}
        </span>
      </label>
      <fieldset className="segmented">
        <legend className="field-label">Método de pago</legend>
        <div className="segmented-track seg-wide">
          {METHODS.map((m) => (
            <label key={m.id} className={`seg${m.id === method ? " is-on" : ""}`}>
              <input type="radio" name={`metodo-${booking.id}`} value={m.id} checked={m.id === method} onChange={() => setMethod(m.id)} />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Registrando…" : "Registrar pago"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          Cerrar
        </button>
      </div>
    </form>
  );
}
