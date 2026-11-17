import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api, ApiError, CONFLICT_MESSAGE, type AdminBooking, type AdminCourt } from "../../api";
import { fromSlot, priceFor, toSlot, type Duration } from "../../shared";
import { isoDate, money, weekdayIndex } from "../../dates";
import { DurationPicker } from "../DurationPicker";
import { AlertIcon } from "../Icons";
import { RepeatOption } from "../RepeatOption";

/** Horas de inicio posibles ese día según el horario de la cancha (pasos de 30 min). */
function startOptions(court: AdminCourt | undefined, date: string, duration: Duration): string[] {
  const day = court?.schedule.find((d) => d.weekday === weekdayIndex(date));
  if (!day || day.closed) return [];
  const out: string[] = [];
  const now = new Date();
  // Si la fecha es hoy, no se ofrecen horas que ya empezaron.
  const minSlot = date === isoDate(now) ? Math.floor((now.getHours() * 60 + now.getMinutes()) / 30) + 1 : 0;
  for (let s = Math.max(toSlot(day.open), minSlot); s + duration / 30 <= toSlot(day.close); s++) out.push(fromSlot(s));
  return out;
}

/** Nueva reserva para un invitado (cliente que llama o llega al mostrador). */
export function NewBookingForm({
  courts,
  initialDate,
  onCreated,
  onClose,
}: {
  courts: AdminCourt[];
  initialDate: string;
  /** `count` > 1 cuando se creó una serie (CR-01). */
  onCreated: (b: AdminBooking, count: number) => void;
  onClose: () => void;
}) {
  const active = useMemo(() => courts.filter((c) => c.active), [courts]);
  const [courtId, setCourtId] = useState(active[0]?.id ?? "");
  const [date, setDate] = useState(initialDate);
  const [duration, setDuration] = useState<Duration>(60);
  const [startTime, setStartTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [weeks, setWeeks] = useState(4);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  const court = active.find((c) => c.id === courtId);
  const options = useMemo(() => startOptions(court, date, duration), [court, date, duration]);
  const start = options.includes(startTime) ? startTime : (options.find((o) => o >= "18:00") ?? options[0] ?? "");
  const price = court ? priceFor(court.prices, duration) : null;
  const closedDay = court && options.length === 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const f: Record<string, string> = {};
    if (name.trim().length < 2) f.name = "Escribe el nombre del invitado.";
    if (!/^\+?[0-9 ]{7,15}$/.test(phone.trim())) f.phone = "Teléfono de 7 a 15 dígitos (puede llevar + y espacios).";
    if (!court) f.court = "Elige una cancha.";
    if (!start) f.start = "No hay horarios disponibles ese día.";
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    try {
      const base = { courtId, date, startTime: start, durationMin: duration, guest: { name: name.trim(), phone: phone.trim() } };
      if (repeat) {
        const { bookings } = await api.admin.createSeries({ ...base, weeks });
        setRepeat(false);
        onCreated(bookings[0]!, bookings.length);
      } else {
        onCreated(await api.admin.createBooking(base), 1);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(repeat ? err.message : CONFLICT_MESSAGE);
      else if (err instanceof ApiError && err.fields) {
        setFields(err.fields);
        setError(err.message);
      } else setError(err instanceof ApiError ? err.message : "No pudimos crear la reserva.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel admin-panel form" onSubmit={submit} noValidate aria-labelledby="nueva-reserva-titulo">
      <div>
        <h2 className="panel-title" id="nueva-reserva-titulo" tabIndex={-1} ref={heading}>
          Nueva reserva
        </h2>
        <p className="muted small admin-panel-sub">Para un invitado, sin cuenta. Queda confirmada y pendiente de pago.</p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          <AlertIcon />
          {error}
        </p>
      )}
      <label className={`field${fields.court ? " has-error" : ""}`}>
        <span className="field-label">Cancha</span>
        <select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {fields.court && <span className="field-error">{fields.court}</span>}
      </label>
      <label className="field">
        <span className="field-label">Fecha</span>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
        />
      </label>
      <DurationPicker value={duration} onChange={setDuration} />
      <label className={`field${fields.start || fields.startTime ? " has-error" : ""}`}>
        <span className="field-label">Hora de inicio</span>
        <select value={start} onChange={(e) => setStartTime(e.target.value)} disabled={options.length === 0}>
          {options.length === 0 && <option value="">Sin horarios</option>}
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {closedDay ? (
          <span className="field-error">Esa cancha está cerrada o no tiene horario para ese día y duración.</span>
        ) : (
          fields.start && <span className="field-error">{fields.start}</span>
        )}
      </label>
      <label className={`field${fields.name || fields["guest.name"] ? " has-error" : ""}`}>
        <span className="field-label">Nombre del invitado</span>
        <input type="text" autoComplete="off" value={name} onChange={(e) => { setName(e.target.value); setFields(({ name: _n, "guest.name": _g, ...r }) => r); }} />
        {(fields.name || fields["guest.name"]) && <span className="field-error">{fields.name ?? fields["guest.name"]}</span>}
      </label>
      <label className={`field${fields.phone || fields["guest.phone"] ? " has-error" : ""}`}>
        <span className="field-label">Teléfono</span>
        <input type="tel" autoComplete="off" value={phone} onChange={(e) => { setPhone(e.target.value); setFields(({ phone: _p, "guest.phone": _g, ...r }) => r); }} />
        {(fields.phone || fields["guest.phone"]) && <span className="field-error">{fields.phone ?? fields["guest.phone"]}</span>}
      </label>
      <RepeatOption date={date} price={price} repeat={repeat} weeks={weeks} onRepeat={setRepeat} onWeeks={setWeeks} />
      <div className="panel-total admin-total">
        <span>{repeat ? "Total de la serie" : "Precio"}</span>
        <span className={`price${price === null ? " is-empty" : ""}`} data-testid="nueva-precio">
          {price === null ? "—" : money(repeat ? price * weeks : price)}
        </span>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !!closedDay}>
          {busy ? "Creando…" : repeat ? `Crear ${weeks} reservas` : "Crear reserva"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          Cerrar
        </button>
      </div>
    </form>
  );
}
