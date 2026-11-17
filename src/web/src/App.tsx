import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Header } from "./components/Header";
import { Availability } from "./pages/Availability";
import { Login } from "./pages/Login";
import { MyBookings } from "./pages/MyBookings";
import { Register } from "./pages/Register";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { Courts } from "./pages/admin/Courts";
import { Board } from "./pages/admin/Board";

export function App() {
  // El backoffice trae su propia barra superior.
  const inAdmin = useLocation().pathname.startsWith("/admin");
  return (
    <div className="app">
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      {!inAdmin && <Header />}
      <Routes>
        <Route path="/" element={<Availability />} />
        <Route path="/ingresar" element={<Login />} />
        <Route path="/registro" element={<Register />} />
        <Route path="/mis-reservas" element={<MyBookings />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Board />} />
          <Route path="canchas" element={<Courts />} />
          {/* CR-02: Pagos es una pestaña del tablero; la ruta anterior redirige. */}
          <Route path="pagos" element={<Navigate to="/admin?vista=pagos" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
