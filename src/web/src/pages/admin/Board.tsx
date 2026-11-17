import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError, type AdminBooking, type AdminCourt, type PaymentMethod } from "../../api";
import { AlertIcon, CheckIcon } from "../../components/Icons";
import { AdminDayStrip } from "../../components/admin/AdminDayStrip";
import { BoardLegend, BookingBoard } from "../../components/admin/BookingBoard";
import { BookingCard, type CardAction } from "../../components/admin/BookingCard";
import { NewBookingForm } from "../../components/admin/NewBookingForm";
import { PaymentsDashboard, type Rango } from "../../components/admin/PaymentsDashboard";
import { bookingTone, clientOf, METHOD_LABEL, payTone, type Vista } from "../../components/admin/board";
import { addDays, diffDays, HORIZON_DAYS, isoDate, money } from "../../dates";
import { formatLongDate, formatRange12, formatTime12 } from "../../format";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; date: string; bookings: AdminBooking[] };
type Card = { id: string; anchor: HTMLElement | null; pinned: boolean };
type Notice = { kind: "ok" | "error"; message: string } | null;

const STRIP_DAYS = 31;
const STRIP_BACK = 7; // la tira muestra la semana anterior para cobros y revisiones

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useNarrow(): boolean {
  const q = "(max-width: 640px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return !!narrow;
}

/**
 * Backoffice CR-02 (RF-20, RF-21): un solo tablero con pestañas Reservas | Pagos. La pestaña vive en
 * `?vista=pagos`, el día en `?fecha=` y el rango de indicadores en `?rango=`; cambiar de pestaña no
 * recarga la página ni el tablero.
 */
