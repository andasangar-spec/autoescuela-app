import React, { useEffect, useState } from "react";
import { getSesiones, eliminarFila, eliminarEventoCalendar } from "../services/googleApi";
import { getWeek, getYear, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function Sesiones() {
  const [sesiones, setSesiones]       = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [error, setError]             = useState("");
  const [exito, setExito]             = useState("");
  const [filtro, setFiltro]           = useState("mes");
  const [mesSelec, setMesSelec]       = useState(new Date().getMonth() + 1);
  const [semanaSelec, setSemanaSelec] = useState(getWeek(new Date(), { weekStartsOn: 1 }));
  const [añoSelec, setAñoSelec]       = useState(new Date().getFullYear());
  const [fechaDesde, setFechaDesde]   = useState("");
  const [fechaHasta, setFechaHasta]   = useState("");
  const [eliminando, setEliminando]   = useState(null);
  const [confirmar, setConfirmar]     = useState(null);

  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const semanas = Array.from({ length: 53 }, (_, i) => i + 1);

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setCargando(true); setError("");
    try { setSesiones(await getSesiones()); }
    catch (e) { setError("Error al cargar sesiones"); }
    finally { setCargando(false); }
  };

  const parsearFecha = (fechaStr) => {
    if (!fechaStr) return null;
    const partes = fechaStr.split("/");
    if (partes.length !== 3) return null;
    return new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
  };

  const sesionesFiltradas = sesiones.filter(s => {
    if (filtro === "mes")
      return parseInt(s.mes) === mesSelec && parseInt(s.año) === añoSelec;
    if (filtro === "semana") {
      const fecha = parsearFecha(s.fecha);
      if (!fecha) return false;
      return getWeek(fecha, { weekStartsOn: 1 }) === semanaSelec && getYear(fecha) === añoSelec;
    }
    if (filtro === "rango") {
      if (!fechaDesde || !fechaHasta) return true;
      const fecha = parsearFecha(s.fecha);
      if (!fecha) return false;
      return isWithinInterval(startOfDay(fecha), {
        start: startOfDay(parseISO(fechaDesde)),
        end:   endOfDay(parseISO(fechaHasta)),
      });
    }
    return parseInt(s.año) === añoSelec;
  }).sort((a, b) => {
    const fa = parsearFecha(a.fecha);
    const fb = parsearFecha(b.fecha);
    if (!fa || !fb) return 0;
    return fb - fa;
  });

  const totalHoras   = sesionesFiltradas.reduce((acc, s) => acc + (parseFloat(s.horasTotal) || 0), 0);
  const totalImporte = sesionesFiltradas.reduce((acc, s) => acc + (parseFloat(s.precioTotal) || 0), 0);
  const formatEur    = n => `${n.toFixed(2).replace(".", ",")} €`;
  const formatH      = n => `${n.toFixed(2).replace(".", ",")} h`;

  // ── Eliminar sesión ──────────────────────────────────────
  const handleEliminar = async (sesion) => {
    setEliminando(sesion.id);
    setError(""); setExito("");
    try {
      // 1. Eliminar eventos de Calendar
      if (sesion.calendarEventId) {
        await eliminarEventoCalendar(sesion.calendarEventId);
      }
      // 2. Eliminar fila en Sheets (índice 1-based, la fila real)
      await eliminarFila("SESIONES", sesion._fila - 1); // convertir a 0-based
      setExito("✅ Sesión eliminada correctamente");
      setConfirmar(null);
      await cargarDatos();
    } catch (e) {
      setError("Error al eliminar: " + e.message);
    } finally {
      setEliminando(null);
    }
  };

  const tituloPeriodo = () => {
    if (filtro === "mes")    return `${meses[mesSelec-1]}_${añoSelec}`;
    if (filtro === "semana") return `Semana${semanaSelec}_${añoSelec}`;
    if (filtro === "rango")  return `${fechaDesde}_${fechaHasta}`;
    return `Año_${añoSelec}`;
  };

  // ── Exportar Excel ───────────────────────────────────────
  const exportarExcel = () => {
    const datos = sesionesFiltradas.map(s => ({
      "Fecha":       s.fecha,
      "Día":         s.diaSemana,
      "Semana":      s.semana,
      "Tipo curso":  s.tipoCurso,
      "Inicio":      s.horaInicio1,
      "Fin":         s.horaFin1,
      "Pausa":       s.pausa === "SI" ? `${s.horaInicio2}-${s.horaFin2}` : "No",
      "Horas":       parseFloat(s.horasTotal),
      "Precio/hora": parseFloat(s.precioHora),
      "Total (€)":   parseFloat(s.precioTotal),
      "Notas":       s.notas || "",
    }));
    datos.push({
      "Fecha": "TOTAL", "Día": "", "Semana": "",
      "Tipo curso": `${sesionesFiltradas.length} sesiones`,
      "Inicio": "", "Fin": "", "Pausa": "",
      "Horas": totalHoras, "Precio/hora": "", "Total (€)": totalImporte, "Notas": "",
    });
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sesiones");
    ws["!cols"] = [{wch:12},{wch:12},{wch:8},{wch:18},{wch:8},{wch:8},{wch:14},{wch:8},{wch:10},{wch:10},{wch:20}];
    XLSX.writeFile(wb, `Sesiones_${tituloPeriodo()}.xlsx`);
  };

  // ── Exportar PDF ─────────────────────────────────────────
  const exportarPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16); doc.setTextColor(21, 87, 176);
    doc.text("AutoescuelaApp — Registro de Sesiones", 14, 16);
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`Período: ${tituloPeriodo().replace(/_/g, " ")}`, 14, 23);
    doc.text(`Total: ${sesionesFiltradas.length} sesiones | ${formatH(totalHoras)} | ${formatEur(totalImporte)}`, 14, 29);
    autoTable(doc, {
      startY: 33,
      head: [["Fecha","Día","Tipo curso","Horario","Pausa","Horas","Importe"]],
      body: [
        ...sesionesFiltradas.map(s => [
          s.fecha, s.diaSemana, s.tipoCurso,
          `${s.horaInicio1}–${s.horaFin1}`,
          s.pausa === "SI" ? `${s.horaInicio2}–${s.horaFin2}` : "—",
          formatH(parseFloat(s.horasTotal)),
          formatEur(parseFloat(s.precioTotal)),
        ]),
        ["TOTAL","",`${sesionesFiltradas.length} sesiones`,"","",formatH(totalHoras),formatEur(totalImporte)],
      ],
      headStyles: { fillColor: [21, 87, 176], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      styles: { fontSize: 9 },
      didParseCell: (data) => {
        if (data.row.index === sesionesFiltradas.length) {
          data.cell.styles.fillColor = [232, 240, 254];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    doc.save(`Sesiones_${tituloPeriodo()}.pdf`);
  };

  if (cargando) return <div className="loading"><div className="spinner"></div> Cargando sesiones...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>📋 Mis sesiones</h1>
        <button className="btn btn-outline" onClick={cargarDatos}>🔄 Actualizar</button>
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}
      {exito && <div className="alerta alerta-success">{exito}</div>}

      {/* Confirmación eliminar */}
      {confirmar && (
        <div style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,0.5)",
          display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000
        }}>
          <div style={{ background:"white", borderRadius:"16px", padding:"28px", maxWidth:"360px", width:"90%", textAlign:"center" }}>
            <div style={{ fontSize:"40px", marginBottom:"12px" }}>🗑️</div>
            <h3 style={{ marginBottom:"8px" }}>¿Eliminar sesión?</h3>
            <p style={{ color:"#666", fontSize:"14px", marginBottom:"20px" }}>
              <strong>{confirmar.fecha}</strong> — {confirmar.tipoCurso}<br/>
              Esta acción también eliminará el evento de Google Calendar.
            </p>
            <div style={{ display:"flex", gap:"12px" }}>
              <button className="btn btn-outline" style={{ flex:1 }}
                onClick={() => setConfirmar(null)}>
                Cancelar
              </button>
              <button className="btn btn-danger" style={{ flex:1, justifyContent:"center" }}
                disabled={eliminando === confirmar.id}
                onClick={() => handleEliminar(confirmar)}>
                {eliminando === confirmar.id
                  ? <><div className="spinner" style={{ width:"16px",height:"16px",borderWidth:"2px" }}></div> Eliminando...</>
                  : "🗑️ Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="card">
        <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", marginBottom:"16px" }}>
          {[
            { key:"mes",    label:"Por mes" },
            { key:"semana", label:"Por semana" },
            { key:"año",    label:"Año completo" },
            { key:"rango",  label:"📅 Rango de fechas" },
          ].map(f => (
            <button key={f.key}
              className={`btn ${filtro === f.key ? "btn-primary" : "btn-outline"}`}
              onClick={() => setFiltro(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", gap:"12px", flexWrap:"wrap", alignItems:"center" }}>
          {filtro === "mes" && (
            <>
              <select className="form-control" style={{ width:"auto" }}
                value={mesSelec} onChange={e => setMesSelec(parseInt(e.target.value))}>
                {meses.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
              <select className="form-control" style={{ width:"auto" }}
                value={añoSelec} onChange={e => setAñoSelec(parseInt(e.target.value))}>
                {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </>
          )}
          {filtro === "semana" && (
            <>
              <select className="form-control" style={{ width:"auto" }}
                value={semanaSelec} onChange={e => setSemanaSelec(parseInt(e.target.value))}>
                {semanas.map(s => <option key={s} value={s}>Semana {s}</option>)}
              </select>
              <select className="form-control" style={{ width:"auto" }}
                value={añoSelec} onChange={e => setAñoSelec(parseInt(e.target.value))}>
                {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </>
          )}
          {filtro === "año" && (
            <select className="form-control" style={{ width:"auto" }}
              value={añoSelec} onChange={e => setAñoSelec(parseInt(e.target.value))}>
              {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {filtro === "rango" && (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                <label style={{ fontSize:"13px", fontWeight:"600", color:"#5f6368" }}>Desde:</label>
                <input type="date" className="form-control" style={{ width:"auto" }}
                  value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                <label style={{ fontSize:"13px", fontWeight:"600", color:"#5f6368" }}>Hasta:</label>
                <input type="date" className="form-control" style={{ width:"auto" }}
                  value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Totales */}
      <div className="stats-grid" style={{ marginBottom:"20px" }}>
        <div className="stat-card">
          <div className="stat-icon">📝</div>
          <div className="stat-valor">{sesionesFiltradas.length}</div>
          <div className="stat-label">Sesiones</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-valor">{formatH(totalHoras)}</div>
          <div className="stat-label">Total horas</div>
        </div>
        <div className="stat-card verde">
          <div className="stat-icon">💵</div>
          <div className="stat-valor">{formatEur(totalImporte)}</div>
          <div className="stat-label">Total importe</div>
        </div>
      </div>

      {/* Botones exportar */}
      {sesionesFiltradas.length > 0 && (
        <div style={{ display:"flex", gap:"12px", marginBottom:"20px" }}>
          <button className="btn btn-success" onClick={exportarExcel}
            style={{ flex:1, justifyContent:"center" }}>
            📊 Exportar Excel
          </button>
          <button className="btn btn-primary" onClick={exportarPDF}
            style={{ flex:1, justifyContent:"center" }}>
            📄 Exportar PDF
          </button>
        </div>
      )}

      {/* Tabla */}
      <div className="card">
        {sesionesFiltradas.length === 0 ? (
          <p style={{ textAlign:"center", color:"#999", padding:"32px" }}>
            No hay sesiones en este período
          </p>
        ) : (
          <div className="tabla-container">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Día</th><th>Tipo</th>
                  <th>Horario</th><th>Pausa</th><th>Horas</th>
                  <th>Importe</th><th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {sesionesFiltradas.map((s, i) => (
                  <tr key={i}>
                    <td><strong>{s.fecha}</strong></td>
                    <td>{s.diaSemana}</td>
                    <td><span className="badge" style={{ background:"#1a73e8" }}>{s.tipoCurso}</span></td>
                    <td style={{ fontSize:"13px" }}>
                      {s.horaInicio1}–{s.horaFin1}
                      {s.pausa === "SI" && (
                        <span style={{ color:"#e65100" }}> / {s.horaInicio2}–{s.horaFin2}</span>
                      )}
                    </td>
                    <td>{s.pausa === "SI" ? "☕ Sí" : "—"}</td>
                    <td><strong>{formatH(parseFloat(s.horasTotal))}</strong></td>
                    <td><strong style={{ color:"#34a853" }}>{formatEur(parseFloat(s.precioTotal))}</strong></td>
                    <td>
                      <button
                        className="btn btn-danger"
                        style={{ padding:"4px 10px", fontSize:"12px" }}
                        onClick={() => setConfirmar(s)}>
                        🗑️
                      </button>
                    </td>
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

export default Sesiones;