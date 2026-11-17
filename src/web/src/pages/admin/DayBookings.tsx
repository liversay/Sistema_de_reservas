import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError, type AdminBooking, type AdminCourt } from "../../api";
import { AlertIcon, CheckIcon } from "../../components/Icons";
import { DayNav } from "../../components/admin/DayNav";
import { NewBookingForm } from "../../components/admin/NewBookingForm";
import { clientOf, PaymentForm } from "../../components/admin/PaymentForm";
import { durationLabel, isoDate, longDate, money } from "../../dates";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; bookings: AdminBooking[] };
type Aside = { kind: "new" } | { kind: "pay"; id: string } | null;
type Asking = { id: string; action: "cancel" | "noshow" | "series" } | null;

export function statusBadge(b: AdminBooking): { label: string; cls: string } {
  if (b.status === "cancelada") return { label: "Cancelada", cls: "badge-muted" };
  if (b.status === "no_show") return { label: "No se presentó", cls: "badge-warn" };
  if (b.played) return { label: "Jugada", cls: "badge-info" };
  return { label: "Confirmada", cls: "badge-ok" };
}

export function PayCell({ b }: { b: AdminBooking }) {
  if (b.status !== "confirmada") return <span className="muted">—</span>;
  if (b.payment.status === "pagado") {
    return (
      <span className="pay-paid">
        <span className="badge badge-ok">Pagado</span>{" "}
        <span className="num">{money(b.payment.amount ?? b.price)}</span>
        {b.payment.method && <span className="muted small"> · {b.payment.method}</span>}
      </span>
    );
  }
  return (
    <span>
      <span className="badge badge-pending">Pendiente</span> <span className="num muted">{money(b.price)}</span>
    </span>
  );
}

