import { useEffect, useRef } from "react";
import type { AdminBooking, AdminCourt } from "../../api";
import { fromSlot } from "../../shared";
import { money } from "../../dates";
import { formatTime12 } from "../../format";
import { courtMeta, shortName } from "../AvailabilityGrid";
import { CourtIcon } from "../CourtIcon";
import {
  bookingTone,
  clientOf,
  courtHours,
  dayRange,
  METHOD_LABEL,
  PAY_LABEL,
  payTone,
  shortPerson,
  startSlotOf,
  TONE_LABEL,
  type Vista,
} from "./board";

/** "8:00 p. m." → "8:00p" para la barra (la etiqueta accesible lleva la hora completa). */
function compactTime(hhmm: string): string {
  const t = formatTime12(hhmm);
  return t.replace(" a. m.", "a").replace(" p. m.", "p");
}

export interface BarEvents {
  onPreview: (b: AdminBooking, el: HTMLElement, viaPointer?: boolean) => void;
  onPreviewEnd: () => void;
  onPin: (b: AdminBooking, el: HTMLElement) => void;
}

/**
 * Tablero canchas × bloques de 30 min (CR-02). Cada reserva no cancelada es una barra que abarca sus
 * bloques; en Reservas se colorea por estado y en Pagos por cobro. Los bloques libres abren «Nueva reserva».
 */
