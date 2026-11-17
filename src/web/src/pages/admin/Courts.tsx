import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, type AdminCourt, type CourtInput, type ScheduleDay } from "../../api";
import { CourtIcon } from "../../components/CourtIcon";
import { AlertIcon, CheckIcon } from "../../components/Icons";
import { defaultSchedule, ScheduleEditor, scheduleErrors } from "../../components/admin/ScheduleEditor";
import { parsePrices, PriceEditor, pricesToDraft, type PriceDraft } from "../../components/admin/PriceEditor";
import { money } from "../../dates";
import type { Sport } from "../../shared";

const SPORT_LABEL: Record<Sport, string> = { futbol: "Fútbol", padel: "Pádel", basquet: "Básquet" };
const RN10 = "Los cambios solo afectan a las reservas nuevas: las reservas ya hechas conservan su precio y horario.";

function bodyOf(c: AdminCourt, over: Partial<CourtInput> = {}): CourtInput {
  return {
    name: c.name,
    sport: c.sport,
    ...(c.format ? { format: c.format } : {}),
    spaceIds: c.spaceIds,
    active: c.active,
    prices: c.prices,
    schedule: c.schedule,
    ...over,
  };
}

type Notice = { kind: "ok" | "error"; message: string } | null;

export function Courts() {
  const [courts, setCourts] = useState<AdminCourt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .courts()
      .then((list) => {
        setCourts(list);
        setSelected((s) => s ?? list[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "No pudimos cargar las canchas."));
  }, []);

  const replace = (c: AdminCourt) => setCourts((list) => (list ?? []).map((x) => (x.id === c.id ? c : x)));
  const current = courts?.find((c) => c.id === selected);

  async function toggle(c: AdminCourt) {
    setToggling(c.id);
    setNotice(null);
    try {
      const saved = await api.admin.updateCourt(c.id, bodyOf(c, { active: !c.active }));
      replace(saved);
      setNotice({
        kind: "ok",
        message: saved.active
          ? `${saved.name} vuelve a estar activa y visible para los clientes.`
          : `${saved.name} quedó en mantenimiento: no aparece en la disponibilidad ni admite reservas nuevas. Las reservas existentes no cambian.`,
      });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof ApiError ? e.message : "No pudimos cambiar el estado." });
    } finally {
      setToggling(null);
    }
  }

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <p className="eyebrow">Canchas y horarios</p>
          <h1 className="hero-title">Canchas</h1>
          <p className="hero-sub">{RN10}</p>
        </div>
      </section>
      <main className="page" id="contenido">
        <div className="admin-toolbar">
          <p className="muted small toolbar-note">Elige una cancha para editar sus precios y su horario semanal.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setAdding(true);
              setNotice(null);
            }}
          >
            Agregar cancha
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
          {error && (
            <div className="notice notice-error" role="alert">
              <AlertIcon />
              <div>{error}</div>
            </div>
          )}
        </div>

        {!courts && !error && (
          <div className="state-box" aria-busy="true">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}

        {courts && (
          <ul className="tiles" aria-label="Canchas">
            {courts.map((c) => (
              <li key={c.id} className={`tile${c.id === selected && !adding ? " is-on" : ""}${c.active ? "" : " is-off"}`}>
                <button
                  type="button"
                  className="tile-main"
                  aria-pressed={c.id === selected && !adding}
                  onClick={() => {
                    setSelected(c.id);
                    setAdding(false);
                  }}
                >
                  <CourtIcon sport={c.sport} half={c.sport === "futbol" && c.format === "5vs5"} size={150} />
                  <span className="tile-name">{c.name}</span>
                  <span className="muted small">
                    {SPORT_LABEL[c.sport]}
                    {c.format ? ` ${c.format}` : ""} · {money(c.prices["60"])} / {money(c.prices["90"])} / {money(c.prices["120"])}
                  </span>
                </button>
                <div className="tile-foot">
                  <span className={`tile-state ${c.active ? "ok" : "off"}`}>{c.active ? "Activa" : "En mantenimiento"}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={c.active}
                    aria-label={`${c.name}: activa`}
                    className="switch"
                    disabled={toggling === c.id}
                    onClick={() => toggle(c)}
                  >
                    <span className="switch-knob" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {adding && courts && (
          <AddCourt
            existing={courts}
            onClose={() => setAdding(false)}
            onCreated={(c) => {
              setCourts([...courts, c]);
              setSelected(c.id);
              setAdding(false);
              setNotice({ kind: "ok", message: `Cancha "${c.name}" creada. ${RN10}` });
            }}
          />
        )}

        {!adding && current && (
          <CourtEditor
            key={current.id}
            court={current}
            onSaved={(c) => {
              replace(c);
              setNotice({ kind: "ok", message: `Cambios guardados en ${c.name}. ${RN10}` });
            }}
          />
        )}
      </main>
    </>
  );
}

function CourtEditor({ court, onSaved }: { court: AdminCourt; onSaved: (c: AdminCourt) => void }) {
  const [prices, setPrices] = useState<PriceDraft>(pricesToDraft(court.prices));
  const [schedule, setSchedule] = useState<ScheduleDay[]>(court.schedule);
  const [priceErrors, setPriceErrors] = useState<ReturnType<typeof parsePrices>["errors"]>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // El estado activo se alimenta del interruptor de la tarjeta: se lee al guardar, no se edita aquí.
  const latest = useRef(court);
  latest.current = court;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = parsePrices(prices);
    setPriceErrors(parsed.errors);
    if (!parsed.prices || Object.keys(scheduleErrors(schedule)).length) {
      setError("Revisa los campos marcados antes de guardar.");
      return;
    }
    setBusy(true);
    try {
      onSaved(await api.admin.updateCourt(court.id, bodyOf(latest.current, { prices: parsed.prices, schedule })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar los cambios.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="board editor" onSubmit={save} noValidate aria-labelledby="editor-titulo">
      <div className="board-head">
        <div>
          <h2 className="board-title" id="editor-titulo">
            {court.name}
          </h2>
          <p className="muted small editor-sub">{RN10}</p>
        </div>
        <button type="submit" className="btn btn-accent" disabled={busy}>
          {busy ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          <AlertIcon />
          {error}
        </p>
      )}
      <div className="editor-grid">
        <PriceEditor value={prices} errors={priceErrors} onChange={setPrices} idPrefix={`precio-${court.id}`} />
        <div>
          <h3 className="field-label">Horario semanal</h3>
          <p className="muted small editor-sub">Los clientes solo ven turnos dentro de estas horas.</p>
          <ScheduleEditor value={schedule} onChange={setSchedule} idPrefix={`horario-${court.id}`} />
        </div>
      </div>
    </form>
  );
}

const KEBAB = /^[a-z0-9-]+$/;

function AddCourt({
  existing,
  onCreated,
  onClose,
}: {
  existing: AdminCourt[];
  onCreated: (c: AdminCourt) => void;
  onClose: () => void;
}) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [sport, setSport] = useState<Sport>("padel");
  const [format, setFormat] = useState<"" | "5vs5" | "7vs7">("");
  const [spaces, setSpaces] = useState("");
  const [prices, setPrices] = useState<PriceDraft>({ "60": "20", "90": "30", "120": "40" });
  const [schedule, setSchedule] = useState<ScheduleDay[]>(defaultSchedule());
  const [fields, setFields] = useState<Record<string, string>>({});
  const [priceErrors, setPriceErrors] = useState<ReturnType<typeof parsePrices>["errors"]>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const f: Record<string, string> = {};
    const spaceIds = [...new Set(spaces.split(",").map((s) => s.trim()).filter(Boolean))];
    if (!KEBAB.test(id)) f.id = "Usa minúsculas, números y guiones, por ejemplo padel-2.";
    else if (existing.some((c) => c.id === id)) f.id = "Ya existe una cancha con ese id.";
    if (!name.trim()) f.name = "Escribe el nombre de la cancha.";
    if (spaceIds.length === 0) f.spaceIds = "Indica al menos un espacio, separados por coma.";
    else if (spaceIds.some((s) => !KEBAB.test(s))) f.spaceIds = "Cada espacio usa minúsculas, números y guiones.";
    const parsed = parsePrices(prices);
    setPriceErrors(parsed.errors);
    setFields(f);
    if (Object.keys(f).length || !parsed.prices || Object.keys(scheduleErrors(schedule)).length) {
      setError("Revisa los campos marcados antes de crear la cancha.");
      return;
    }
    setBusy(true);
    try {
      onCreated(
        await api.admin.createCourt({
          id,
          name: name.trim(),
          sport,
          ...(sport === "futbol" && format ? { format } : {}),
          spaceIds,
          active: true,
          prices: parsed.prices,
          schedule,
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setFields({ id: "Ya existe una cancha con ese id." });
      else if (err instanceof ApiError && err.fields) setFields(err.fields);
      setError(err instanceof ApiError ? err.message : "No pudimos crear la cancha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="board editor" onSubmit={submit} noValidate aria-labelledby="agregar-titulo">
      <div className="board-head">
        <div>
          <h2 className="board-title" id="agregar-titulo" tabIndex={-1} ref={heading}>
            Agregar cancha
          </h2>
          <p className="muted small editor-sub">
            Si el espacio no existe se crea al guardar. Una cancha que comparte espacios con otra (como Fútbol Completa) bloquea ambas.
          </p>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          <AlertIcon />
          {error}
        </p>
      )}
      <div className="add-grid">
        <label className={`field${fields.id ? " has-error" : ""}`}>
          <span className="field-label">Id (kebab-case)</span>
          <input type="text" value={id} onChange={(e) => setId(e.target.value.trim())} autoComplete="off" placeholder="padel-2" />
          {fields.id && <span className="field-error">{fields.id}</span>}
        </label>
        <label className={`field${fields.name ? " has-error" : ""}`}>
          <span className="field-label">Nombre</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="Pádel 2" />
          {fields.name && <span className="field-error">{fields.name}</span>}
        </label>
        <label className="field">
          <span className="field-label">Deporte</span>
          <select value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
            {(Object.keys(SPORT_LABEL) as Sport[]).map((s) => (
              <option key={s} value={s}>
                {SPORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Formato</span>
          <select value={sport === "futbol" ? format : ""} disabled={sport !== "futbol"} onChange={(e) => setFormat(e.target.value as "" | "5vs5" | "7vs7")}>
            <option value="">Sin formato</option>
            <option value="5vs5">5 vs 5</option>
            <option value="7vs7">7 vs 7</option>
          </select>
        </label>
        <label className={`field add-wide${fields.spaceIds ? " has-error" : ""}`}>
          <span className="field-label">Espacios (ids separados por coma)</span>
          <input type="text" value={spaces} onChange={(e) => setSpaces(e.target.value)} autoComplete="off" placeholder="padel-2" />
          {fields.spaceIds && <span className="field-error">{fields.spaceIds}</span>}
        </label>
      </div>
      <div className="editor-grid">
        <PriceEditor value={prices} errors={priceErrors} onChange={setPrices} idPrefix="precio-nueva" />
        <div>
          <h3 className="field-label">Horario semanal</h3>
          <ScheduleEditor value={schedule} onChange={setSchedule} idPrefix="horario-nueva" />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Creando…" : "Crear cancha"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
