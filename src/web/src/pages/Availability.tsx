import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DURATIONS, fromSlot, toSlot, type Duration, type Sport } from "../shared";
import { api, ApiError, CONFLICT_MESSAGE, type Booking, type CourtAvailability } from "../api";
import { useAuth } from "../auth";
import { AvailabilityGrid, Legend, selectionRange, type Selection } from "../components/AvailabilityGrid";
import { BookingPanel } from "../components/BookingPanel";
import { DayStrip } from "../components/DayStrip";
import { DurationPicker } from "../components/DurationPicker";
import { AlertIcon, CheckIcon, ClockIcon } from "../components/Icons";
import { durationLabel, longDate, nextDays } from "../dates";

const SPORTS: { id: Sport | "todas"; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "futbol", label: "Fútbol" },
  { id: "padel", label: "Pádel" },
  { id: "basquet", label: "Básquet" },
];

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; courts: CourtAvailability[] };

export function Availability() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const days = useMemo(() => nextDays(7), []);

  // El estado de la pantalla vive en la URL: así "Ingresa para reservar" vuelve a la misma selección.
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
  const [notice, setNotice] = useState<{ kind: "ok"; booking: Booking } | { kind: "error"; message: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const courts = await api.availability(date);
      setLoad({ status: "ok", courts });
    } catch (e) {
      setLoad({ status: "error", message: e instanceof ApiError ? e.message : "No pudimos cargar la disponibilidad." });
    }
  }, [date]);

  useEffect(() => {
    setLoad({ status: "loading" });
    void refresh();
  }, [refresh]);

  const allCourts = load.status === "ok" ? load.courts : [];
  const courts = sport === "todas" ? allCourts : allCourts.filter((c) => c.sport === sport);
  const selCourt = allCourts.find((c) => c.courtId === selection?.courtId);
  const { fits } = selectionRange(selCourt, selection, duration);
  const visibleSelection = selCourt && courts.includes(selCourt) ? selection : null;

  const allClosed = allCourts.every((c) => c.slots.every((s) => s.state === "cerrado"));
  const noneFree = courts.every((c) => c.slots.every((s) => s.state !== "libre"));

  async function confirm() {
    if (!selection || !selCourt) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const booking = await api.book({
        courtId: selection.courtId,
        date,
        startTime: fromSlot(selection.slot),
        durationMin: duration,
      });
      setNotice({ kind: "ok", booking });
      update({ cancha: null, hora: null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        goLogin();
        return;
      }
      const message = e instanceof ApiError && e.status === 409 ? CONFLICT_MESSAGE : e instanceof ApiError ? e.message : String(e);
      setNotice({ kind: "error", message });
      if (e instanceof ApiError && e.status === 409) update({ cancha: null, hora: null });
    } finally {
      setSubmitting(false);
      void refresh();
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

        <div aria-live="polite" className="notices">
          {notice?.kind === "ok" && (
            <div className="notice notice-ok" role="status">
              <CheckIcon />
              <div>
                <strong>Reserva confirmada.</strong> {notice.booking.courtName},{" "}
                {longDate(notice.booking.date)}, {notice.booking.startTime}–{notice.booking.endTime} · $
                {notice.booking.price}. <Link to="/mis-reservas">Ver mis reservas</Link>
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
        </div>

        <div className="layout">
          <section className="board" aria-labelledby="board-title">
            <div className="board-head">
              <h2 id="board-title" className="board-title">
                <span className="cap-inline">{longDate(date)}</span>
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
            loggedIn={!!user}
            submitting={submitting}
            onConfirm={() => void confirm()}
            onLogin={goLogin}
          />
        </div>
      </main>
    </>
  );
}
