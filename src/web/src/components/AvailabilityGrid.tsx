import { useEffect, useRef } from "react";
import { priceFor, type Duration } from "../shared";
import type { CourtAvailability, SlotState } from "../api";
import { CourtIcon } from "./CourtIcon";

export interface Selection {
  courtId: string;
  slot: number;
}

/** Bloques que ocuparía la selección y si todos están libres. */
export function selectionRange(court: CourtAvailability | undefined, sel: Selection | null, duration: Duration) {
  if (!court || !sel) return { slots: [] as number[], fits: false };
  const slots = Array.from({ length: duration / 30 }, (_, i) => sel.slot + i);
  const byIndex = new Map(court.slots.map((s) => [s.slot, s.state]));
  const fits = slots.every((s) => byIndex.get(s) === "libre");
  return { slots, fits };
}

const STATE_LABEL: Record<SlotState, string> = {
  libre: "libre",
  ocupado: "ocupado",
  cerrado: "cerrado",
  pasado: "ya pasó",
};

export function courtMeta(c: CourtAvailability): string {
  if (c.sport === "futbol") return c.format === "7vs7" ? "Fútbol 7" : "Fútbol 5";
  return c.sport === "padel" ? "Pádel" : "Básquet";
}

/** Nombre corto para la columna fija: "Fútbol · Media A" → "Media A". */
export function shortName(name: string): string {
  const parts = name.split("·");
  return (parts[parts.length - 1] ?? name).trim();
}

export function AvailabilityGrid({
  courts,
  duration,
  selection,
  onPick,
}: {
  courts: CourtAvailability[];
  duration: Duration;
  selection: Selection | null;
  onPick: (s: Selection) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const columns = [...new Map(courts.flatMap((c) => c.slots.map((s) => [s.slot, s.time] as const))).entries()].sort(
    (a, b) => a[0] - b[0],
  );
  const selCourt = courts.find((c) => c.courtId === selection?.courtId);
  const { slots: selSlots, fits } = selectionRange(selCourt, selection, duration);
  const firstSlotKey = columns[0]?.[0];

  // Al cambiar de día, lleva a la vista el primer bloque útil (la selección o el primer libre).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target =
      (selection && el.querySelector<HTMLElement>(`[data-slot="${selection.courtId}:${selection.slot}"]`)) ||
      el.querySelector<HTMLElement>(".cell.free");
    const sticky = el.querySelector<HTMLElement>(".court-cell");
    // Solo desplaza si el bloque no se ve entero (en escritorio el horario de L–V cabe sin scroll).
    if (target && target.offsetLeft + target.offsetWidth > el.clientWidth) {
      el.scrollLeft = Math.max(0, target.offsetLeft - (sticky?.offsetWidth ?? 0) - 8);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSlotKey, courts.length]);

  return (
    <div className="grid-scroll" ref={scroller} role="region" aria-label="Cuadrícula de canchas y horarios" tabIndex={0}>
      <div className="grid" style={{ gridTemplateColumns: `var(--court-col) repeat(${columns.length}, var(--cell-w))` }}>
        <div className="corner" aria-hidden="true">
          Cancha
        </div>
        {columns.map(([slot, time]) => (
          <div key={slot} className={`time-head${time.endsWith(":00") ? " is-hour" : ""}`} aria-hidden="true">
            {time}
          </div>
        ))}
        {courts.map((c) => {
          const states = new Map(c.slots.map((s) => [s.slot, s.state]));
          const price = priceFor(c.prices, duration);
          return (
            <div className="row" key={c.courtId} role="group" aria-label={c.name}>
              <div className="court-cell">
                <CourtIcon sport={c.sport} half={c.format === "5vs5"} size={44} />
                <div className="court-text">
                  <span className="court-name">{shortName(c.name)}</span>
                  <span className="court-meta">
                    {courtMeta(c)} · <strong>${price}</strong>
                  </span>
                </div>
              </div>
              {columns.map(([slot, time]) => {
                const state = states.get(slot) ?? "cerrado";
                const inSel = selection?.courtId === c.courtId && selSlots.includes(slot);
                const isStart = inSel && selection?.slot === slot;
                const key = `${c.courtId}:${slot}`;
                if (state !== "libre") {
                  return (
                    <div
                      key={slot}
                      data-slot={key}
                      className={`cell ${state}${inSel ? " sel-clash" : ""}${time.endsWith(":00") ? " hour-start" : ""}`}
                      role="img"
                      aria-label={`${c.name} ${time} ${STATE_LABEL[state]}`}
                      title={`${time} · ${STATE_LABEL[state]}`}
                    />
                  );
                }
                return (
                  <button
                    key={slot}
                    type="button"
                    data-slot={key}
                    className={`cell free${inSel ? (fits ? " sel" : " sel-bad") : ""}${isStart ? " sel-start" : ""}${time.endsWith(":00") ? " hour-start" : ""}`}
                    aria-label={`${c.name} ${time} libre`}
                    aria-pressed={isStart}
                    title={`${time} · libre`}
                    onClick={() => onPick({ courtId: c.courtId, slot })}
                  >
                    {isStart && <span className="cell-time">{time}</span>}
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

export function Legend() {
  return (
    <ul className="legend" aria-label="Leyenda">
      <li>
        <span className="sw sw-free" aria-hidden="true" />
        Libre
      </li>
      <li>
        <span className="sw sw-busy" aria-hidden="true" />
        Ocupado
      </li>
      <li>
        <span className="sw sw-closed" aria-hidden="true" />
        Cerrado o ya pasó
      </li>
      <li>
        <span className="sw sw-sel" aria-hidden="true" />
        Tu elección
      </li>
    </ul>
  );
}
