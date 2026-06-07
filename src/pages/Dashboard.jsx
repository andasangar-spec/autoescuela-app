import React, { useEffect, useState } from "react";
import { getSesiones, getPagos, getTiposCurso, getCalendarControlContable, getEventosCalendar, guardarSesion, generarId } from "../services/googleApi";
import { getWeek, getMonth, getYear, format, parseISO, isAfter, startOfDay } from "date-fns";

function Dashboard() {
  const [sesiones, setSesiones]         = useState([]);
  const [pagos, setPagos]               = useState([]);
  const [cargando, setCargando]         = useState(true);
  const [error, setError]               = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [exito, setExito]               = useState("");

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
      setError("Error al cargar datos. Comprueba tu conexión.");
    } finally {
      setCargando(false);
    }
  };

  // ── Sincronizar desde Google Calendar ───────────────────
  const sincronizarCalendar = async () => {
    setSincronizando(true);
    setError(""); setExito("");
    try {
      // 1. Obtener tipos de curso activos
      const tipos = await getTiposCurso();
      const nombresCursos = tipos.map(t => t.nombre);

      // 2. Obtener ID del calendario Control_Contable
      const calendarId = await getCalendarControlContable();
      if (!calendarId) {
        setError("No se encontró el calendario 'Control_Contable'. Verifica que existe en Google Calendar.");
        return;
      }

      // 3. Leer eventos del calendario
      const eventos = await getEventosCalendar(calendarId);

      // 4. Obtener IDs de eventos ya importados para no duplicar
      const sesionesActuales = await getSesiones();
      const idsImportados = new Set(
        sesionesActuales
          .map(s => s.calendarEventId)
          .filter(Boolean)
          .flatMap(id => id.split(","))
          .map(id => id.trim())
      );

      // 5. Filtrar eventos válidos
      const hoyInicio = startOfDay(new Date());
      let importados = 0;
      let ignorados  = 0;

      for (const evento of eventos) {
        const titulo     = evento.summary?.trim() || "";
        const fechaEvento = evento.start?.dateTime || evento.start?.date;
        if (!fechaEvento) continue;

        const fechaObj = new Date(fechaEvento);

        // Solo eventos cuya fecha ya llegó (pasados o de hoy)
        if (isAfter(startOfDay(fechaObj), hoyInicio)) {
          ignorados++;
          continue;
        }

        // Solo si el título coincide exactamente con un curso
        const tipoMatch = tipos.find(t => t.nombre === titulo);
        if (!tipoMatch) continue;

        // No duplicar eventos ya importados
        if (idsImportados.has(evento.id)) continue;

        // Calcular horas y precio
        const horaInicio = evento.start?.dateTime
          ? format(new Date(evento.start.dateTime), "HH:mm")
          : "09:00";
        const horaFin = evento.end?.dateTime
          ? format(new Date(evento.end.dateTime), "HH:mm")
          : "10:00";

        const duracionMin   = tipoMatch.duracionMin || 60;
        const minutosNetos  = Math.max(0, (new Date(evento.end?.dateTime || evento.end?.date) - new Date(evento.start?.dateTime || evento.start?.date)) / 60000);
        const numClases     = duracionMin > 0 ? Math.floor(minutosNetos / duracionMin) : 0;
        const horasTotal    = minutosNetos / 60;
        const precioTotal   = tipoMatch.tipoPrecio === "total"
          ? tipoMatch.precio
          : numClases * tipoMatch.precio;

        const fechaFmt  = format(fechaObj, "dd/MM/yyyy");
        const diaSemana = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"][fechaObj.getDay()];
        const semana    = getWeek(fechaObj, { weekStartsOn: 1 });
        const mes       = getMonth(fechaObj) + 1;
        const año       = getYear(fechaObj);

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

      // 6. Recargar datos
      await cargarDatos();

      if (importados === 0 && ignorados === 0) {
        setExito("✅ Sincronización completada. No hay eventos nuevos para importar.");
      } else {
        setExito(`✅ Sincronización completada. ${importados} sesión(es) importada(s).${ignorados > 0 ? ` ${ignorados} evento(s) futuro(s) pendiente(s).` : ""}`);
      }

    } catch (e) {
      setError("Error al sincronizar: " + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  const suma = (lista, campo) => lista.reduce((acc, s) => acc + (parseFloat(s[campo]) || 0), 0);

  const filtrarSemana  = s => parseInt(s.semana) === semanaHoy && parseInt(s.año) === añoHoy;
  const filtrarMes     = s => parseInt(s.mes) === mesHoy && parseInt(s.año) === añoHoy;
  const filtrarAño     = s => parseInt(s.año) === añoHoy;
  const filtrarPagosAño = p => parseInt(p.año) === añoHoy;

  const horasSemana   = suma(sesiones.filter(filtrarSemana), "horasTotal");
  const precioSemana  = suma(sesiones.filter(filtrarSemana), "precioTotal");
  const horasMes      = suma(sesiones.filter(filtrarMes), "horasTotal");
  const precioMes     = suma(sesiones.filter(filtrarMes), "precioTotal");
  const horasAño      = suma(sesiones.filter(filtrarAño), "horasTotal");
  const totalAño      = suma(sesiones.filter(filtrarAño), "precioTotal");
  const cobradoAño    = suma(pagos.filter(filtrarPagosAño), "importe");
  const pendienteAño  = totalAño - cobradoAño;

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
        <div style={{ display:"flex", gap:"8px" }}>
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
          <p style={{ color:"#999", textAlign:"center", padding:"24px" }}>
            No hay sesiones registradas aún
          </p>
        ) : (
          <div className="tabla-container">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Tipo</th><th>Horas</th><th>Importe</th>
                </tr>
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