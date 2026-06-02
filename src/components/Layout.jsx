// ============================================================
// components/Layout.jsx
// Estructura principal con sidebar y contenido
// ============================================================

import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

function Layout({ usuario, onLogout }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const navigate = useNavigate();

  const cerrarSesion = () => {
    onLogout();
    navigate('/login');
  };

  const navItems = [
    { ruta: '/',              icono: '📊', label: 'Panel de control' },
    { ruta: '/nueva-sesion',  icono: '➕', label: 'Nueva sesión' },
    { ruta: '/sesiones',      icono: '📋', label: 'Mis sesiones' },
    { ruta: '/contabilidad',  icono: '💰', label: 'Contabilidad' },
    { ruta: '/configuracion', icono: '⚙️', label: 'Configuración' },
  ];

  return (
    <div className="layout">
      {/* Botón hamburguesa para móvil */}
      <button
        className="menu-toggle"
        onClick={() => setMenuAbierto(!menuAbierto)}
      >
        {menuAbierto ? '✕' : '☰'}
      </button>

      {/* Overlay para móvil */}
      <div
        className={`overlay ${menuAbierto ? 'show' : ''}`}
        onClick={() => setMenuAbierto(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${menuAbierto ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>🚗 AutoescuelaApp</h2>
          <span>{usuario?.nombre || 'Profesor'}</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.ruta}
              to={item.ruta}
              end={item.ruta === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setMenuAbierto(false)}
            >
              <span className="icon">{item.icono}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {usuario?.foto && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <img
                src={usuario.foto}
                alt={usuario.nombre}
                style={{ width: '32px', height: '32px', borderRadius: '50%' }}
              />
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600' }}>{usuario.nombre}</div>
                <div style={{ fontSize: '11px', opacity: 0.7 }}>{usuario.email}</div>
              </div>
            </div>
          )}
          <button className="btn-logout" onClick={cerrarSesion}>
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
