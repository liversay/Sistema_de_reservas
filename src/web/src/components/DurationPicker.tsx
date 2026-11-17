import { DURATIONS, type Duration } from "../shared";
import { durationLabel } from "../dates";

export function DurationPicker({ value, onChange }: { value: Duration; onChange: (d: Duration) => void }) {
  return (
    <fieldset className="segmented">
      <legend className="field-label">Duración</legend>
      <div className="segmented-track">
        {DURATIONS.map((d) => (
          <label key={d} className={`seg${d === value ? " is-on" : ""}`}>
            <input type="radio" name="duracion" value={d} checked={d === value} onChange={() => onChange(d)} />
            <span>{durationLabel(d)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
