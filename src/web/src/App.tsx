import { Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { Availability } from "./pages/Availability";
import { Login } from "./pages/Login";
import { MyBookings } from "./pages/MyBookings";
import { Register } from "./pages/Register";

export function App() {
  return (
    <div className="app">
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <Header />
      <Routes>
        <Route path="/" element={<Availability />} />
        <Route path="/ingresar" element={<Login />} />
        <Route path="/registro" element={<Register />} />
        <Route path="/mis-reservas" element={<MyBookings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
