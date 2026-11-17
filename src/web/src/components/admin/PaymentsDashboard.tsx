import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { api, ApiError, type AdminBooking, type PaymentsSummary } from "../../api";
import { addDays, diffDays, money, parseIso, shortWeekday, weekdayIndex } from "../../dates";
import { formatLongDate, formatTime12 } from "../../format";
import { AlertIcon, CheckIcon } from "../Icons";
import { shortName } from "../AvailabilityGrid";
import { clientOf, METHOD_LABEL, METHOD_ORDER, shortPerson } from "./board";

export type Rango = "dia" | "semana" | "mes";

const MONTH = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTH_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Rango anclado en la fecha elegida: el día, su semana (lunes a domingo) o su mes. */
export function rangeOf(date: string, rango: Rango): { from: string; to: string } {
  if (rango === "dia") return { from: date, to: date };
  if (rango === "semana") {
    const from = addDays(date, -weekdayIndex(date));
    return { from, to: addDays(from, 6) };
  }
  const d = parseIso(date);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const ym = date.slice(0, 7);
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

function rangeLabel(from: string, to: string, rango: Rango): string {
  if (rango === "dia") return formatLongDate(from);
  const a = parseIso(from);
  const b = parseIso(to);
  if (rango === "mes") return `${MONTH[a.getMonth()]} de ${a.getFullYear()}`;
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} de ${MONTH[b.getMonth()]}`
    : `${a.getDate()} ${MONTH_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTH_SHORT[b.getMonth()]}`;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);
const fmtPct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} %`;

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; from: string; to: string; summary: PaymentsSummary; pending: AdminBooking[] };

/**
 * Pestaña Pagos (CR-02 / CA-24): indicadores del rango (día / semana / mes) desde
 * `GET /api/admin/payments/summary`, desglose por método, cobrado por día y lo que queda por cobrar.
 */
