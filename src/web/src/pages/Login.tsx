import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { safeNext, useAuth } from "../auth";
import { AlertIcon } from "../components/Icons";

export function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setUser(await api.login(email.trim(), password));
      navigate(next, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Email o contraseña incorrectos."
          : err instanceof ApiError
            ? err.message
            : "No pudimos iniciar sesión.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Ingresa para reservar" subtitle="Usa tu cuenta del complejo. Te devolvemos a tu selección.">
      <form className="form" onSubmit={submit} noValidate>
        {error && (
          <p className="form-error" role="alert">
            <AlertIcon />
            {error}
          </p>
        )}
        <label className="field">
          <span className="field-label">Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Ingresando…" : "Ingresar"}
        </button>
        <p className="form-alt">
          ¿No tienes cuenta? <Link to={`/registro?next=${encodeURIComponent(next)}`}>Crear cuenta</Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <>
      <section className="hero hero-auth">
        <div className="hero-inner">
          <h1 className="hero-title">{title}</h1>
          <p className="hero-sub">{subtitle}</p>
        </div>
      </section>
      <main className="page page-auth" id="contenido">
        <div className="card auth-card">{children}</div>
      </main>
    </>
  );
}
