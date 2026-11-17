import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DURATIONS, fromSlot, toSlot, type Duration, type Sport } from "../shared";
import { api, ApiError, CONFLICT_MESSAGE, type Booking, type CourtAvailability, type Guest } from "../api";
import { useAuth } from "../auth";
import { AvailabilityGrid, Legend, selectionRange, type Selection } from "../components/AvailabilityGrid";
import { BookingPanel, type GuestField } from "../components/BookingPanel";
import { DayStrip } from "../components/DayStrip";
import { DurationPicker } from "../components/DurationPicker";
import { AlertIcon, CheckIcon, ClockIcon } from "../components/Icons";
import { diffDays, durationLabel, HORIZON_DAYS, isoDate, money, nextDays } from "../dates";
import { formatLongDate, formatTime12 } from "../format";
import { MAX_WEEKS, MIN_WEEKS } from "../components/RepeatOption";
import { useLoyaltyPct } from "../loyalty";

const SPORTS: { id: Sport | "todas"; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "futbol", label: "Fútbol" },
  { id: "padel", label: "Pádel" },
  { id: "basquet", label: "Básquet" },
];

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; courts: CourtAvailability[] };

const GUEST_MESSAGE: Record<GuestField, string> = {
  name: "Escribe tu nombre (de 2 a 60 caracteres).",
  phone: "Escribe un teléfono de 7 a 15 caracteres (números y espacios).",
};

/** Mismas reglas que la API (RN-15): nombre 2–60, teléfono /^\+?[0-9 ]{7,15}$/. */
function validateGuest(g: Guest): Partial<Record<GuestField, string>> {
  const errs: Partial<Record<GuestField, string>> = {};
  const name = g.name.trim();
  if (name.length < 2 || name.length > 60) errs.name = GUEST_MESSAGE.name;
  if (!/^\+?[0-9 ]{7,15}$/.test(g.phone.trim())) errs.phone = GUEST_MESSAGE.phone;
  return errs;
}

/** La API marca `guest.name` / `guest.phone`; el texto se muestra en español. */
function guestErrorsFromApi(fields: Record<string, string>): Partial<Record<GuestField, string>> {
  const errs: Partial<Record<GuestField, string>> = {};
  for (const k of Object.keys(fields)) {
    const f = k.replace(/^guest\./, "");
    if (f === "name" || f === "phone") errs[f] = GUEST_MESSAGE[f];
  }
  return errs;
}