export function Board() {
  const [params, setParams] = useSearchParams();
  const now = useNow();
  const narrow = useNarrow();
  const today = isoDate(now);
  const raw = params.get("fecha");
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;
  const vista: Vista = params.get("vista") === "pagos" ? "pagos" : "reservas";
  const rawRango = params.get("rango");
  const rango: Rango = rawRango === "dia" || rawRango === "mes" ? rawRango : "semana";
  const horizon = addDays(today, HORIZON_DAYS);

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // ---------- Datos ----------
  const [courts, setCourts] = useState<AdminCourt[] | null>(null);
  const [courtsError, setCourtsError] = useState<string | null>(null);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Ventana de la tira: 31 días; se mueve solo cuando el día elegido queda fuera.
  const [stripStart, setStripStart] = useState(() => addDays(date, -STRIP_BACK));
  const stripDays = useMemo(() => Array.from({ length: STRIP_DAYS }, (_, i) => addDays(stripStart, i)), [stripStart]);
  useEffect(() => {
    const d = diffDays(stripStart, date);
    if (d < 0 || d >= STRIP_DAYS) setStripStart(addDays(date, -STRIP_BACK));
  }, [date, stripStart]);

  useEffect(() => {
    const ctrl = new AbortController();
    api.admin
      .courts(ctrl.signal)
      .then(setCourts)
      .catch((e) => !ctrl.signal.aborted && setCourtsError(e instanceof ApiError ? e.message : "No pudimos cargar las canchas."));
    return () => ctrl.abort();
  }, []);

  // Solo la última petición, y solo para el día que se está viendo, escribe en el tablero.
  const dateRef = useRef(date);
  dateRef.current = date;
  const latest = useRef<AbortController | null>(null);
  const refresh = useCallback(async (background = false) => {
    latest.current?.abort();
    const ctrl = new AbortController();
    latest.current = ctrl;
    const day = dateRef.current;
    if (!background) setLoad({ status: "loading" });
    try {
      const bookings = await api.admin.bookings(day, ctrl.signal);
      if (latest.current === ctrl && dateRef.current === day) setLoad({ status: "ok", date: day, bookings });
    } catch (e) {
      if (latest.current !== ctrl || ctrl.signal.aborted || dateRef.current !== day) return;
      const message = e instanceof ApiError ? e.message : "No pudimos cargar las reservas.";
      if (background) setNotice({ kind: "error", message });
      else setLoad({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => latest.current?.abort();
  }, [date, refresh]);

  const stripEnd = stripDays[stripDays.length - 1]!;
  useEffect(() => {
    const ctrl = new AbortController();
    api.admin
      .calendar(stripStart, stripEnd, ctrl.signal)
      .then((rows) => !ctrl.signal.aborted && setCounts(new Map(rows.map((r) => [r.date, r.count]))))
      .catch(() => undefined); // los puntos son una ayuda: si fallan, la tira sigue funcionando
    return () => ctrl.abort();
  }, [stripStart, stripEnd, refreshKey]);

  const bookings = load.status === "ok" ? load.bookings : [];
  const live = bookings.filter((b) => b.status !== "cancelada");
  const cancelled = bookings.filter((b) => b.status === "cancelada").sort((a, b) => a.startTime.localeCompare(b.startTime));

  // ---------- Tarjeta (popover) ----------
  const [card, setCard] = useState<Card | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const overCard = useRef(false);
  const lastBar = useRef<string | null>(null);
  const suppressFocusPreview = useRef(false);
  const clearTimer = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };

  const preview = useCallback((b: AdminBooking, el: HTMLElement) => {
    clearTimer();
    setCard((c) => (c?.pinned && c.id !== b.id ? c : c?.pinned ? c : { id: b.id, anchor: el, pinned: false }));
  }, []);
  const previewEnd = useCallback(() => {
    clearTimer();
    hoverTimer.current = window.setTimeout(() => {
      if (overCard.current) return;
      setCard((c) => (c && !c.pinned ? null : c));
    }, 160);
  }, []);
  const pin = useCallback((b: AdminBooking, el: HTMLElement) => {
    clearTimer();
    lastBar.current = b.id;
    setCard({ id: b.id, anchor: el, pinned: true });
  }, []);

  const closeCard = useCallback((returnFocus: boolean) => {
    clearTimer();
    overCard.current = false;
    setCard(null);
    if (returnFocus && lastBar.current) {
      const id = lastBar.current;
      requestAnimationFrame(() => {
        const el =
          document.querySelector<HTMLElement>(`[data-booking="${id}"]`) ?? document.querySelector<HTMLElement>(".bboard-scroll");
        // Volver a la barra sin reabrir la vista previa por el foco.
        suppressFocusPreview.current = true;
        el?.focus();
        suppressFocusPreview.current = false;
      });
    }
  }, []);
  // Clic fuera de una tarjeta fijada la cierra; Esc se maneja dentro de la tarjeta.
  useEffect(() => {
    if (!card?.pinned) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".bcard") || t.closest(".bbar") || t.closest(".due-btn") || t.closest(".cancel-item")) return;
      setCard(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [card?.pinned]);

  // Cambiar de día o de pestaña cierra la tarjeta.
  useEffect(() => {
    setCard(null);
  }, [date, vista]);

  // Ir a una reserva desde «Por cobrar»: abre su tarjeta cuando el tablero de ese día está listo.
  const goTo = useRef<string | null>(null);
  useEffect(() => {
    if (load.status !== "ok" || !goTo.current) return;
    const id = goTo.current;
    goTo.current = null;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-booking="${id}"]`);
      if (!el) return;
      el.scrollIntoView({ block: "center", inline: "center" });
      lastBar.current = id;
      setCard({ id, anchor: el, pinned: true });
    });
  }, [load]);

  const cardBooking = card ? bookings.find((b) => b.id === card.id) : undefined;

  async function act(action: CardAction, input?: { amount: number; method: PaymentMethod }) {
    const b = cardBooking;
    if (!b) return;
    let message: string;
    if (action === "pay") {
      const paid = await api.admin.pay(b.id, input!);
      message = `Pago registrado: ${money(paid.payment.amount ?? b.price)} en ${(paid.payment.method ?? input!.method) === "yappy" ? "Yappy" : METHOD_LABEL[paid.payment.method ?? input!.method].toLowerCase()} · ${clientOf(b).name}.`;
    } else if (action === "noshow") {
      await api.admin.noShow(b.id);
      message = `${clientOf(b).name}: marcada como no se presentó. Conserva el horario y no se cobra.`;
    } else if (action === "cancel") {
      await api.admin.cancel(b.id);
      message = `Reserva de ${clientOf(b).name} cancelada. El horario quedó libre.`;
    } else {
      const { cancelled: n } = await api.admin.cancelFuture(b.seriesId!);
      message =
        n === 0
          ? "No quedaban reservas por cancelar en esa serie."
          : `Cancelaste ${n} ${n === 1 ? "reserva" : "reservas"} de la serie. Los horarios quedaron libres.`;
    }
    setNotice({ kind: "ok", message });
    closeCard(true);
    setRefreshKey((k) => k + 1);
    await refresh(true);
  }

  // ---------- Nueva reserva ----------
  const [creating, setCreating] = useState<{ courtId?: string; start?: string; key: number } | null>(null);
  const openNew = (courtId?: string, start?: string) => {
    setNotice(null);
    setCard(null);
    setCreating({ courtId, start, key: Date.now() });
  };

  // ---------- Pestañas ----------
  const tabs: { id: Vista; label: string }[] = [
    { id: "reservas", label: "Reservas" },
    { id: "pagos", label: "Pagos" },
  ];
  const switchTab = (v: Vista) => setParam({ vista: v === "pagos" ? "pagos" : null });
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next: Vista = e.key === "Home" ? "reservas" : e.key === "End" ? "pagos" : vista === "pagos" ? "reservas" : "pagos";
    switchTab(next);
    requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
  };

  const counts4 = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of live) {
      const k = vista === "pagos" ? payTone(b, now) : bookingTone(b, now);
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }, [live, vista, now]);

  const dayTotal = live.reduce((s, b) => s + (b.payment.status === "pagado" ? (b.payment.amount ?? 0) : 0), 0);
  const isNarrowSheet = narrow;

  return (
    <>
      <section className="hero hero-board">
        <div className="hero-inner">
          <div className="board-hero-top">
            <div>
              <p className="eyebrow">Tablero del complejo</p>
              <h1 className="hero-title board-hero-title cap">{formatLongDate(date)}</h1>
            </div>
            <div className="tabs" role="tablist" aria-label="Vista del tablero">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={vista === t.id}
                  aria-controls="panel-tablero"
                  tabIndex={vista === t.id ? 0 : -1}
                  className={`tab${vista === t.id ? " is-on" : ""}`}
                  onClick={() => switchTab(t.id)}
                  onKeyDown={onTabKey}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <AdminDayStrip days={stripDays} value={date} today={today} counts={counts} onChange={(d) => setParam({ fecha: d })} />
        </div>
      </section>

      <main className="page page-board" id="contenido">
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

        <div id="panel-tablero" role="tabpanel" aria-labelledby={`tab-${vista}`} className="tabpanel">
          {vista === "pagos" && (
            <PaymentsDashboard
              date={date}
              rango={rango}
              onRango={(r) => setParam({ rango: r === "semana" ? null : r })}
              refreshKey={refreshKey}
              onGo={(b) => {
                goTo.current = b.id;
                if (b.date === date) setLoad((l) => (l.status === "ok" ? { ...l } : l));
                else setParam({ fecha: b.date });
              }}
            />
          )}

          <div className={`admin-split${creating ? " has-aside" : ""}`}>
            <section className="board board-admin" aria-labelledby="tablero-t">
              <div className="board-head">
                <div>
                  <h2 className="board-title" id="tablero-t">
                    {vista === "pagos" ? "Cobros del día" : "Reservas del día"}
                  </h2>
                  <p className="board-sub">
                    {load.status === "ok" ? (
                      vista === "pagos" ? (
                        <>
                          {live.length} {live.length === 1 ? "reserva" : "reservas"} · cobrado en las reservas de este día{" "}
                          <strong className="num">{money(dayTotal)}</strong>
                        </>
                      ) : (
                        <>
                          {live.length} {live.length === 1 ? "reserva" : "reservas"}
                          {cancelled.length > 0 && ` · ${cancelled.length} ${cancelled.length === 1 ? "cancelada" : "canceladas"}`} · Pasa el cursor o toca
                          una barra para ver el detalle
                        </>
                      )
                    ) : (
                      " "
                    )}
                  </p>
                </div>
                <button type="button" className="btn btn-primary btn-small" onClick={() => openNew()} disabled={!courts}>
                  + Nueva reserva
                </button>
              </div>

              {(load.status === "loading" || (!courts && !courtsError)) && (
                <div className="state-box" aria-busy="true">
                  <div className="skeleton" />
                  <div className="skeleton" />
                </div>
              )}
              {(load.status === "error" || courtsError) && (
                <div className="state-box empty" role="alert">
                  <span className="empty-title">No pudimos cargar el tablero</span>
                  <p>{courtsError ?? (load.status === "error" ? load.message : "")}</p>
                  <button type="button" className="btn btn-primary" onClick={() => void refresh()}>
                    Reintentar
                  </button>
                </div>
              )}
              {load.status === "ok" && courts && (
                <>
                  <BookingBoard
                    courts={courts}
                    bookings={bookings}
                    date={date}
                    vista={vista}
                    now={now}
                    horizon={horizon}
                    openId={card?.id ?? null}
                    onFree={(courtId, time) => openNew(courtId, time)}
                    events={{
                      onPreview: (b, el) => {
                        if (suppressFocusPreview.current) return;
                        preview(b, el);
                      },
                      onPreviewEnd: previewEnd,
                      onPin: pin,
                    }}
                  />
                  <div className="board-foot">
                    <BoardLegend vista={vista} counts={counts4} showNow={date === today} />
                    {live.length === 0 && <p className="muted small board-empty">Sin reservas este día. Toca un bloque libre para crear una.</p>}
                  </div>
                </>
              )}

              {load.status === "ok" && cancelled.length > 0 && (
                <div className="cancelled">
                  <h3 className="cancelled-title">
                    Canceladas este día <span className="dash-count num">{cancelled.length}</span>
                  </h3>
                  <p className="muted small cancelled-note">No ocupan bloques del tablero.</p>
                  <ul className="cancelled-list">
                    {cancelled.map((b) => (
                      <li key={b.id}>
                        <button
                          type="button"
                          className="cancel-item"
                          data-booking={b.id}
                          aria-haspopup="dialog"
                          aria-expanded={card?.id === b.id}
                          onClick={(e) => pin(b, e.currentTarget)}
                        >
                          <span className="num cancel-time">{formatRange12(b.startTime, b.endTime)}</span>
                          <span className="cancel-who">
                            <strong>{clientOf(b).name}</strong> <span className="muted">· {b.courtName}</span>
                          </span>
                          <span className="badge badge-muted">Cancelada</span>
                          {b.payment.status === "pagado" && <span className="badge badge-warn">Estaba pagada</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {creating && courts && (
              <NewBookingForm
                key={creating.key}
                courts={courts}
                initialDate={date}
                initialCourtId={creating.courtId}
                initialStart={creating.start}
                onClose={() => setCreating(null)}
                onCreated={(b, count) => {
                  setCreating(null);
                  setNotice({
                    kind: "ok",
                    message:
                      count > 1
                        ? `Serie creada: ${count} reservas semanales desde el ${formatLongDate(b.date)}, ${b.courtName}, ${formatTime12(b.startTime)} – ${formatTime12(b.endTime)}, ${money(b.price)} c/u.`
                        : `Reserva creada: ${b.courtName}, ${formatTime12(b.startTime)} – ${formatTime12(b.endTime)}, ${money(b.price)}.`,
                  });
                  setRefreshKey((k) => k + 1);
                  if (b.date !== date) setParam({ fecha: b.date });
                  else void refresh(true);
                }}
              />
            )}
          </div>
        </div>

        {card && cardBooking && (
          <BookingCard
            booking={cardBooking}
            anchor={card.anchor}
            pinned={card.pinned}
            sheet={isNarrowSheet}
            now={now}
            onClose={closeCard}
            onPin={() => {
              lastBar.current = card.id;
              setCard((c) => (c ? { ...c, pinned: true } : c));
            }}
            onHoverChange={(inside) => {
              overCard.current = inside;
              if (inside) clearTimer();
              else if (!card.pinned) previewEnd();
            }}
            onAction={act}
          />
        )}
      </main>
    </>
  );
}
