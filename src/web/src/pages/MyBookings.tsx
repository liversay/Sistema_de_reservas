import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Booking } from "../api";
import { useAuth } from "../auth";
import { CourtIcon } from "../components/CourtIcon";
import { AlertIcon, CheckIcon } from "../components/Icons";
import { durationLabel, parseIso } from "../dates";
import { formatLongDate, formatTime12 } from "../format";
import type { Sport } from "../shared";

function at(date: string, hhmm: string): Date {
  const d = parseIso(date);
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  d.setHours(h, m, 0, 0);
  return d;
}

function sportOf(courtId: string): Sport {
  if (courtId.startsWith("padel")) return "padel";
  if (courtId.startsWith("basquet")) return "basquet";
  return "futbol";
}

function statusOf(b: Booking, now: Date): { label: string; tone: "ok" | "muted" | "warn" | "info" } {
  if (b.status === "cancelada") return { label: "Cancelada", tone: "muted" };
  if (b.status === "no_show") return { label: "No se presentó", tone: "warn" };
  if (at(b.date, b.endTime) <= now) return { label: b.payment.status === "pagado" ? "Jugada · pagada" : "Jugada", tone: "info" };
  return { label: "Confirmada", tone: "ok" };
}

export function MyBookings() {
  const { user, loading: authLoading, setUser } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBookings(await api.myBookings());
    } catch (e) {
      // Sesión caducada o servidor reiniciado: se vuelve al aviso "Ingresa para ver tus reservas".
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        return;
      }
      setError(e instanceof ApiError ? e.message : "No pudimos cargar tus reservas.");
    }
  }, [setUser]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function cancel(b: Booking) {
    setBusy(b.id);
    setError(null);
    setDone(null);
    try {
      await api.cancel(b.id);
      setDone(`Cancelaste ${b.courtName}, ${formatLongDate(b.date)} ${formatTime12(b.startTime)}. El horario quedó libre.`);
      setAsking(null);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 422
          ? "Esa reserva ya empezó y no se puede cancelar."
          : e instanceof ApiError
            ? e.message
            : "No pudimos cancelar.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function cancelFuture(seriesId: string) {
    setBusy(`series:${seriesId}`);
    setError(null);
    setDone(null);
    try {
      const { cancelled } = await api.cancelFuture(seriesId);
      setDone(
        cancelled === 0
          ? "No quedaban reservas por cancelar en esa serie."
          : `Cancelaste ${cancelled} ${cancelled === 1 ? "reserva" : "reservas"} de la serie. Los horarios quedaron libres.`,
      );
      setAsking(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No pudimos cancelar la serie.");
    } finally {
      setBusy(null);
    }
  }

  const now = new Date();
  const upcoming = (bookings ?? []).filter((b) => b.status === "confirmada" && at(b.date, b.endTime) > now).reverse();
  const past = (bookings ?? []).filter((b) => !upcoming.includes(b));
  // CR-01: las próximas de una misma serie se agrupan (en la posición de su primera ocurrencia).
  const groups: { seriesId?: string; items: Booking[] }[] = [];
  for (const b of upcoming) {
    const g = b.seriesId ? groups.find((x) => x.seriesId === b.seriesId) : undefined;
    if (g) g.items.push(b);
    else groups.push({ seriesId: b.seriesId, items: [b] });
  }

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <h1 className="hero-title">Mis reservas</h1>
          {user && <p className="hero-sub">Hola, {user.name.split(" ")[0]}. Aquí ves tus turnos y puedes cancelar los que aún no empiezan.</p>}
        </div>
      </section>
      <main className="page page-mine" id="contenido">
        {authLoading ? null : !user ? (
          <div className="card state-box empty">
            <p className="empty-title">Ingresa para ver tus reservas.</p>
            <Link className="btn btn-primary" to={`/ingresar?next=${encodeURIComponent("/mis-reservas")}`}>
              Ingresar
            </Link>
          </div>
        ) : (
          <>
            <div aria-live="polite" className="notices">
              {done && (
                <div className="notice notice-ok" role="status">
                  <CheckIcon />
                  <div>{done}</div>
                </div>
              )}
              {error && (
                <div className="notice notice-error" role="alert">
                  <AlertIcon />
                  <div>{error}</div>
                </div>
              )}
            </div>

            {bookings === null ? (
              <div className="state-box" aria-busy="true">
                <div className="skeleton" />
                <div className="skeleton" />
              </div>
            ) : bookings.length === 0 ? (
              <div className="card state-box empty">
                <p className="empty-title">Aún no tienes reservas.</p>
                <Link className="btn btn-primary" to="/">
                  Ver disponibilidad
                </Link>
              </div>
            ) : (
              <>
                <h2 className="section-title">Próximas</h2>
                {upcoming.length === 0 ? (
                  <p className="muted">
                    No tienes turnos próximos. <Link to="/">Reserva uno</Link>.
                  </p>
                ) : (
                  <ul className="booking-list">
                    {groups.map((g) => {
                      const cards = g.items.map((b) => (
                        <BookingCard key={b.id} b={b} now={now}>
                          {at(b.date, b.startTime) > now &&
                            (asking === b.id ? (
                              <div className="confirm-row">
                                <span>¿Cancelar esta reserva?</span>
                                <button type="button" className="btn btn-danger" disabled={busy === b.id} onClick={() => void cancel(b)}>
                                  {busy === b.id ? "Cancelando…" : "Sí, cancelar"}
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={() => setAsking(null)}>
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Cancelar reserva ${b.courtName} ${formatTime12(b.startTime)}`}
                                onClick={() => setAsking(b.id)}
                              >
                                Cancelar
                              </button>
                            ))}
                        </BookingCard>
                      ));
                      if (!g.seriesId) return cards[0];
                      const key = `series:${g.seriesId}`;
                      const first = g.items[0]!;
                      const notStarted = g.items.filter((b) => at(b.date, b.startTime) > now);
                      return (
                        <li key={key} className="series-group" data-testid="serie">
                          <div className="series-head">
                            <div>
                              <div className="series-title">Serie semanal · {first.courtName}</div>
                              <div className="muted small">
                                {notStarted.length} {notStarted.length === 1 ? "próxima" : "próximas"} · {formatTime12(first.startTime)} – {formatTime12(first.endTime)}
                              </div>
                            </div>
                            {notStarted.length === 0 ? null : asking === key ? (
                              <div className="confirm-row">
                                <span>¿Cancelar las próximas?</span>
                                <button type="button" className="btn btn-danger" disabled={busy === key} onClick={() => void cancelFuture(g.seriesId!)}>
                                  {busy === key ? "Cancelando…" : "Sí, cancelar"}
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={() => setAsking(null)}>
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                aria-label={`Cancelar las próximas de la serie ${first.courtName} ${formatTime12(first.startTime)}`}
                                onClick={() => setAsking(key)}
                              >
                                Cancelar las próximas
                              </button>
                            )}
                          </div>
                          <ul className="booking-list">{cards}</ul>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {past.length > 0 && (
                  <>
                    <h2 className="section-title">Anteriores y canceladas</h2>
                    <ul className="booking-list is-past">
                      {past.map((b) => (
                        <BookingCard key={b.id} b={b} now={now} />
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

function BookingCard({ b, now, children }: { b: Booking; now: Date; children?: React.ReactNode }) {
  const st = statusOf(b, now);
  return (
    <li className="card booking">
      <CourtIcon sport={sportOf(b.courtId)} size={56} />
      <div className="booking-main">
        <div className="booking-name">{b.courtName}</div>
        <div className="booking-when">
          <span className="cap-inline">{formatLongDate(b.date)}</span> · {formatTime12(b.startTime)} – {formatTime12(b.endTime)} · {durationLabel(b.durationMin)}
        </div>
        <div className="booking-meta">
          <span className={`badge badge-${st.tone}`}>{st.label}</span>
          {b.seriesId && <span className="badge badge-info">Serie</span>}
          <span className="booking-price">${b.price}</span>
          {b.status === "confirmada" && b.payment.status === "pendiente" && <span className="muted small">pagas al terminar</span>}
        </div>
      </div>
      {children && <div className="booking-actions">{children}</div>}
    </li>
  );
}
