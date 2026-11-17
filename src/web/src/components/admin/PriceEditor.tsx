import type { Prices } from "../../api";
import { durationLabel } from "../../dates";

export type PriceDraft = Record<"60" | "90" | "120", string>;

export function pricesToDraft(p: Prices): PriceDraft {
  return { "60": String(p["60"]), "90": String(p["90"]), "120": String(p["120"]) };
}

/** Devuelve precios numéricos o el error por duración. */
export function parsePrices(d: PriceDraft): { prices?: Prices; errors: Partial<Record<keyof PriceDraft, string>> } {
  const errors: Partial<Record<keyof PriceDraft, string>> = {};
  const out = {} as Prices;
  for (const k of ["60", "90", "120"] as const) {
    const n = Number(d[k].replace(",", "."));
    if (!/^\d+([.,]\d{1,2})?$/.test(d[k].trim()) || !Number.isFinite(n) || n <= 0) errors[k] = "Número mayor que 0";
    else out[k] = n;
  }
  return Object.keys(errors).length ? { errors } : { prices: out, errors };
}

/** Precios por duración (60 / 90 / 120 min). */
export function PriceEditor({
  value,
  errors,
  onChange,
  idPrefix,
}: {
  value: PriceDraft;
  errors?: Partial<Record<keyof PriceDraft, string>>;
  onChange: (v: PriceDraft) => void;
  idPrefix: string;
}) {
  return (
    <fieldset className="price-editor">
      <legend className="field-label">Precio por turno ($)</legend>
      <div className="price-grid">
        {(["60", "90", "120"] as const).map((k) => (
          <label key={k} className={`field${errors?.[k] ? " has-error" : ""}`}>
            <span className="field-label">{durationLabel(Number(k))}</span>
            <input
              id={`${idPrefix}-${k}`}
              type="text"
              inputMode="decimal"
              value={value[k]}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
              aria-invalid={errors?.[k] ? true : undefined}
            />
            {errors?.[k] && <span className="field-error">{errors[k]}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
