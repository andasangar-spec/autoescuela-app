// ============================================================
// pages/Panel.jsx — LogiConta
// Panel de control con estadísticas completas (semana/mes/año)
// Accesible desde el botón "Panel de Control" de la home
// ============================================================
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSesiones, getPagos } from "../services/googleApi";
import { getWeek, getYear, getMonth, format, isValid } from "date-fns";

const parsearFecha = (fechaStr) => {
  if (!fechaStr) return null;
  const p = fechaStr.split("/");
  if (p.length !== 3) return null;
  const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  return isValid(d) ? d : null;
};

function Panel() {
  const navigate                  = useNavigate();
  const [sesiones, setSesiones]   = useState([]);
  const [pagos, setPagos]         = useState([]);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState("");

  const hoy       = new Date();
  const semanaHoy = getWeek(hoy, { weekStartsOn: 1 });
  const mesHoy    = getMonth(hoy) + 1;
  const añoHoy    = getYear(hoy);

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setCargando(true); setError("");
    try {
      const [s, p] = await Promise.all([getSesiones(), getPagos()]);
      setSesiones(s); setPagos(p);
    } catch { setError("Error al cargar datos."); }
    finally { setCargando(false); }
  };

  const sumar = (lista, campo) =>
    lista.reduce((acc, x) => acc + (parseFloat(x[campo]) || 0), 0);

  const porSemana = sesiones.filter(s => {
    const f = parsearFecha(s.fecha);
    return f && getWeek(f, { weekStartsOn: 1 }) === semanaHoy && getYear(f) === añoHoy;
  });

  const porMes    = sesiones.filter(s => parseInt(s.mes) === mesHoy  && parseInt(s.año) === añoHoy);
  const porAño    = sesiones.filter(s => parseInt(s.año) === añoHoy);
  const pagosAño  = pagos.filter(p   => parseInt(p.año)  === añoHoy);

  const totalGenerado  = sumar(porAño,   "precioTotal");
  const totalCobrado   = sumar(pagosAño, "importe");
  const totalPendiente = totalGenerado - totalCobrado;
  const pct            = totalGenerado > 0 ? Math.min(100, Math.round((totalCobrado / totalGenerado) * 100)) : 0;

  const formatEur = n => `${n.toFixed(2).replace(".", ",")} €`;
  const formatH   = n => `${n.toFixed(2).replace(".", ",")} h`;

  // Últimas 5 sesiones
  const ultimas = [...sesiones]
    .sort((a, b) => { const fa = parsearFecha(a.fecha), fb = parsearFecha(b.fecha); return (!fa||!fb) ? 0 : fb - fa; })
    .slice(0, 5);

  if (cargando) return (
    <>
      <div className="inner-bar">
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <span className="inner-bar-title">Panel de control</span>
      </div>
      <div className="loading"><div className="spinner"></div> Cargando...</div>
    </>
  );

  return (
    <>
      {/* Barra superior */}
      <div className="inner-bar">
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <span className="inner-bar-title">Panel de control</span>
        <button className="inner-bar-action" onClick={cargarDatos}>🔄</button>
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}

      {/* ── SEMANA ACTUAL ─────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📅 Semana actual (sem. {semanaHoy})</span>
          <span className="card-badge">{format(hoy, "dd/MM/yyyy")}</span>
        </div>
        <div className="card-body">
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon" style={{ background:"var(--b500)" }}>
                <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" fill="white"/></svg>
              </div>
              <div className="kpi-label">Horas semana</div>
              <div className="kpi-value">{formatH(sumar(porSemana, "horasTotal"))}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon" style={{ background:"var(--verde)" }}>
                <svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" fill="white"/></svg>
              </div>
              <div className="kpi-label">Ingresos semana</div>
              <div className="kpi-value verde">{formatEur(sumar(porSemana, "precioTotal"))}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MES ACTUAL ────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🗓️ Mes actual</span>
          <span className="card-badge">{["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][mesHoy-1]} {añoHoy}</span>
        </div>
        <div className="card-body">
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon" style={{ background:"var(--b500)" }}>
                <svg viewBox="0 0 24 24"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" fill="white"/></svg>
              </div>
              <div className="kpi-label">Sesiones mes</div>
              <div className="kpi-value">{porMes.length}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon" style={{ background:"var(--b800)" }}>
                <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" fill="white"/></svg>
              </div>
              <div className="kpi-label">Horas mes</div>
              <div className="kpi-value">{formatH(sumar(porMes, "horasTotal"))}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon" style={{ background:"var(--verde)" }}>
                <svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" fill="white"/></svg>
              </div>
              <div className="kpi-label">Ingresos mes</div>
              <div className="kpi-value verde">{formatEur(sumar(porMes, "precioTotal"))}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon" style={{ background:"var(--g600)" }}>
                <svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" fill="white"/></svg>
              </div>
              <div className="kpi-label">Media por sesión</div>
              <div className="kpi-value">
                {porMes.length > 0
                  ? formatEur(sumar(porMes, "precioTotal") / porMes.length)
                  : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── AÑO ───────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📆 Año {añoHoy} — Contabilidad</span>
        </div>
        <div className="card-body">
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon" style={{ background:"var(--b500)" }}>
                <svg viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" fill="white"/></svg>
              </div>
              <div className="kpi-label">Total generado</div>
              <div className="kpi-value">{formatEur(totalGenerado)}</div>
              <div className="kpi-sub">{porAño.length} sesiones · {formatH(sumar(porAño, "horasTotal"))}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon" style={{ background:"var(--verde)" }}>
                <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="white"/></svg>
              </div>
              <div className="kpi-label">Total cobrado</div>
              <div className="kpi-value verde">{formatEur(totalCobrado)}</div>
              <div className="kpi-sub">{pct}% cobrado</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon" style={{ background:"var(--rojo)" }}>
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="white"/></svg>
              </div>
              <div className="kpi-label">Total pendiente</div>
              <div className="kpi-value rojo">{formatEur(totalPendiente)}</div>
              <div className="kpi-sub">{100 - pct}% pendiente</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon" style={{ background:"var(--g600)" }}>
                <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" fill="white"/></svg>
              </div>
              <div className="kpi-label">Total horas año</div>
              <div className="kpi-value">{formatH(sumar(porAño, "horasTotal"))}</div>
            </div>
          </div>

          {/* Barra de progreso cobro */}
          <div className="progress-wrap" style={{ marginTop:"16px" }}>
            <div className="progress-top">
              <span>Cobrado: {formatEur(totalCobrado)}</span>
              <span style={{ fontWeight:"700" }}>{pct}%</span>
            </div>
            <div className="progress-bg">
              <div className="progress-fill" style={{ width:`${pct}%` }}></div>
            </div>
            <div className="progress-bot">Pendiente: {formatEur(totalPendiente)}</div>
          </div>
        </div>
      </div>

      {/* ── ÚLTIMAS SESIONES ──────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🕐 Últimas sesiones</span>
          <span className="card-badge">{ultimas.length} recientes</span>
        </div>
        {ultimas.length === 0 ? (
          <p style={{ textAlign:"center", color:"var(--g400)", padding:"24px" }}>No hay sesiones registradas</p>
        ) : (
          <div className="tabla-container">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Horario</th>
                  <th>Horas</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                {ultimas.map((s, i) => (
                  <tr key={i}>
                    <td><strong>{s.fecha}</strong></td>
                    <td><span className="badge">{s.tipoCurso}</span></td>
                    <td style={{ fontSize:"12px" }}>{s.horaInicio1}–{s.horaFin1}{s.pausa === "SI" && <span style={{ color:"var(--amarillo)" }}> ☕</span>}</td>
                    <td><strong>{formatH(parseFloat(s.horasTotal))}</strong></td>
                    <td><strong style={{ color:"var(--verde)" }}>{formatEur(parseFloat(s.precioTotal))}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default Panel;
