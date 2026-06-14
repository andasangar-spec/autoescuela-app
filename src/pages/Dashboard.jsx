// ============================================================
// pages/Dashboard.jsx — LogiConta
// Pantalla principal: cuadrícula de accesos + resumen rápido
// El botón "Sincronizar Calendar" ejecuta la sync directamente
// ============================================================

import React, { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import {
  getSesiones, getPagos, getTiposCurso,
  getCalendarControlContable, getEventosCalendar,
  guardarSesion, actualizarSesion, eliminarFila,
  generarId
} from "../services/googleApi";
import {
  getWeek, getMonth, getYear, format, isAfter, startOfDay
} from "date-fns";

function Dashboard() {
  const { usuario }                                 = useOutletContext() || {};
  const navigate                                    = useNavigate();
  const [sesiones, setSesiones]                     = useState([]);
  const [pagos, setPagos]                           = useState([]);
  const [cargando, setCargando]                     = useState(true);
  const [error, setError]                           = useState("");
  const [exito, setExito]                           = useState("");
  const [sincronizando, setSincronizando]           = useState(false);
  const [sesionesEliminadas, setSesionesEliminadas] = useState([]);
  const [eliminando, setEliminando]                 = useState(null);

  const hoy       = new Date();
  const semanaHoy = getWeek(hoy, { weekStartsOn: 1 });
  const mesHoy    = getMonth(hoy) + 1;
  const añoHoy    = getYear(hoy);

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setCargando(true); setError("");
    try {
      const [s, p] = await Promise.all([getSesiones(), getPagos()]);
      setSesiones(s);
      setPagos(p);
    } catch {
      setError("Error al cargar datos.");
    } finally {
      setCargando(false);
    }
  };

  // ── Confirmar eliminación desde aviso ──────────────────
  const confirmarEliminarSesion = async (sesion) => {
    setEliminando(sesion.id);
    try {
      await eliminarFila("SESIONES", sesion._fila - 1);
      setSesionesEliminadas(prev => prev.filter(s => s.id !== sesion.id));
      setExito("✅ Sesión eliminada correctamente.");
      await cargarDatos();
    } catch (e) {
      setError("Error al eliminar sesión: " + e.message);
    } finally {
      setEliminando(null);
    }
  };

  const ignorarAviso = (sesionId) => {
    setSesionesEliminadas(prev => prev.filter(s => s.id !== sesionId));
  };

  // ── Sincronizar Calendar → App ─────────────────────────
  const sincronizarCalendar = async () => {
    setSincronizando(true);
    setError(""); setExito("");
    setSesionesEliminadas([]);
    try {
      const tipos      = await getTiposCurso();
      const calendarId = await getCalendarControlContable();
      if (!calendarId) {
        setError("No se encontró el calendario 'Control_Contable'.");
        return;
      }

      const eventos          = await getEventosCalendar(calendarId);
      const sesionesActuales = await getSesiones();
      const hoyInicio        = startOfDay(new Date());

      const mapaEventoSesion = {};
      sesionesActuales.forEach(s => {
        if (s.calendarEventId) {
          s.calendarEventId.split(",").forEach(id => {
            mapaEventoSesion[id.trim()] = s;
          });
        }
      });

      const idsEnCalendar         = new Set(eventos.map(e => e.id));
      let importados              = 0;
      let actualizados            = 0;
      let ignorados               = 0;
      const eliminadasDetectadas  = [];

      sesionesActuales.forEach(s => {
        if (!s.calendarEventId) return;
        const ids             = s.calendarEventId.split(",").map(id => id.trim()).filter(Boolean);
        if (ids.length === 0) return;
        const todosEliminados = ids.every(id => !idsEnCalendar.has(id));
        if (todosEliminados) eliminadasDetectadas.push(s);
      });

      for (const evento of eventos) {
        const titulo      = evento.summary?.trim() || "";
        const fechaEvento = evento.start?.dateTime || evento.start?.date;
        if (!fechaEvento) continue;

        const fechaObj = new Date(fechaEvento);
        if (isAfter(startOfDay(fechaObj), hoyInicio)) { ignorados++; continue; }

        const tipoMatch = tipos.find(t => t.nombre === titulo);
        if (!tipoMatch) continue;

        const horaInicio   = evento.start?.dateTime ? format(new Date(evento.start.dateTime), "HH:mm") : "09:00";
        const horaFin      = evento.end?.dateTime   ? format(new Date(evento.end.dateTime), "HH:mm")   : "10:00";
        const duracionMin  = tipoMatch.duracionMin || 60;
        const minutosNetos = Math.max(0,
          (new Date(evento.end?.dateTime || evento.end?.date) -
           new Date(evento.start?.dateTime || evento.start?.date)) / 60000
        );
        const numClases   = duracionMin > 0 ? Math.floor(minutosNetos / duracionMin) : 0;
        const horasTotal  = minutosNetos / 60;
        const precioTotal = tipoMatch.tipoPrecio === "total"
          ? tipoMatch.precio
          : numClases * tipoMatch.precio;

        const fechaFmt  = format(fechaObj, "dd/MM/yyyy");
        const diaSemana = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"][fechaObj.getDay()];
        const semana    = getWeek(fechaObj, { weekStartsOn: 1 });
        const mes       = getMonth(fechaObj) + 1;
        const año       = getYear(fechaObj);

        const sesionExistente = mapaEventoSesion[evento.id];

        if (sesionExistente) {
          const cambios =
            sesionExistente.horaInicio1 !== horaInicio ||
            sesionExistente.horaFin1    !== horaFin    ||
            sesionExistente.fecha       !== fechaFmt   ||
            sesionExistente.tipoCurso   !== titulo;

          if (cambios) {
            await actualizarSesion({
              ...sesionExistente,
              fecha: fechaFmt, diaSemana, semana, mes, año,
              tipoCurso:   titulo,
              horaInicio1: horaInicio,
              horaFin1:    horaFin,
              horasTramo1: horasTotal.toFixed(2),
              horasTramo2: "0",
              horasTotal:  horasTotal.toFixed(2),
              tipoPrecio:  tipoMatch.tipoPrecio === "total" ? "total" : "clase",
              precioHora:  tipoMatch.precio,
              precioTotal: precioTotal.toFixed(2),
              notas:       sesionExistente.notas || "Importado desde Google Calendar",
            });
            actualizados++;
          }
        } else {
          await guardarSesion({
            id:              generarId("CAL"),
            fecha:           fechaFmt,
            diaSemana, semana, mes, año,
            tipoCurso:       titulo,
            horaInicio1:     horaInicio,
            horaFin1:        horaFin,
            pausa:           "NO",
            horaInicio2:     "",
            horaFin2:        "",
            horasTramo1:     horasTotal.toFixed(2),
            horasTramo2:     "0",
            horasTotal:      horasTotal.toFixed(2),
            tipoPrecio:      tipoMatch.tipoPrecio === "total" ? "total" : "clase",
            precioHora:      tipoMatch.precio,
            precioTotal:     precioTotal.toFixed(2),
            calendarEventId: evento.id,
            notas:           "Importado desde Google Calendar",
          });
          importados++;
        }
      }

      await cargarDatos();
      if (eliminadasDetectadas.length > 0) setSesionesEliminadas(eliminadasDetectadas);

      const partes = [];
      if (importados              > 0) partes.push(`${importados} sesión(es) importada(s)`);
      if (actualizados            > 0) partes.push(`${actualizados} sesión(es) actualizada(s)`);
      if (ignorados               > 0) partes.push(`${ignorados} evento(s) futuro(s) pendiente(s)`);
      if (eliminadasDetectadas.length > 0) partes.push(`${eliminadasDetectadas.length} sesión(es) eliminada(s) en Calendar`);

      setExito(`✅ Sincronización completada. ${partes.length > 0 ? partes.join(", ") + "." : "No hay cambios nuevos."}`);
    } catch (e) {
      setError("Error al sincronizar: " + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  // ── Cálculos ───────────────────────────────────────────
  const suma = (lista, campo) => lista.reduce((acc, s) => acc + (parseFloat(s[campo]) || 0), 0);

  const filtrarMes      = s => parseInt(s.mes) === mesHoy && parseInt(s.año) === añoHoy;
  const filtrarPagosAño = p => parseInt(p.año) === añoHoy;

  const sesionesDelMes  = sesiones.filter(filtrarMes);
  const precioMes       = suma(sesionesDelMes, "precioTotal");

  if (cargando) return <div className="loading"><div className="spinner"></div> Cargando...</div>;

  const inicial = usuario?.nombre?.[0]?.toUpperCase() || "?";

  return (
    <>
      {/* ── SALUDO ──────────────────────────────────────── */}
      <div className="greet-card">
        {usuario?.foto ? (
          <img src={usuario.foto} alt={usuario.nombre} className="greet-avatar" />
        ) : (
          <div className="greet-avatar-fallback">{inicial}</div>
        )}
        <div>
          <div className="greet-hi">¡Hola, {usuario?.nombre?.split(" ")[0] || "Antonio"}!</div>
          <div className="greet-name">{usuario?.nombre}</div>
          <div className="greet-mail">{usuario?.email}</div>
        </div>
      </div>

      {/* ── ALERTAS ─────────────────────────────────────── */}
      {error && <div className="alerta alerta-error">{error}</div>}
      {exito && <div className="alerta alerta-success">{exito}</div>}

      {/* ── AVISOS CALENDAR ─────────────────────────────── */}
      {sesionesEliminadas.length > 0 && (
        <div className="calendar-warn-card">
          <div className="calendar-warn-title">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            Eventos eliminados en Google Calendar
          </div>
          <div className="calendar-warn-sub">
            Estos eventos fueron eliminados en Calendar. ¿Eliminar también en la app?
          </div>
          {sesionesEliminadas.map((s, i) => (
            <div key={i} className="calendar-warn-row">
              <div className="calendar-warn-info">
                <strong>{s.fecha}</strong> — {s.tipoCurso}
                <span style={{ color: "#6B7280", marginLeft: "6px" }}>{s.horaInicio1}–{s.horaFin1}</span>
                <span style={{ color: "#16A34A", marginLeft: "6px", fontWeight: "600" }}>
                  {parseFloat(s.precioTotal).toFixed(2)} €
                </span>
              </div>
              <div className="calendar-warn-btns">
                <button
                  className="btn btn-outline"
                  style={{ padding: "5px 10px", fontSize: "11px" }}
                  onClick={() => ignorarAviso(s.id)}>
                  Ignorar
                </button>
                <button
                  className="btn btn-danger"
                  style={{ padding: "5px 10px", fontSize: "11px" }}
                  disabled={eliminando === s.id}
                  onClick={() => confirmarEliminarSesion(s)}>
                  {eliminando === s.id
                    ? <div className="spinner" style={{ width: "12px", height: "12px", borderWidth: "2px" }}></div>
                    : "Eliminar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── CUADRÍCULA DE ACCESOS ────────────────────────── */}
      <div className="action-grid">

        {/* Nueva sesión */}
        <Link to="/nueva-sesion" className="action-card">
          <div className="action-card-icon" style={{ background: "#F97316" }}>
            <svg viewBox="0 0 24 24">
              <path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
            </svg>
          </div>
          <span className="action-card-label">Nueva Sesión</span>
        </Link>

        {/* Sincronizar Calendar — ejecuta directamente */}
        <button
          className="action-card"
          onClick={sincronizarCalendar}
          disabled={sincronizando}
          style={{ background: "white" }}>
          <div className="action-card-icon" style={{ background: "#2272D4" }}>
            {sincronizando ? (
              <div className="spinner" style={{ width: "24px", height: "24px", borderColor: "rgba(255,255,255,0.3)", borderTopColor: "white" }}></div>
            ) : (
              <svg viewBox="0 0 24 24">
                <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
              </svg>
            )}
          </div>
          <span className="action-card-label">
            {sincronizando ? "Sincronizando..." : "Sincronizar Calendar"}
          </span>
        </button>

        {/* Historial sesiones */}
        <Link to="/sesiones" className="action-card">
          <div className="action-card-icon" style={{ background: "#D97706" }}>
            <svg viewBox="0 0 24 24">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
            </svg>
          </div>
          <span className="action-card-label">Historial Sesiones</span>
        </Link>

        {/* Contabilidad */}
        <Link to="/contabilidad" className="action-card">
          <div className="action-card-icon" style={{ background: "#16A34A" }}>
            <svg viewBox="0 0 24 24">
              <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
            </svg>
          </div>
          <span className="action-card-label">Contabilidad</span>
        </Link>

        {/* Panel de control */}
        <Link to="/panel" className="action-card">
          <div className="action-card-icon" style={{ background: "#1E5FA8" }}>
            <svg viewBox="0 0 24 24">
              <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
            </svg>
          </div>
          <span className="action-card-label">Panel de Control</span>
        </Link>

        {/* Configuración */}
        <Link to="/configuracion" className="action-card">
          <div className="action-card-icon" style={{ background: "#4A5568" }}>
            <svg viewBox="0 0 24 24">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </div>
          <span className="action-card-label">Configuración</span>
        </Link>
      </div>

      {/* ── RESUMEN RÁPIDO ───────────────────────────────── */}
      <div className="home-section-title">Resumen Rápido</div>
      <div className="stats-home-row">
        <div className="stat-home-card">
          <div className="stat-home-icon">
            <svg viewBox="0 0 24 24">
              <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
          </div>
          <div className="stat-home-label">Sesiones Registradas (Mes)</div>
          <div className="stat-home-value">{sesionesDelMes.length}</div>
        </div>
        <div className="stat-home-card">
          <div className="stat-home-icon">
            <svg viewBox="0 0 24 24">
              <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
            </svg>
          </div>
          <div className="stat-home-label">Ingresos Netos (Mes)</div>
          <div className="stat-home-value" style={{ fontSize: "18px" }}>
            €{precioMes.toFixed(2).replace(".", ",")}
          </div>
        </div>
      </div>
    </>
  );
}

export default Dashboard;
