import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { CalendarIcon, GridIcon, LogoMark, UserIcon } from "./Icons";

export function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const next = encodeURIComponent(location.pathname + location.search);
  const onAuthPage = location.pathname === "/ingresar" || location.pathname === "/registro";

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand">
          <LogoMark />
          <span>Complejo Norte</span>
        </Link>
        <nav className="topnav" aria-label="Principal">
          <NavLink to="/" end className="navlink">
            <GridIcon />
            <span>Disponibilidad</span>
          </NavLink>
          <NavLink to="/mis-reservas" className="navlink">
            <CalendarIcon />
            <span>Mis reservas</span>
          </NavLink>
          {user?.role === "admin" && (
            <NavLink to="/admin" className="navlink">
              <GridIcon />
              <span>Administración</span>
            </NavLink>
          )}
          {user ? (
            <button
              type="button"
              className="navlink navbtn"
              onClick={async () => {
                await logout();
                navigate("/");
              }}
              title={`Sesión de ${user.name}`}
            >
              <UserIcon />
              <span>Salir</span>
            </button>
          ) : (
            !onAuthPage && (
              <Link to={`/ingresar?next=${next}`} className="navlink navbtn">
                <UserIcon />
                <span>Ingresar</span>
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
