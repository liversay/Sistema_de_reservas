import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type AdminBooking } from "../../api";
import { AlertIcon, CheckIcon } from "../../components/Icons";
import { DayNav } from "../../components/admin/DayNav";
import { clientOf, PaymentForm } from "../../components/admin/PaymentForm";
import { isoDate, longDate, money } from "../../dates";

type Lists = { pending: AdminBooking[]; paid: AdminBooking[] };

export function Payments() {
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(() => isoDate(new Date()));
  const [paying, setPaying] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  const latest = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    latest.current?.abort();
    const ctrl = new AbortController();
    latest.current = ctrl;
    try {
      const [pending, paid] = await Promise.all([
        api.admin.payments("pending", ctrl.signal),
        api.admin.payments("paid", ctrl.signal),
      ]);
      if (latest.current !== ctrl) return;
      setLists({ pending, paid });
      setError(null);
    } catch (e) {
      if (ctrl.signal.aborted || latest.current !== ctrl) return;
      setError(e instanceof ApiError ? e.message : "No pudimos cargar los pagos.");
    }
  }, []);

  useEffect(() => {
    void load();
    return () => latest.current?.abort();
  }, [load]);

  const pending = useMemo(
    () => [...(lists?.pending ?? [])].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [lists],
  );
  const pendingTotal = pending.reduce((s, b) => s + b.price, 0);
  const paidDay = useMemo(
    () => (lists?.paid ?? []).filter((b) => b.date === day && b.status === "confirmada").sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [lists, day],
  );
  const paidTotal = paidDay.reduce((s, b) => s + (b.payment.amount ?? 0), 0);

  async function noShow(b: AdminBooking) {
    setBusy(b.id);
    setNotice(null);
    try {
      await api.admin.noShow(b.id);
      setNotice({ kind: "ok", message: "Marcada como no se presentó. Ya no está por cobrar." });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof ApiError ? e.message : "No pudimos completar la acción." });
    } finally {
      setAsking(null);
      setBusy(null);
      void load();
    }
  }

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">Pagos</p>
          <h1 className="hero-title">Por cobrar y cobrados</h1>
          <p className="hero-sub">Turnos ya jugados sin pago registrado, y lo cobrado por día.</p>
        </div>
      </section>
      <main className="page" id="contenido">
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
          {error && (
            <div className="notice notice-error" role="alert">
              <AlertIcon />
              <div>{error}</div>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => void load()}>
                Reintentar
              </button>
            </div>
          )}
        </div>

        <div className="pay-columns">
          <section className="board" aria-labelledby="por-cobrar">
            <div className="board-head">
              <h2 className="board-title" id="por-cobrar">
                Por cobrar
              </h2>
              <span className="board-sub">
                {pending.length} turno{pending.length === 1 ? "" : "s"} · <strong className="total">{money(pendingTotal)}</strong>
              </span>
            </div>
            {!lists && !error && (
              <div className="state-box" aria-busy="true">
                <div className="skeleton" />
                <div className="skeleton" />
              </div>
            )}
            {lists && pending.length === 0 && (
              <div className="state-box empty">
                <span className="empty-title">Todo cobrado</span>
                <p>No hay turnos jugados con pago pendiente.</p>
              </div>
            )}
            <ul className="due-list">
              {pending.map((b) => {
                const c = clientOf(b);
                return (
                  <li key={b.id} className="due">
                    <div className="due-row">
                      <div className="due-main">
                        <div className="cell-name">{c.name}</div>
                        <div className="muted small">
                          {b.courtName} · <span className="cap-inline">{longDate(b.date)}</span> {b.startTime}–{b.endTime} · <span className="num">{c.phone}</span>
                        </div>
                      </div>
                      {asking === b.id ? (
                        <div className="confirm-row" role="group" aria-label="Confirmar no se presentó">
                          <span>¿Marcar como no se presentó?</span>
                          <button type="button" className="btn btn-danger btn-small" disabled={busy === b.id} onClick={() => noShow(b)}>
                            Sí, no se presentó
                          </button>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => setAsking(null)}>
                            Volver
                          </button>
                        </div>
                      ) : (
                        <div className="row-actions">
                          <button type="button" className="btn btn-primary btn-small" onClick={() => setPaying(paying === b.id ? null : b.id)}>
                            Cobrar {money(b.price)}
                          </button>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => setAsking(b.id)}>
                            No se presentó
                          </button>
                        </div>
                      )}
                    </div>
                    {paying === b.id && (
                      <PaymentForm
                        booking={b}
                        onClose={() => setPaying(null)}
                        onPaid={(p) => {
                          setPaying(null);
                          setNotice({ kind: "ok", message: `Pago registrado: ${money(p.payment.amount ?? p.price)} en ${p.payment.method}.` });
                          void load();
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="board" aria-labelledby="cobrados">
            <div className="board-head">
              <h2 className="board-title" id="cobrados">
                Cobrados
              </h2>
              <span className="board-sub">
                {paidDay.length} cobro{paidDay.length === 1 ? "" : "s"} · <strong className="total">{money(paidTotal)}</strong>
              </span>
            </div>
            <DayNav date={day} onChange={setDay} />
            {lists && paidDay.length === 0 && (
              <div className="state-box empty">
                <span className="empty-title">Sin cobros este día</span>
                <p>Los turnos cobrados de este día aparecerán aquí.</p>
              </div>
            )}
            {paidDay.length > 0 && (
              <div className="table-scroll" role="region" aria-label="Tabla de cobrados" tabIndex={0}>
                <table className="data-table data-table-compact">
                  <thead>
                    <tr>
                      <th scope="col">Hora</th>
                      <th scope="col">Cancha</th>
                      <th scope="col">Cliente</th>
                      <th scope="col">Método</th>
                      <th scope="col" className="right">
                        Cobrado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidDay.map((b) => {
                      const c = clientOf(b);
                      return (
                        <tr key={b.id}>
                          <td className="num nowrap">{b.startTime}</td>
                          <td>{b.courtName}</td>
                          <td>{c.name}</td>
                          <td className="cap">{b.payment.method}</td>
                          <td className="num right">
                            <strong>{money(b.payment.amount ?? 0)}</strong>
                            {b.payment.amount !== b.price && <div className="muted small">precio {money(b.price)}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" colSpan={4}>
                        Total del día
                      </th>
                      <td className="num right">
                        <strong>{money(paidTotal)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
