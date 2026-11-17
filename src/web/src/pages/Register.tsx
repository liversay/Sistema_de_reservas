import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { safeNext, useAuth } from "../auth";
import { AlertIcon } from "../components/Icons";
import { AuthShell } from "./Login";

type Field = "name" | "email" | "phone" | "password";

const FIELDS: { id: Field; label: string; type: string; auto: string; hint?: string }[] = [
  { id: "name", label: "Nombre", type: "text", auto: "name" },
  { id: "email", label: "Email", type: "email", auto: "email" },
  { id: "phone", label: "Teléfono", type: "tel", auto: "tel", hint: "Para avisarte si hay cambios. Ej.: +593 99 123 4567" },
  { id: "password", label: "Contraseña", type: "password", auto: "new-password", hint: "Mínimo 8 caracteres." },
];

// La API marca qué campo falla (`fields`); el texto se muestra en español y con la regla concreta.
const FIELD_MESSAGE: Record<Field, string> = {
  name: "Escribe tu nombre (de 2 a 60 caracteres).",
  email: "Escribe un email válido, por ejemplo nombre@correo.com.",
  phone: "Teléfono inválido: de 7 a 15 dígitos, puede empezar con +.",
  password: "La contraseña debe tener al menos 8 caracteres.",
};

export function Register() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [values, setValues] = useState<Record<Field, string>>({ name: "", email: "", phone: "", password: "" });
  const [fields, setFields] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      setUser(
        await api.register({
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
          password: values.password,
        }),
      );
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        const bad = Object.keys(err.fields).filter((k): k is Field => k in FIELD_MESSAGE);
        setFields(Object.fromEntries(bad.map((k) => [k, FIELD_MESSAGE[k]])));
      }
      setError(
        err instanceof ApiError && err.status === 409
          ? "Ya existe una cuenta con ese email. Ingresa con ella."
          : err instanceof ApiError && err.status === 400
            ? "Revisa los campos marcados."
            : err instanceof ApiError
              ? err.message
              : "No pudimos crear la cuenta.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Crea tu cuenta" subtitle="Solo una vez: después reservas en dos toques.">
      <form className="form" onSubmit={submit} noValidate>
        {error && (
          <p className="form-error" role="alert">
            <AlertIcon />
            {error}
          </p>
        )}
        {FIELDS.map((f) => {
          const msg = fields[f.id];
          return (
            <label key={f.id} className={`field${msg ? " has-error" : ""}`}>
              <span className="field-label">{f.label}</span>
              <input
                type={f.type}
                name={f.id}
                autoComplete={f.auto}
                required
                aria-invalid={!!msg}
                aria-describedby={msg || f.hint ? `${f.id}-help` : undefined}
                value={values[f.id]}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
              />
              {(msg || f.hint) && (
                <span id={`${f.id}-help`} className={msg ? "field-error" : "field-hint"}>
                  {msg ?? f.hint}
                </span>
              )}
            </label>
          );
        })}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Creando cuenta…" : "Crear cuenta"}
        </button>
        <p className="form-alt">
          ¿Ya tienes cuenta? <Link to={`/ingresar?next=${encodeURIComponent(next)}`}>Ingresar</Link>
        </p>
      </form>
    </AuthShell>
  );
}