export function DayBookings() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("fecha");
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : isoDate(new Date());
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [courts, setCourts] = useState<AdminCourt[] | null>(null);
  const [aside, setAside] = useState<Aside>(null);
  const [asking, setAsking] = useState<Asking>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  // Solo la última petición, y solo para el día que se está viendo, puede escribir en la lista.
  const dateRef = useRef(date);
  dateRef.current = date;
  const latest = useRef<{ ctrl: AbortController } | null>(null);

  const refresh = useCallback(async (background = false) => {
    latest.current?.ctrl.abort();
    const req = { ctrl: new AbortController() };
    latest.current = req;
    const day = dateRef.current;
    if (!background) setLoad({ status: "loading" });
    try {
      const bookings = await api.admin.bookings(day, req.ctrl.signal);
      if (latest.current === req && dateRef.current === day) setLoad({ status: "ok", bookings });
    } catch (e) {
      if (latest.current !== req || req.ctrl.signal.aborted || dateRef.current !== day) return;
      const message = e instanceof ApiError ? e.message : "No pudimos cargar las reservas.";
      if (background) setNotice({ kind: "error", message });
      else setLoad({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    setAside(null);
    setAsking(null);
    void refresh();
    return () => latest.current?.ctrl.abort();
  }, [date, refresh]);

  async function openNew() {
    setNotice(null);
    if (!courts) {
      try {
        setCourts(await api.admin.courts());
      } catch (e) {
        setNotice({ kind: "error", message: e instanceof ApiError ? e.message : "No pudimos cargar las canchas." });
        return;
      }
    }
    setAside({ kind: "new" });
  }

  async function run(b: AdminBooking, action: "cancel" | "noshow" | "series") {
    setBusy(b.id);
    setNotice(null);
    try {
      let message: string;
      if (action === "series") {
        const { cancelled } = await api.admin.cancelFuture(b.seriesId!);
        message =
          cancelled === 0
            ? "No quedaban reservas por cancelar en esa serie."
            : `Cancelaste ${cancelled} ${cancelled === 1 ? "reserva" : "reservas"} de la serie. Los horarios quedaron libres.`;
      } else if (action === "cancel") {
        await api.admin.cancel(b.id);
        message = "Reserva cancelada. El horario quedó libre.";
      } else {
        await api.admin.noShow(b.id);
        message = "Marcada como no se presentó. Conserva el horario y no se cobra.";
      }
      setAsking(null);
      setNotice({ kind: "ok", message });
    } catch (e) {
      setAsking(null);
      setNotice({ kind: "error", message: e instanceof ApiError ? e.message : "No pudimos completar la acción." });
    } finally {
      setBusy(null);
      void refresh(true);
    }
  }

  const bookings = load.status === "ok" ? load.bookings : [];
  const payingBooking = aside?.kind === "pay" ? bookings.find((b) => b.id === aside.id) : undefined;

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">Reservas del día</p>
          <h1 className="hero-title cap">{longDate(date)}</h1>
        </div>
      </section>
      <main className="page" id="contenido">
        <div className="admin-toolbar">
          <DayNav date={date} onChange={(d) => setParams({ fecha: d }, { replace: true })} />
          <button type="button" className="btn btn-primary" onClick={openNew}>
            Nueva reserva
          </button>
        </div>

        <div className="notices" aria-live="polite">
          {notice && (
            <div className={`notice notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
              {notice.kind === "ok" ? <CheckIcon /> : <AlertIcon />}
              <div>{notice.message}</div>
              <button type="button" className="notice-close" aria-label="Cerrar aviso" onClick={() => setNotice(null)}>
                ×
              </button>
            </div>
          )}
        </div>

        <div className={`admin-split${aside ? " has-aside" : ""}`}>
          <section className="board" aria-label="Reservas">
            {load.status === "loading" && (
              <div className="state-box" aria-busy="true">
                <div className="skeleton" />
                <div className="skeleton" />
                <div className="skeleton" />
              </div>
            )}
            {load.status === "error" && (
              <div className="state-box empty" role="alert">
                <span className="empty-title">No pudimos cargar las reservas</span>
                <p>{load.message}</p>
                <button type="button" className="btn btn-primary" onClick={() => void refresh()}>
                  Reintentar
                </button>
              </div>
            )}
            {load.status === "ok" && bookings.length === 0 && (
              <div className="state-box empty">
                <span className="empty-title">Sin reservas este día</span>
                <p>Cuando haya reservas aparecerán aquí. Puedes crear una para un invitado.</p>
              </div>
            )}
            {load.status === "ok" && bookings.length > 0 && (
              <div className="table-scroll" role="region" aria-label="Tabla de reservas del día" tabIndex={0}>
                <table className="data-table data-table-stack">
                  <thead>
                    <tr>
                      <th scope="col">Hora</th>
                      <th scope="col">Cancha</th>
                      <th scope="col">Cliente</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Pago</th>
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((b) => {
                      const c = clientOf(b);
                      const st = statusBadge(b);
                      const confirmed = b.status === "confirmada";
                      const pending = b.payment.status === "pendiente";
                      const isAsking = asking?.id === b.id;
                      const notStarted = confirmed && new Date(`${b.date}T${b.startTime}:00`) > new Date();
                      return (
                        <tr key={b.id} className={aside?.kind === "pay" && aside.id === b.id ? "is-active" : undefined}>
                          <td className="num nowrap" data-label="Hora">
                            <strong>{b.startTime}</strong>
                            <span className="muted small"> – {b.endTime}</span>
                            <div className="muted small">{durationLabel(b.durationMin)}</div>
                          </td>
                          <td data-label="Cancha">{b.courtName}</td>
                          <td data-label="Cliente">
                            <div className="cell-name">{c.name}</div>
                            <div className="muted small num nowrap">
                              {c.phone}
                              {c.guest && " · Invitado"}
                            </div>
                          </td>
                          <td data-label="Estado">
                            <span className={`badge ${st.cls}`}>{st.label}</span>
                            {b.seriesId && (
                              <>
                                {" "}
                                <span className="badge badge-info">Serie</span>
                              </>
                            )}
                          </td>
                          <td data-label="Pago">
                            <PayCell b={b} />
                          </td>
                          <td className="cell-actions">
                            {isAsking ? (
                              <div className="confirm-row" role="group" aria-label="Confirmar acción">
                                <span>{asking.action === "series" ? "¿Cancelar las próximas reservas de esta serie?" : asking.action === "cancel" ? (b.payment.status === "pagado" ? `Esta reserva ya está pagada (${money(b.payment.amount ?? b.price)}). ¿Cancelar igualmente?` : "¿Cancelar esta reserva?") : "¿Marcar como no se presentó?"}</span>
                                <button
                                  type="button"
                                  className="btn btn-danger btn-small"
                                  disabled={busy === b.id}
                                  onClick={() => run(b, asking.action)}
                                >
                                  {asking.action === "noshow" ? "Sí, no se presentó" : "Sí, cancelar"}
                                </button>
                                <button type="button" className="btn btn-secondary btn-small" onClick={() => setAsking(null)}>
                                  Volver
                                </button>
                              </div>
                            ) : (
                              <div className="row-actions">
                                {confirmed && b.played && pending && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-small"
                                      onClick={() => {
                                        setNotice(null);
                                        setAside({ kind: "pay", id: b.id });
                                      }}
                                    >
                                      Cobrar {money(b.price)}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-small"
                                      onClick={() => setAsking({ id: b.id, action: "noshow" })}
                                    >
                                      No se presentó
                                    </button>
                                  </>
                                )}
                                {confirmed && (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-small"
                                    onClick={() => setAsking({ id: b.id, action: "cancel" })}
                                  >
                                    Cancelar
                                  </button>
                                )}
                                {notStarted && b.seriesId && (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-small"
                                    aria-label={`Cancelar las próximas de la serie ${b.courtName} ${b.startTime}`}
                                    onClick={() => setAsking({ id: b.id, action: "series" })}
                                  >
                                    Cancelar las próximas de la serie
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {aside?.kind === "new" && courts && (
            <NewBookingForm
              courts={courts}
              initialDate={date}
              onClose={() => setAside(null)}
              onCreated={(b, count) => {
                setAside(null);
                setNotice({
                  kind: "ok",
                  message:
                    count > 1
                      ? `Serie creada: ${count} reservas semanales desde el ${b.date}, ${b.courtName}, ${b.startTime}–${b.endTime}, ${money(b.price)} c/u.`
                      : `Reserva creada: ${b.courtName}, ${b.startTime}–${b.endTime}, ${money(b.price)}.`,
                });
                if (b.date !== date) setParams({ fecha: b.date }, { replace: true });
                else void refresh(true);
              }}
            />
          )}
          {payingBooking && (
            <PaymentForm
              key={payingBooking.id}
              booking={payingBooking}
              onClose={() => setAside(null)}
              onPaid={(b) => {
                setAside(null);
                setNotice({ kind: "ok", message: `Pago registrado: ${money(b.payment.amount ?? b.price)} en ${b.payment.method}.` });
                void refresh(true);
              }}
            />
          )}
        </div>
      </main>
    </>
  );
}
