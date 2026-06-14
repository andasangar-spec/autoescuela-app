// ============================================================
// components/Layout.jsx — LogiConta
// Sin sidebar. Home con cuadrícula + bottom nav (Inicio / Cerrar sesión)
// ============================================================

import React from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";

function Layout({ usuario, onLogout }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const isHome    = location.pathname === "/";

  const cerrarSesion = () => {
    onLogout();
    navigate("/login");
  };

  // Inicial del nombre para el avatar de texto
  const inicial = usuario?.nombre?.[0]?.toUpperCase() || "?";

  return (
    <div className="layout">
      {/* ── TOP BAR ─────────────────────────────────────── */}
      {isHome ? (
        /* Home: muestra marca + avatar */
        <header className="top-bar">
          <div className="top-bar-brand">
            <div className="top-bar-icon">
              <svg viewBox="0 0 24 24">
                <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
              </svg>
            </div>
            <div>
              <div className="top-bar-name">LogiConta</div>
              <div className="top-bar-sub">Autoescuela · Instructor</div>
            </div>
          </div>
          {usuario?.foto ? (
            <img
              src={usuario.foto}
              alt={usuario.nombre}
              className="top-bar-avatar"
            />
          ) : (
            <div className="top-bar-avatar">{inicial}</div>
          )}
        </header>
      ) : (
        /* Páginas internas: barra con botón volver — cada página renderiza la suya */
        null
      )}

      {/* ── CONTENIDO ───────────────────────────────────── */}
      <main className="main-content">
        <Outlet context={{ usuario, onLogout }} />
      </main>

      {/* ── BOTTOM NAV ──────────────────────────────────── */}
      <nav className="bottom-nav">
        {/* Inicio */}
        <Link
          to="/"
          className={`nav-item ${isHome ? "active" : ""}`}
        >
          <svg viewBox="0 0 24 24">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
          </svg>
          <span>Inicio</span>
        </Link>

        {/* Cerrar sesión */}
        <button className="nav-item logout" onClick={cerrarSesion}>
          <svg viewBox="0 0 24 24">
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
          </svg>
          <span>Cerrar sesión</span>
        </button>
      </nav>
    </div>
  );
}

export default Layout;
