import React, { useState } from "react";
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NuevaSesion from "./pages/NuevaSesion";
import Sesiones from "./pages/Sesiones";
import Contabilidad from "./pages/Contabilidad";
import Configuracion from "./pages/Configuracion";
import Layout from "./components/Layout";
import "./App.css";

const GOOGLE_CLIENT_ID = "825744058140-2jc1m34ogvt40109pf2kt839pgnsj7u0.apps.googleusercontent.com";

function App() {
  const [usuario, setUsuario] = useState(() => {
    const guardado = localStorage.getItem("usuario");
    return guardado ? JSON.parse(guardado) : null;
  });

  const handleLogin = (datosUsuario) => {
    localStorage.setItem("usuario", JSON.stringify(datosUsuario));
    setUsuario(datosUsuario);
  };

  const handleLogout = () => {
    localStorage.removeItem("usuario");
    localStorage.removeItem("google_token");
    setUsuario(null);
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Router>
        <Routes>
          <Route path="/login" element={usuario ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />} />
          <Route path="/" element={usuario ? <Layout usuario={usuario} onLogout={handleLogout} /> : <Navigate to="/login" replace />}>
            <Route index element={<Dashboard />} />
            <Route path="nueva-sesion" element={<NuevaSesion />} />
            <Route path="sesiones" element={<Sesiones />} />
            <Route path="contabilidad" element={<Contabilidad />} />
            <Route path="configuracion" element={<Configuracion />} />
          </Route>
        </Routes>
      </Router>
    </GoogleOAuthProvider>
  );
}

export default App;