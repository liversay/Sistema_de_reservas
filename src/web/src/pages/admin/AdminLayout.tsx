import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { LogoMark } from "../../components/Icons";

/** Marco del backoffice: solo rol admin. Sin sesión → ingresar; con otro rol → aviso 403. */
export function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) {
    return (
      <main className="page" id="contenido" aria-busy="true">
        <div className="skeleton" />
      </main>
    );
  }
  if (!user) {
    return <Navigate to={`/ingresar?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (user.role !== "admin") {
    return (
      <main className="page page-auth" id="contenido">
        <div className="card auth-card state-box">
          <h1 className="empty-title">Acceso restringido (403)</h1>
          <p className="muted">Esta sección es solo para administradores del complejo.</p>
          <Link to="/" className="btn btn-primary">
            Volver a la disponibilidad
          </Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="topbar admin-bar">
        <div className="topbar-inner">
          <Link to="/admin" className="brand">
            <LogoMark />
            <span>
              Complejo Norte<span className="brand-admin"> · Admin</span>
            </span>
          </Link>
          <nav className="topnav" aria-label="Backoffice">
            <NavLink to="/admin" end className="navlink">
              Reservas
            </NavLink>
            <NavLink to="/admin/canchas" className="navlink">
              Canchas y horarios
            </NavLink>
            <NavLink to="/admin/pagos" className="navlink">
              Pagos
            </NavLink>
            <Link to="/" className="navlink">
              Ver sitio
            </Link>
            <button
              type="button"
              className="navlink navbtn"
              onClick={async () => {
                await logout();
                navigate("/");
              }}
              title={`Sesión de ${user.name}`}
            >
              Salir
            </button>
          </nav>
        </div>
      </header>
      <Outlet />
    </>
  );
}