export function BookingBoard({
  courts,
  bookings,
  date,
  vista,
  now,
  horizon,
  openId,
  onFree,
  events,
}: {
  courts: AdminCourt[];
  bookings: AdminBooking[];
  date: string;
  vista: Vista;
  now: Date;
  /** Último día reservable (RN-14): después de esa fecha los bloques libres no se ofrecen. */
  horizon: string;
  openId: string | null;
  onFree: (courtId: string, time: string) => void;
  events: BarEvents;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const active = courts.filter((c) => c.active);
  const range = dayRange(active, date);
  const live = bookings.filter((b) => b.status !== "cancelada");

  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const nowSlotF = (now.getHours() * 60 + now.getMinutes()) / 30;
  const firstFree = date > today ? -1 : date < today ? Infinity : Math.floor(nowSlotF) + 1;
  const beyond = date > horizon;

  // Al cambiar de día, lleva a la vista la primera reserva (o «ahora» si es hoy).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(".now-col") ?? el.querySelector<HTMLElement>(".bbar");
    const sticky = el.querySelector<HTMLElement>(".bcourt");
    el.scrollLeft = 0;
    if (target && target.offsetLeft + target.offsetWidth > el.clientWidth) {
      el.scrollLeft = Math.max(0, target.offsetLeft - (sticky?.offsetWidth ?? 0) - 48);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, range?.from, range?.to, live.length > 0]);

  if (!range || active.length === 0) {
    return (
      <div className="state-box empty">
        <span className="empty-title">El complejo no abre este día</span>
        <p>Ninguna cancha activa tiene horario de atención para esta fecha.</p>
      </div>
    );
  }

  const cols = range.to - range.from;
  const col = (slot: number) => slot - range.from + 2;

  return (
    <div className="bboard-scroll" ref={scroller} role="region" aria-label="Tablero de canchas y horarios" tabIndex={0}>
      <div
        className={`bboard vista-${vista}`}
        style={{
          gridTemplateColumns: `var(--court-col) repeat(${cols}, var(--bcell-w))`,
          gridTemplateRows: `auto repeat(${active.length}, var(--brow-h))`,
        }}
      >
        <div className="bcorner" aria-hidden="true" style={{ gridRow: 1, gridColumn: 1 }}>
          Cancha
        </div>
        {Array.from({ length: cols }, (_, i) => {
          const slot = range.from + i;
          const t = fromSlot(slot);
          return (
            <div key={slot} className={`bhead${t.endsWith(":00") ? " is-hour" : ""}`} aria-hidden="true" style={{ gridRow: 1, gridColumn: i + 2 }}>
              {t.endsWith(":00") ? formatTime12(t) : ""}
            </div>
          );
        })}

        {date === today && nowSlotF >= range.from && nowSlotF < range.to && (
          <div
            className="now-col"
            aria-hidden="true"
            style={{ gridRow: `1 / ${active.length + 2}`, gridColumn: col(Math.floor(nowSlotF)) }}
          >
            <span className="now-line" style={{ left: `${(nowSlotF % 1) * 100}%` }} />
          </div>
        )}

        {active.map((c, r) => {
          const row = r + 2;
          const hours = courtHours(c, date);
          const mine = live.filter((b) => b.courtId === c.id);
          const own = new Set(mine.flatMap((b) => Array.from({ length: b.durationMin / 30 }, (_, i) => startSlotOf(b) + i)));
          // Bloques tomados por otra cancha que comparte espacio (Completa ↔ Medias).
          const blockedBy = new Map<number, string>();
          for (const b of live) {
            if (b.courtId === c.id || !b.spaceIds?.some((s) => c.spaceIds.includes(s))) continue;
            for (let i = 0; i < b.durationMin / 30; i++) blockedBy.set(startSlotOf(b) + i, shortName(b.courtName));
          }
          return (
            <div key={c.id} className="brow" role="group" aria-label={c.name}>
              <div className="bcourt" style={{ gridRow: row, gridColumn: 1 }}>
                <CourtIcon sport={c.sport} half={c.format === "5vs5"} size={40} />
                <div className="court-text">
                  <span className="court-name">{shortName(c.name)}</span>
                  <span className="court-meta">
                    {courtMeta({ ...c, courtId: c.id, slots: [] })} · {mine.length} {mine.length === 1 ? "reserva" : "reservas"}
                  </span>
                </div>
              </div>
              {Array.from({ length: cols }, (_, i) => {
                const slot = range.from + i;
                const t = fromSlot(slot);
                const style = { gridRow: row, gridColumn: i + 2 };
                const hourCls = t.endsWith(":00") ? " hour-start" : "";
                if (!hours || slot < hours.open || slot >= hours.close) {
                  return <div key={slot} className={`bcell closed${hourCls}`} style={style} aria-hidden="true" />;
                }
                if (own.has(slot)) return <div key={slot} className={`bcell under${hourCls}`} style={style} aria-hidden="true" />;
                const other = blockedBy.get(slot);
                if (other) {
                  return (
                    <div
                      key={slot}
                      className={`bcell blocked${hourCls}`}
                      style={style}
                      role="img"
                      aria-label={`${c.name} ${formatTime12(t)} ocupado por ${other}`}
                      title={`${formatTime12(t)} · ocupado por ${other}`}
                    />
                  );
                }
                if (slot < firstFree || beyond) {
                  return <div key={slot} className={`bcell past${hourCls}`} style={style} aria-hidden="true" title={`${formatTime12(t)} · libre`} />;
                }
                return (
                  <button
                    key={slot}
                    type="button"
                    tabIndex={-1}
                    className={`bcell free${hourCls}`}
                    style={style}
                    aria-label={`${c.name} ${formatTime12(t)} libre: nueva reserva`}
                    title={`${formatTime12(t)} · libre. Nueva reserva`}
                    onClick={() => onFree(c.id, t)}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                );
              })}
              {mine.map((b) => {
                const s = startSlotOf(b);
                const len = b.durationMin / 30;
                const from = Math.max(s, range.from);
                const to = Math.min(s + len, range.to);
                if (to <= from) return null;
                const client = clientOf(b);
                const tone = bookingTone(b, now);
                const pay = payTone(b, now);
                const cls = vista === "pagos" ? `pay-${pay}` : `tone-${tone}`;
                const payText =
                  pay === "paid"
                    ? `${money(b.payment.amount ?? b.price)}${b.payment.method ? ` · ${METHOD_LABEL[b.payment.method]}` : ""}`
                    : pay === "due"
                      ? `${money(b.price)} por cobrar`
                      : TONE_LABEL[tone];
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`bbar ${cls}${openId === b.id ? " is-open" : ""}`}
                    data-booking={b.id}
                    style={{ gridRow: row, gridColumn: `${col(from)} / ${col(to)}` }}
                    aria-haspopup="dialog"
                    aria-expanded={openId === b.id}
                    aria-label={`${client.name}, ${b.courtName}, ${formatTime12(b.startTime)} a ${formatTime12(b.endTime)}, ${TONE_LABEL[tone]}, ${PAY_LABEL[pay]}`}
                    onPointerEnter={(e) => e.pointerType === "mouse" && events.onPreview(b, e.currentTarget, true)}
                    onPointerLeave={(e) => e.pointerType === "mouse" && events.onPreviewEnd()}
                    onFocus={(e) => events.onPreview(b, e.currentTarget)}
                    onBlur={() => events.onPreviewEnd()}
                    onKeyDown={(e) => e.key === "Escape" && events.onPreviewEnd()}
                    onClick={(e) => events.onPin(b, e.currentTarget)}
                  >
                    <span className="bbar-name">
                      {b.seriesId && <span className="bbar-series" aria-hidden="true">↻</span>}
                      {shortPerson(client.name)}
                    </span>
                    <span className="bbar-sub num">
                      {vista === "pagos" ? payText : len >= 3 ? `${compactTime(b.startTime)}–${compactTime(b.endTime)}` : compactTime(b.startTime)}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BoardLegend({ vista, counts, showNow }: { vista: Vista; counts: Record<string, number>; showNow?: boolean }) {
  const items =
    vista === "pagos"
      ? [
          { cls: "pay-paid", label: "Pagado", key: "paid" },
          { cls: "pay-due", label: "Por cobrar", key: "due" },
          { cls: "pay-na", label: "No aplica", key: "na" },
        ]
      : [
          { cls: "tone-upcoming", label: "Confirmada", key: "upcoming" },
          { cls: "tone-live", label: "En curso", key: "live" },
          { cls: "tone-played", label: "Jugada", key: "played" },
          { cls: "tone-noshow", label: "No se presentó", key: "noshow" },
        ];
  return (
    <ul className="blegend" aria-label="Leyenda del tablero">
      {items.map((i) => (
        <li key={i.key}>
          <span className={`bsw ${i.cls}`} aria-hidden="true" />
          {i.label}
          <span className="blegend-n num">{counts[i.key] ?? 0}</span>
        </li>
      ))}
      <li>
        <span className="bsw bsw-blocked" aria-hidden="true" />
        Ocupada por cancha compartida
      </li>
      <li>
        <span className="bsw bsw-closed" aria-hidden="true" />
        Cerrado
      </li>
      {showNow && (
        <li>
          <span className="bsw bsw-now" aria-hidden="true" />
          Ahora
        </li>
      )}
    </ul>
  );
}
