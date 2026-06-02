// ============================================================
// pages/Dashboard.jsx
// Panel de control con resumen semanal, mensual y anual
// ============================================================

import React, { useEffect, useState } from 'react';
import { getSesiones, getPagos } from '../services/googleApi';
import { getWeek, getMonth, getYear, parseISO, isValid } from 'date-fns';

function Dashboard() {
  const [sesiones, setSesiones] = useState([]);
  const [pagos, setPagos]       = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState('');

  const hoy      = new Date();
  const semanaHoy = getWeek(hoy, { weekStartsOn: 1 });
  const mesHoy   = getMonth(hoy) + 1;
  const añoHoy   = getYear(hoy);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    setError('');
    try {
      const [s, p] = await Promise.all([getSesiones(), getPagos()]);
      setSesiones(s);
      setPagos(p);
    } catch (err) {
      setError('Error al cargar datos. Comprueba tu conexión.');
    } finally {
      setCargando(false);
    }
  };

  // ── Calcular totales ───────────────────────────────────────
  const filtrarSemana = (s) => parseInt(s.semana) === semanaHoy && parseInt(s.año) === añoHoy;
  const filtrarMes    = (s) => parseInt(s.mes) === mesHoy && parseInt(s.año) === añoHoy;
  const filtrarAño    = (s) => parseInt(s.año) === añoHoy;
  const filtrarPagosAño = (p) => parseInt(p.año) === añoHoy;

  const suma = (lista, campo) => lista.reduce((acc, s) => acc + (parseFloat(s[campo]) || 0), 0);

  const horasSemana   = suma(sesiones.filter(filtrarSemana), 'horasTotal');
  const precioSemana  = suma(sesiones.filter(filtrarSemana), 'precioTotal');
  const horasMes      = suma(sesiones.filter(filtrarMes), 'horasTotal');
  const precioMes     = suma(sesiones.filter(filtrarMes), 'precioTotal');
  const horasAño      = suma(sesiones.filter(filtrarAño), 'horasTotal');
  const totalAño      = suma(sesiones.filter(filtrarAño), 'precioTotal');
  const cobradoAño    = suma(pagos.filter(filtrarPagosAño), 'importe');
  const pendienteAño  = totalAño - cobradoAño;

  // Últimas 5 sesiones
  const ultimasSesiones = [...sesiones]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 5);

  const formatEur = (n) => `${n.toFixed(2).replace('.', ',')} €`;
  const formatH   = (n) => `${n.toFixed(2).replace('.', ',')} h`;

  if (cargando) return (
    <div className="loading"><div className="spinner"></div> Cargando datos...</div>
  );

  return (
    <div>
      <div className="page-header">
        <h1>📊 Panel de control</h1>
        <button className="btn btn-outline" onClick={cargarDatos}>🔄 Actualizar</button>
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}

      {/* ── Semana actual ─────────────────────────────────── */}
      <div className="card">
        <div className="card-title">📅 Semana actual (semana {semanaHoy})</div>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">⏱️</div>
            <div className="stat-valor">{formatH(horasSemana)}</div>
            <div className="stat-label">Horas semana</div>
          </div>
          <div className="stat-card verde">
            <div className="stat-icon">💵</div>
            <div className="stat-valor">{formatEur(precioSemana)}</div>
            <div className="stat-label">Ingresos semana</div>
          </div>
        </div>
      </div>

      {/* ── Mes actual ────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">🗓️ Mes actual</div>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">⏱️</div>
            <div className="stat-valor">{formatH(horasMes)}</div>
            <div className="stat-label">Horas mes</div>
          </div>
          <div className="stat-card verde">
            <div className="stat-icon">💵</div>
            <div className="stat-valor">{formatEur(precioMes)}</div>
            <div className="stat-label">Ingresos mes</div>
          </div>
        </div>
      </div>

      {/* ── Año actual ────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">📆 Año {añoHoy} — Contabilidad</div>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">⏱️</div>
            <div className="stat-valor">{formatH(horasAño)}</div>
            <div className="stat-label">Total horas año</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📈</div>
            <div className="stat-valor">{formatEur(totalAño)}</div>
            <div className="stat-label">Total generado</div>
          </div>
          <div className="stat-card verde">
            <div className="stat-icon">✅</div>
            <div className="stat-valor">{formatEur(cobradoAño)}</div>
            <div className="stat-label">Total cobrado</div>
          </div>
          <div className="stat-card rojo">
            <div className="stat-icon">⏳</div>
            <div className="stat-valor">{formatEur(pendienteAño)}</div>
            <div className="stat-label">Total pendiente</div>
          </div>
        </div>
      </div>

      {/* ── Últimas sesiones ──────────────────────────────── */}
      <div className="card">
        <div className="card-title">🕐 Últimas sesiones</div>
        {ultimasSesiones.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: '24px' }}>
            No hay sesiones registradas aún
          </p>
        ) : (
          <div className="tabla-container">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Horas</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                {ultimasSesiones.map((s, i) => (
                  <tr key={i}>
                    <td>{s.fecha}</td>
                    <td><span className="badge" style={{ background: '#1a73e8' }}>{s.tipoCurso}</span></td>
                    <td>{formatH(s.horasTotal)}</td>
                    <td><strong>{formatEur(s.precioTotal)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