export function Availability() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // CR-02 / RN-14: hoy y los 30 días siguientes (31 días).
  // Se recalcula al cambiar el día local (la pestaña puede quedar abierta pasada la medianoche).
  const [today, setToday] = useState(() => isoDate(new Date()));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const days = useMemo(() => nextDays(HORIZON_DAYS + 1), [today]);
  const horizonDate = days[days.length - 1]!;
  const member = user?.role === "client";
  const loyaltyPct = useLoyaltyPct();

  // El estado de la pantalla vive en la URL: así "Ingresa" (socios) vuelve a la misma selección.
  const date = days.includes(params.get("fecha") ?? "") ? params.get("fecha")! : days[0]!;
  const sport = (SPORTS.find((s) => s.id === params.get("deporte"))?.id ?? "todas") as Sport | "todas";
  const durParam = Number(params.get("duracion"));
  const duration: Duration = (DURATIONS as readonly number[]).includes(durParam) ? (durParam as Duration) : 60;
  const hora = params.get("hora");
  const selection: Selection | null =
    params.get("cancha") && hora && /^\d{2}:\d{2}$/.test(hora) ? { courtId: params.get("cancha")!, slot: toSlot(hora) } : null;

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) p.delete(k);
            else p.set(k, v);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<
    { kind: "ok"; booking: Booking } | { kind: "series"; bookings: Booking[] } | { kind: "error"; message: string } | null
  >(null);
  const [repeatWanted, setRepeat] = useState(false);
  const [weeksWanted, setWeeks] = useState(4);
  // Sin cuenta: nombre y teléfono viven solo en memoria (no se guardan en el navegador).
  const [guest, setGuest] = useState<Guest>({ name: "", phone: "" });
  const [guestErrors, setGuestErrors] = useState<Partial<Record<GuestField, string>>>({});
  // La última ocurrencia de una serie debe caer dentro del horizonte de 30 días.
  const maxWeeks = Math.min(MAX_WEEKS, Math.floor(diffDays(date, horizonDate) / 7) + 1);
  const repeat = repeatWanted && maxWeeks >= MIN_WEEKS;
  const weeks = Math.max(MIN_WEEKS, Math.min(weeksWanted, maxWeeks));

  const noticesRef = useRef<HTMLDivElement>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  // Solo la última petición puede escribir en la cuadrícula: al cambiar de día rápido, una
  // respuesta lenta de otro día se cancela (AbortController) y, si igual llega, se descarta.
  const latest = useRef<{ id: number; date: string; ctrl: AbortController } | null>(null);
  const seq = useRef(0);

  /**
   * `background`: refresco tras reservar o tras un 409. Si falla, se conserva la cuadrícula
   * anterior y se muestra un aviso no bloqueante; solo la carga inicial del día usa el estado de error.
   */
  const refresh = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      latest.current?.ctrl.abort();
      const req = { id: ++seq.current, date, ctrl: new AbortController() };
      latest.current = req;
      const isCurrent = () => latest.current?.id === req.id;
      try {
        const courts = await api.availability(date, req.ctrl.signal);
        if (!isCurrent()) return;
        setRefreshWarning(null);
        setLoad({ status: "ok", courts });
      } catch (e) {
        if (!isCurrent() || req.ctrl.signal.aborted) return;
        const message = e instanceof ApiError ? e.message : "No pudimos cargar la disponibilidad.";
        if (background) {
          setLoad((prev) => (prev.status === "ok" ? prev : { status: "error", message }));
          setRefreshWarning("No pudimos actualizar la disponibilidad; lo que ves puede no estar al día.");
        } else {
          setLoad({ status: "error", message });
        }
      }
    },
    [date],
  );

  useEffect(() => {
    setLoad({ status: "loading" });
    setRefreshWarning(null);
    void refresh();
    return () => latest.current?.ctrl.abort();
  }, [refresh]);

  // Tras reservar o fallar, lleva el aviso a la vista (en móvil el botón queda abajo).
  useEffect(() => {
    if (notice) noticesRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [notice]);

  // Hoy: los bloques que van iniciando pasan a "pasado"; se refresca cada minuto para no ofrecerlos.
  useEffect(() => {
    if (date !== days[0]) return;
    const t = setInterval(() => void refresh({ background: true }), 60_000);
    return () => clearInterval(t);
  }, [date, days, refresh]);

  // Cambio de día local: la tira de 31 días y el horizonte se recalculan.
  useEffect(() => {
    const t = setInterval(() => setToday((prev) => (isoDate(new Date()) !== prev ? isoDate(new Date()) : prev)), 60_000);
    return () => clearInterval(t);
  }, []);

  const allCourts = load.status === "ok" ? load.courts : [];
  const courts = sport === "todas" ? allCourts : allCourts.filter((c) => c.sport === sport);
  const selCourt = allCourts.find((c) => c.courtId === selection?.courtId);
  const { fits } = selectionRange(selCourt, selection, duration);
  const visibleSelection = selCourt && courts.includes(selCourt) ? selection : null;

  const noCourts = load.status === "ok" && allCourts.length === 0;
  const allClosed = !noCourts && allCourts.every((c) => c.slots.every((s) => s.state === "cerrado"));
  const noneFree = courts.every((c) => c.slots.every((s) => s.state !== "libre"));

  async function confirm() {
    if (!selection || !selCourt) return;
    if (!member) {
      const errs = validateGuest(guest);
      setGuestErrors(errs);
      const first = errs.name ? "name" : errs.phone ? "phone" : null;
      if (first) {
        // Espera al render de los errores y lleva el foco al primer campo inválido.
        setTimeout(() => document.querySelector<HTMLInputElement>(`input[data-guest="${first}"]`)?.focus(), 0);
        return;
      }
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const base = {
        courtId: selection.courtId,
        date,
        startTime: fromSlot(selection.slot),
        durationMin: duration,
        ...(member ? {} : { guest: { name: guest.name.trim(), phone: guest.phone.trim() } }),
      };
      if (repeat) {
        const { bookings } = await api.bookSeries({ ...base, weeks });
        setNotice({ kind: "series", bookings });
        setRepeat(false);
      } else {
        setNotice({ kind: "ok", booking: await api.book(base) });
      }
      update({ cancha: null, hora: null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 400 && e.fields) {
        const errs = guestErrorsFromApi(e.fields);
        if (Object.keys(errs).length) {
          setGuestErrors(errs);
          setNotice({ kind: "error", message: "Revisa los campos marcados." });
          return;
        }
      }
      // En una serie el 409 trae la fecha que chocó: se conserva la selección para ajustar las semanas.
      const message =
        e instanceof ApiError && e.status === 409 && !repeat ? CONFLICT_MESSAGE : e instanceof ApiError ? e.message : String(e);
      setNotice({ kind: "error", message });
      if (e instanceof ApiError && e.status === 409 && !repeat) update({ cancha: null, hora: null });
    } finally {
      setSubmitting(false);
      void refresh({ background: true });
    }
  }

  function goLogin() {
    const back = `/?${params.toString()}`;
    navigate(`/ingresar?next=${encodeURIComponent(back)}`);
  }

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">Reserva en un minuto · pagas al terminar</p>
          <h1 className="hero-title">¿A qué hora juegas?</h1>
          <DayStrip days={days} value={date} onChange={(d) => update({ fecha: d, cancha: null, hora: null })} />
        </div>
      </section>

      <main className="page page-availability" id="contenido">
        <div className="filters">
          <div className="chips" role="group" aria-label="Deporte">
            <span className="field-label">Deporte</span>
            <div className="chips-row">
              {SPORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`chip${s.id === sport ? " is-on" : ""}`}
                  aria-pressed={s.id === sport}
                  onClick={() => update({ deporte: s.id === "todas" ? null : s.id })}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <DurationPicker value={duration} onChange={(d) => update({ duracion: d === 60 ? null : String(d) })} />
        </div>

        <div aria-live="polite" className="notices" ref={noticesRef}>
          {notice?.kind === "ok" && (
            <div className="notice notice-ok" role="status" data-testid="reserva-confirmada">
              <CheckIcon />
              <div>
                <strong>Reserva confirmada.</strong> {notice.booking.courtName},{" "}
                {formatLongDate(notice.booking.date)}, {formatTime12(notice.booking.startTime)} –{" "}
                {formatTime12(notice.booking.endTime)} · {money(notice.booking.price)}
                {notice.booking.discountPct ? ` (Socio −${notice.booking.discountPct} %)` : ""}.{" "}
                {notice.booking.guest ? (
                  <>
                    A nombre de {notice.booking.guest.name} · {notice.booking.guest.phone}. Para cancelar llama al complejo.
                  </>
                ) : (
                  <Link to="/mis-reservas">Ver mis reservas</Link>
                )}
              </div>
              <button type="button" className="notice-close" aria-label="Cerrar aviso" onClick={() => setNotice(null)}>
                ×
              </button>
            </div>
          )}
          {notice?.kind === "series" && (
            <div className="notice notice-ok" role="status" data-testid="serie-confirmada">
              <CheckIcon />
              <div>
                <strong>Serie confirmada: {notice.bookings.length} reservas.</strong> {notice.bookings[0]!.courtName},{" "}
                {notice.bookings.map((b) => formatLongDate(b.date)).join(", ")}, {formatTime12(notice.bookings[0]!.startTime)} –{" "}
                {formatTime12(notice.bookings[0]!.endTime)} · {money(notice.bookings.reduce((n, b) => n + b.price, 0))} en total.{" "}
                {notice.bookings[0]!.guest ? (
                  <>
                    A nombre de {notice.bookings[0]!.guest!.name} · {notice.bookings[0]!.guest!.phone}. Para cancelar llama al complejo.
                  </>
                ) : (
                  <Link to="/mis-reservas">Ver mis reservas</Link>
                )}
              </div>
              <button type="button" className="notice-close" aria-label="Cerrar aviso" onClick={() => setNotice(null)}>
                ×
              </button>
            </div>
          )}
          {notice?.kind === "error" && (
            <div className="notice notice-error" role="alert">
              <AlertIcon />
              <div>{notice.message}</div>
              <button type="button" className="notice-close" aria-label="Cerrar aviso" onClick={() => setNotice(null)}>
                ×
              </button>
            </div>
          )}
          {refreshWarning && (
            <div className="notice notice-warn" role="status">
              <AlertIcon />
              <div>{refreshWarning}</div>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => void refresh({ background: true })}>
                Actualizar
              </button>
            </div>
          )}
        </div>

        <div className="layout">
          <section className="board" aria-labelledby="board-title">
            <div className="board-head">
              <h2 id="board-title" className="board-title">
                <span className="cap-inline">{formatLongDate(date)}</span>
              </h2>
              <span className="board-sub">
                <ClockIcon /> Bloques de 30 min · eliges el inicio, reservas {durationLabel(duration)}
              </span>
            </div>

            {load.status === "loading" && (
              <div className="state-box" aria-busy="true">
                <div className="skeleton" />
                <div className="skeleton" />
                <div className="skeleton" />
                <span className="sr-only">Cargando disponibilidad…</span>
              </div>
            )}
            {load.status === "error" && (
              <div className="state-box empty">
                <p>{load.message}</p>
                <button type="button" className="btn btn-secondary" onClick={() => void refresh()}>
                  Reintentar
                </button>
              </div>
            )}
            {noCourts && (
              <div className="state-box empty">
                <p className="empty-title">No hay canchas disponibles</p>
                <p>Vuelve a intentarlo más tarde.</p>
              </div>
            )}
            {load.status === "ok" && allClosed && (
              <div className="state-box empty">
                <p className="empty-title">Ese día el complejo está cerrado.</p>
                <p>Elige otro día en la tira de arriba para ver horarios libres.</p>
              </div>
            )}
            {load.status === "ok" && !allClosed && courts.length > 0 && (
              <>
                {noneFree && (
                  <p className="inline-info">
                    No quedan bloques libres{sport !== "todas" ? " para este deporte" : ""} este día. Prueba otro día.
                  </p>
                )}
                <AvailabilityGrid
                  courts={courts}
                  duration={duration}
                  selection={visibleSelection}
                  onPick={(s) => {
                    setNotice(null);
                    update({ cancha: s.courtId, hora: fromSlot(s.slot) });
                  }}
                />
                {visibleSelection && !fits && (
                  <p className="inline-warn" role="status">
                    <AlertIcon />
                    <span>No cabe en ese horario: con {durationLabel(duration)} se cruza con un bloque ocupado o el cierre.</span>
                  </p>
                )}
                <Legend />
              </>
            )}
          </section>

          <BookingPanel
            court={visibleSelection ? selCourt : undefined}
            slot={visibleSelection?.slot ?? null}
            date={date}
            duration={duration}
            fits={fits}
            member={member}
            loyaltyPct={loyaltyPct}
            guest={guest}
            guestErrors={guestErrors}
            onGuest={(g) => {
              setGuest(g);
              setGuestErrors({});
            }}
            maxWeeks={maxWeeks}
            horizonDate={horizonDate}
            submitting={submitting}
            repeat={repeat}
            weeks={weeks}
            onRepeat={setRepeat}
            onWeeks={setWeeks}
            onConfirm={() => void confirm()}
            onLogin={goLogin}
          />
        </div>
      </main>
    </>
  );
}
