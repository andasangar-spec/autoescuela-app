import React, { useEffect, useState } from "react";
import {
  getSesiones, getPagos, getTiposCurso,
  getCalendarControlContable, getEventosCalendar,
  guardarSesion, actualizarSesion, eliminarFila,
  eliminarEventoCalendar, generarId
} from "../services/googleApi";
import { getWeek, getMonth, getYear, format, isAfter, startOfDay } from "date-fns";

function Dashboard() {
  const [sesiones, setSesiones]               = useState([]);
  const [pagos, setPagos]                     = useState([]);
  const [cargando, setCargando]               = useState(true);
  const [error, setError]                     = useState("");
  const [exito, setExito]                     = useState("");
  const [sincronizando, setSincronizando]     = useState(false);
  const [sesionesEliminadas, setSesionesEliminadas] = useState([]);
  const [eliminando, setEliminando]           = useState(null);

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
    } catch (err) {
      setError("Error al cargar datos.");
    } finally {
      setCargando(false);
    }
  };

  // ── Confirmar eliminación de sesión desde aviso ──────────
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

  // ── Sincronizar Calendar → App ───────────────────────────
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

      // Mapa eventId → sesión
      const mapaEventoSesion = {};
      sesionesActuales.forEach(s => {
        if (s.calendarEventId) {
          s.calendarEventId.split(",").forEach(id => {
            mapaEventoSesion[id.trim()] = s;
          });
        }
      });

      // IDs de eventos activos en Calendar
      const idsEnCalendar = new Set(eventos.map(e => e.id));

      let importados   = 0;
      let actualizados = 0;
      let ignorados    = 0;
      const eliminadasDetectadas = [];

      // ── Detectar sesiones cuyo evento fue eliminado en Calendar ──
      sesionesActuales.forEach(s => {
        if (!s.calendarEventId) return;
        // Solo sesiones importadas desde Calendar (id empieza por CAL)
        if (!s.id.startsWith("CAL")) return;
        const ids = s.calendarEventId.split(",").map(id => id.trim());
        const todosEliminados = ids.every(id => !idsEnCalendar.has(id));
        if (todosEliminados) {
          eliminadasDetectadas.push(s);
        }
      });

      // ── Procesar eventos de Calendar ─────────────────────────
      for (const evento of eventos) {
        const titulo      = evento.summary?.trim() || "";
        const fechaEvento = evento.start?.dateTime || evento.start?.date;
        if (!fechaEvento) continue;

        const fechaObj = new Date(fechaEvento);

        if (isAfter(startOfDay(fechaObj), hoyInicio)) {
          ignorados++;
          continue;
        }

        const tipoMatch = tipos.find(t => t.nombre === titulo);
        if (!tipoMatch) continue;

        const horaInicio   = evento.start?.dateTime ? format(new Date(evento.start.dateTime), "HH:mm") : "09:00";
        const horaFin      = evento.end?.dateTime   ? format(new Date(evento.end.dateTime),   "HH:mm") : "10:00";
        const duracionMin  = tipoMatch.duracionMin || 60;
        const minutosNetos = Math.max(0,
          (new Date(evento.end?.dateTime   || evento.end?.date) -
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
          const mismaHoraInicio = sesionExistente.horaInicio1 === horaInicio;
          const mismaHoraFin    = sesionExistente.horaFin1    === horaFin;
          const mismaFecha      = sesionExistente.fecha        === fechaFmt;
          const mismoTipo       = sesionExistente.tipoCurso    === titulo;

          if (!mismaHoraInicio || !mismaHoraFin || !mismaFecha || !mismoTipo) {
            await actualizarSesion({
              ...sesionExistente,
              fecha:       fechaFmt,
              diaSemana,
              semana,
              mes,
              año,
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
            diaSemana,
            semana,
            mes,
            año,
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

      if (eliminadasDetectadas.length > 0) {
        setSesionesEliminadas(eliminadasDetectadas);
      }

      const partes = [];
      if (importados   > 0) partes.push(`${importados} sesión(es) importada(s)`);
      if (actualizados > 0) partes.push(`${actualizados} sesión(es) actualizada(s)`);
      if (ignorados    > 0) partes.push(`${ignorados} evento(s) futuro(s) pendiente(s)`);
      if (eliminadasDetectadas.length > 0) partes.push(`${eliminadasDetectadas.length} sesión(es) eliminada(s) en Calendar — revisa los avisos`);

      setExito(`✅ Sincronización completada. ${partes.length > 0 ? partes.join(", ") + "." : "No hay cambios nuevos."}`);

    } catch (e) {
      setError("Error al sincronizar: " + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  const suma = (lista, campo) => lista.reduce((acc, s) => acc + (parseFloat(s[campo]) || 0), 0);

  const filtrarSemana   = s => parseInt(s.semana) === semanaHoy && parseInt(s.año) === añoHoy;
  const filtrarMes      = s => parseInt(s.mes)    === mesHoy    && parseInt(s.año) === añoHoy;
  const filtrarAño      = s => parseInt(s.año)    === añoHoy;
  const filtrarPagosAño = p => parseInt(p.año)    === añoHoy;

  const horasSemana  = suma(sesiones.filter(filtrarSemana),   "horasTotal");
  const precioSemana = suma(sesiones.filter(filtrarSemana),   "precioTotal");
  const horasMes     = suma(sesiones.filter(filtrarMes),      "horasTotal");
  const precioMes    = suma(sesiones.filter(filtrarMes),      "precioTotal");
  const horasAño     = suma(sesiones.filter(filtrarAño),      "horasTotal");
  const totalAño     = suma(sesiones.filter(filtrarAño),      "precioTotal");
  const cobradoAño   = suma(pagos.filter(filtrarPagosAño),    "importe");
  const pendienteAño = totalAño - cobradoAño;

  const ultimasSesiones = [...sesiones]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 5);

  const formatEur = n => `${n.toFixed(2).replace(".", ",")} €`;
  const formatH   = n => `${n.toFixed(2).replace(".", ",")} h`;

  if (cargando) return <div className="loading"><div className="spinner"></div> Cargando datos...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>📊 Panel de control</h1>
        <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
          <button className="btn btn-outline" onClick={cargarDatos}>🔄 Actualizar</button>
          <button
            className="btn btn-primary"
            onClick={sincronizarCalendar}
            disabled={sincronizando}
            style={{ background:"#34a853", border:"none" }}>
            {sincronizando
              ? <><div className="spinner" style={{ width:"16px",height:"16px",borderWidth:"2px" }}></div> Sincronizando...</>
              : "📅 Sincronizar Calendar"}
          </button>
        </div>
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}
      {exito && <div className="alerta alerta-success">{exito}</div>}

      {/* ── Avisos de sesiones eliminadas en Calendar ─────── */}
      {sesionesEliminadas.length > 0 && (
        <div className="card" style={{ border:"2px solid #ea4335" }}>
          <div className="card-title" style={{ color:"#ea4335" }}>
            ⚠️ Eventos eliminados en Google Calendar
          </div>
          <p style={{ fontSize:"13px", color:"#666", marginBottom:"16px" }}>
            Los siguientes eventos fueron eliminados en Google Calendar.
            ¿Quieres eliminar también las sesiones correspondientes en la app?
          </p>
          {sesionesEliminadas.map((s, i) => (
            <div key={i} style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"12px", background:"#fce8e6", borderRadius:"8px", marginBottom:"8px", gap:"12px"
            }}>
              <div style={{ fontSize:"14px" }}>
                <strong>{s.fecha}</strong> — <span style={{ color:"#1a73e8" }}>{s.tipoCurso}</span>
                <span style={{ color:"#666", marginLeft:"8px" }}>{s.horaInicio1}–{s.horaFin1}</span>
                <span style={{ color:"#34a853", marginLeft:"8px", fontWeight:"600" }}>{parseFloat(s.precioTotal).toFixed(2)} €</span>
              </div>
              <div style={{ display:"flex", gap:"8px", flexShrink:0 }}>
                <button
                  className="btn btn-outline"
                  style={{ padding:"6px 12px", fontSize:"12px" }}
                  onClick={() => ignorarAviso(s.id)}>
                  Ignorar
                </button>
                <button
                  className="btn btn-danger"
                  style={{ padding:"6px 12px", fontSize:"12px", justifyContent:"center" }}
                  disabled={eliminando === s.id}
                  onClick={() => confirmarEliminarSesion(s)}>
                  {eliminando === s.id
                    ? <div className="spinner" style={{ width:"14px",height:"14px",borderWidth:"2px" }}></div>
                    : "🗑️ Eliminar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Semana */}
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

      {/* Mes */}
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

      {/* Año */}
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

      {/* Últimas sesiones */}
      <div className="card">
        <div className="card-title">🕐 Últimas sesiones</div>
        {ultimasSesiones.length === 0 ? (
          <p style={{ color:"#999", textAlign:"center", padding:"24px" }}>
            No hay sesiones registradas aún
          </p>
        ) : (
          <div className="tabla-container">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Tipo</th><th>Horas</th><th>Importe</th></tr>
              </thead>
              <tbody>
                {ultimasSesiones.map((s, i) => (
                  <tr key={i}>
                    <td>{s.fecha}</td>
                    <td><span className="badge" style={{ background:"#1a73e8" }}>{s.tipoCurso}</span></td>
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