export function PaymentsDashboard({
  date,
  rango,
  onRango,
  refreshKey,
  onGo,
}: {
  date: string;
  rango: Rango;
  onRango: (r: Rango) => void;
  refreshKey: number;
  onGo: (b: AdminBooking) => void;
}) {
  const id = useId();
  const { from, to } = rangeOf(date, rango);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const latest = useRef<AbortController | null>(null);

  useEffect(() => {
    latest.current?.abort();
    const ctrl = new AbortController();
    latest.current = ctrl;
    // Tras una acción (solo cambia refreshKey) se conservan las cifras del mismo rango mientras se
    // actualizan; si cambió el rango, `ok` deja de coincidir y se ve el esqueleto.
    setLoad((l) => (l.status === "ok" && l.from === from && l.to === to ? l : { status: "loading" }));
    Promise.all([api.admin.summary(from, to, ctrl.signal), api.admin.payments("pending", ctrl.signal)])
      .then(([summary, pending]) => {
        if (latest.current !== ctrl) return;
        setLoad({ status: "ok", from, to, summary, pending: pending.filter((b) => b.date >= from && b.date <= to) });
      })
      .catch((e) => {
        if (ctrl.signal.aborted || latest.current !== ctrl) return;
        setLoad({ status: "error", message: e instanceof ApiError ? e.message : "No pudimos cargar los indicadores." });
      });
    return () => ctrl.abort();
  }, [from, to, refreshKey]);

  const label = rangeLabel(from, to, rango);
  // Solo se muestran cifras del rango que se está viendo; mientras llega el nuevo, esqueleto.
  const ok = load.status === "ok" && load.from === from && load.to === to ? load : null;

  return (
    <section className="paydash" aria-labelledby={`${id}-t`}>
      <div className="paydash-head">
        <div>
          <p className="paydash-eyebrow">Caja</p>
          <h2 className="paydash-title cap" id={`${id}-t`}>
            {label}
          </h2>
        </div>
        <div className="range-seg" role="radiogroup" aria-label="Rango de los indicadores">
          {(["dia", "semana", "mes"] as Rango[]).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={r === rango} className={r === rango ? "is-on" : ""} onClick={() => onRango(r)}>
              {r === "dia" ? "Día" : r === "semana" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>

      {!ok && load.status !== "error" && (
        <div className="state-box" aria-busy="true">
          <div className="skeleton" />
        </div>
      )}
      {load.status === "error" && (
        <div className="notice notice-error" role="alert">
          <AlertIcon />
          <div>{load.message}</div>
        </div>
      )}
      {ok && <Ledger s={ok.summary} />}
      <div className="paydash-grid">
        {ok && <Cards s={ok.summary} pending={ok.pending} from={from} to={to} rango={rango} date={date} onGo={onGo} />}
        {/* Fuera de la carga del resumen: no depende del rango ni se reinicia al cambiarlo. */}
        <LoyaltyCard />
      </div>
    </section>
  );
}

function Ledger({ s }: { s: PaymentsSummary }) {
  const generated = s.collected + s.pending;
  const rate = pct(s.collected, generated);
  return (
      <div className="ledger" data-testid="indicadores">
        <div className="ledger-main">
          <span className="ledger-label">Total cobrado</span>
          <span className="ledger-total num" data-testid="kpi-cobrado">
            {money(s.collected)}
          </span>
          <div className="ledger-meter" aria-hidden="true">
            <span style={{ width: `${rate}%` }} />
          </div>
          <span className="ledger-sub">
            {generated > 0 ? (
              <>
                {fmtPct(rate)} de {money(generated)} generados (cobrado + por cobrar)
              </>
            ) : (
              "Sin cobros ni pendientes en el rango"
            )}
          </span>
        </div>
        <dl className="ledger-stats">
          <div className={`stat${s.pendingCount ? " stat-due" : ""}`}>
            <dt>Por cobrar</dt>
            <dd className="num" data-testid="kpi-por-cobrar">
              {money(s.pending)}
            </dd>
            <dd className="stat-sub">
              {s.pendingCount} {s.pendingCount === 1 ? "reserva jugada" : "reservas jugadas"}
            </dd>
          </div>
          <div className="stat">
            <dt>Reservas</dt>
            <dd className="num" data-testid="kpi-reservas">
              {s.bookings}
            </dd>
            <dd className="stat-sub">
              {s.cancelled} {s.cancelled === 1 ? "cancelada" : "canceladas"} aparte
            </dd>
          </div>
          <div className="stat">
            <dt>Ocupación</dt>
            <dd className="num" data-testid="kpi-ocupacion">
              {fmtPct(s.occupancyPct)}
            </dd>
            <dd className="stat-sub">
              <span className="mini-meter" aria-hidden="true">
                <span style={{ width: `${Math.min(100, s.occupancyPct)}%` }} />
              </span>
              de los bloques abiertos
            </dd>
          </div>
          <div className={`stat${s.noShow ? " stat-warn" : ""}`}>
            <dt>No-shows</dt>
            <dd className="num" data-testid="kpi-noshow">
              {s.noShow}
            </dd>
            <dd className="stat-sub">{s.bookings ? `${fmtPct(pct(s.noShow, s.bookings))} de las reservas` : "—"}</dd>
          </div>
        </dl>
      </div>
  );
}

function Cards({
  s,
  pending,
  from,
  to,
  rango,
  date,
  onGo,
}: {
  s: PaymentsSummary;
  pending: AdminBooking[];
  from: string;
  to: string;
  rango: Rango;
  date: string;
  onGo: (b: AdminBooking) => void;
}) {
  return (
    <>
        <section className="dash-card" aria-labelledby="metodos-t">
          <h3 className="dash-title" id="metodos-t">
            Por método de pago
          </h3>
          <ul className="methods" data-testid="por-metodo">
            {[...METHOD_ORDER]
              .sort((a, b) => s.byMethod[b] - s.byMethod[a])
              .map((m) => {
                const p = pct(s.byMethod[m], s.collected);
                return (
                  <li key={m} className="method-row">
                    <span className="method-name">{METHOD_LABEL[m]}</span>
                    <span className="method-track" aria-hidden="true">
                      <span className="method-fill" style={{ width: `${p}%` }} />
                    </span>
                    <span className="method-amt num">{money(s.byMethod[m])}</span>
                    <span className="method-pct num">{fmtPct(p)}</span>
                  </li>
                );
              })}
          </ul>
          {s.collected === 0 && <p className="muted small dash-note">Todavía no hay cobros en este rango.</p>}
        </section>

        {rango === "dia" ? (
          <DueList pending={pending} onGo={onGo} />
        ) : (
          <section className="dash-card" aria-labelledby="pordia-t">
            <h3 className="dash-title" id="pordia-t">
              Cobrado por día
            </h3>
            <DayChart byDay={s.byDay} from={from} to={to} selected={date} rango={rango} />
          </section>
        )}
        {rango !== "dia" && <DueList pending={pending} onGo={onGo} />}
    </>
  );
}

/** Barras verticales simples en SVG (una serie, sin leyenda) + tabla oculta con los mismos datos. */
function DayChart({ byDay, from, to, selected, rango }: { byDay: PaymentsSummary["byDay"]; from: string; to: string; selected: string; rango: Rango }) {
  const values = new Map(byDay.map((d) => [d.date, d.collected]));
  const n = diffDays(from, to) + 1;
  const days = Array.from({ length: n }, (_, i) => addDays(from, i));
  const max = Math.max(0, ...days.map((d) => values.get(d) ?? 0));
  const top = max <= 0 ? 100 : niceCeil(max);
  const fig = useRef<HTMLElement>(null);
  const [W, setW] = useState(560);
  // El ancho del SVG sigue al de su caja para que el texto del eje no se escale (390 px legible).
  useEffect(() => {
    const el = fig.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 180;
  const padL = 44;
  const padB = 26;
  const padT = 10;
  const step = (W - padL) / n;
  const barW = Math.max(4, Math.min(36, step - (rango === "mes" ? 3 : 10)));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const total = byDay.reduce((a, d) => a + d.collected, 0);
  const best = days.reduce((a, d) => ((values.get(d) ?? 0) > (values.get(a) ?? 0) ? d : a), days[0]!);
  const summary =
    total > 0
      ? `Cobrado por día: total ${money(total)}; el día con más cobros fue ${formatLongDate(best)} con ${money(values.get(best) ?? 0)}.`
      : "Cobrado por día: sin cobros en el rango.";

  return (
    <figure className="daychart" ref={fig}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={summary}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={W} y1={y(top * f)} y2={y(top * f)} className="grid-line" />
            <text x={padL - 8} y={y(top * f) + 4} textAnchor="end" className="axis-text">
              {money(top * f)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const v = values.get(d) ?? 0;
          const x = padL + i * step + (step - barW) / 2;
          const h = H - padB - y(v);
          const showLabel = rango === "semana" ? step > 34 || i % 2 === 0 : i === 0 || parseIso(d).getDate() % 5 === 0;
          return (
            <g key={d} className={`dc-bar${d === selected ? " is-sel" : ""}`}>
              <title>{`${formatLongDate(d)}: ${money(v)}`}</title>
              <rect x={padL + i * step} y={padT} width={step} height={H - padT - padB} className="dc-hit" />
              {v > 0 && <path d={roundedTop(x, y(v), barW, h, Math.min(4, barW / 2))} className="dc-fill" />}
              {v === 0 && <line x1={x} x2={x + barW} y1={H - padB} y2={H - padB} className="dc-zero" />}
              {showLabel && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" className={`axis-text${d === selected ? " is-sel" : ""}`}>
                  {rango === "semana" ? `${shortWeekday(d)} ${parseIso(d).getDate()}` : parseIso(d).getDate()}
                </text>
              )}
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={H - padB} y2={H - padB} className="base-line" />
      </svg>
      <table className="sr-only">
        <caption>Cobrado por día</caption>
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col">Cobrado</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d}>
              <th scope="row">{formatLongDate(d)}</th>
              <td>{money(values.get(d) ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function niceCeil(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= r) return `M${x},${y + h}V${y}H${x + w}V${y + h}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function DueList({ pending, onGo }: { pending: AdminBooking[]; onGo: (b: AdminBooking) => void }) {
  const list = [...pending].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  return (
    <section className="dash-card" aria-labelledby="due-t">
      <h3 className="dash-title" id="due-t">
        Por cobrar <span className="dash-count num">{list.length}</span>
      </h3>
      {list.length === 0 ? (
        <p className="muted small dash-note">Nada pendiente: todas las reservas jugadas del rango están cobradas o marcadas.</p>
      ) : (
        <ul className="due-mini">
          {list.slice(0, 8).map((b) => {
            const d = parseIso(b.date);
            return (
              <li key={b.id}>
                <button type="button" className="due-btn" onClick={() => onGo(b)}>
                  <span className="due-date num">
                    <span>{shortWeekday(b.date)}</span>
                    <strong>{d.getDate()}</strong>
                  </span>
                  <span className="due-what">
                    <strong>{shortPerson(clientOf(b).name)}</strong>
                    <span className="muted small">
                      {shortName(b.courtName)} · {formatTime12(b.startTime)}
                    </span>
                  </span>
                  <span className="due-amt num">{money(b.price)}</span>
                  <span className="sr-only">: ver en el tablero para cobrar</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > 8 && <p className="muted small dash-note">Y {list.length - 8} más en el rango.</p>}
    </section>
  );
}

/** CR-02 / CA-25: % de descuento de socios (0–50, entero). */
function LoyaltyCard() {
  const id = useId();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.admin
      .loyalty()
      .then((r) => {
        if (!alive) return;
        setSaved(r.discountPct);
        setValue(String(r.discountPct));
      })
      .catch(() => alive && setMsg({ kind: "error", text: "No pudimos leer el % de socios." }));
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!/^\d{1,2}$/.test(value.trim()) || n > 50) {
      setMsg({ kind: "error", text: "Escribe un número entero entre 0 y 50." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.admin.setLoyalty(n);
      setSaved(r.discountPct);
      setValue(String(r.discountPct));
      setMsg({ kind: "ok", text: `Guardado: los socios pagan ${r.discountPct} % menos en las reservas nuevas.` });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof ApiError ? err.message : "No pudimos guardar el %." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="dash-card loyalty" onSubmit={submit} noValidate aria-labelledby={`${id}-t`}>
      <h3 className="dash-title" id={`${id}-t`}>
        Descuento de socios
      </h3>
      <p className="muted small dash-note">
        Se aplica a las reservas hechas con cuenta del Club de socios. Las reservas ya hechas no cambian.
      </p>
      <div className="loyalty-row">
        <label className={`field loyalty-field${msg?.kind === "error" ? " has-error" : ""}`}>
          <span className="sr-only">Descuento de socios (%)</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={50}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={msg?.kind === "error" ? true : undefined}
            aria-describedby={`${id}-m`}
          />
          <span className="loyalty-unit" aria-hidden="true">
            %
          </span>
        </label>
        <button type="submit" className="btn btn-primary btn-small" disabled={busy || saved === null || String(saved) === value.trim()}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </div>
      <p id={`${id}-m`} className={`loyalty-msg ${msg?.kind ?? ""}`} role={msg?.kind === "error" ? "alert" : "status"}>
        {msg && (msg.kind === "ok" ? <CheckIcon /> : <AlertIcon />)}
        {msg?.text ?? "Entre 0 y 50 %, en números enteros."}
      </p>
    </form>
  );
}
