import React, { useEffect, useState } from "react";
import { getSesiones, eliminarFila, eliminarEventoCalendar, actualizarSesion, crearEventoCalendar, getTiposCurso } from "../services/googleApi";
import { getWeek, getYear, parseISO, isWithinInterval, startOfDay, endOfDay, format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const generarHoras = () => {
  const h = [];
  for (let i = 5; i <= 22; i++)
    for (let m = 0; m < 60; m += 15)
      h.push(`${String(i).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  return h;
};
const HORAS = generarHoras();
const calcularHoras = (inicio, fin) => {
  if (!inicio || !fin) return 0;
  const [h1,m1] = inicio.split(":").map(Number);
  const [h2,m2] = fin.split(":").map(Number);
  return Math.max(0, ((h2*60+m2)-(h1*60+m1))/60);
};
const diasSemana = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

function Sesiones() {
  const [sesiones, setSesiones]       = useState([]);
  const [tipos, setTipos]             = useState([]);
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
  const [editando, setEditando]       = useState(null);
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [formEdit, setFormEdit]       = useState({});

  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const semanas = Array.from({ length: 53 }, (_, i) => i + 1);

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setCargando(true); setError("");
    try {
      const [s, t] = await Promise.all([getSesiones(), getTiposCurso()]);
      setSesiones(s);
      setTipos(t);
    }
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

  // ── Abrir modal edición ──────────────────────────────────
  const handleEditar = (sesion) => {
    const fechaObj = parsearFecha(sesion.fecha);
    const fechaISO = fechaObj ? format(fechaObj, "yyyy-MM-dd") : "";
    setFormEdit({
      ...sesion,
      fechaISO,
      hasPausa: sesion.pausa === "SI",
    });
    setEditando(sesion);
  };

  const handleChangeEdit = (campo, valor) => {
    setFormEdit(f => ({ ...f, [campo]: valor }));
  };

  const handleCursoChangeEdit = (nombre) => {
    const tipo = tipos.find(t => t.nombre === nombre);
    if (tipo) setFormEdit(f => ({
      ...f,
      tipoCurso:  nombre,
      tipoPrecio: tipo.tipoPrecio,
      precioHora: tipo.precio,
    }));
  };

  // Cálculos del formulario de edición
  const horasBrutoEdit  = calcularHoras(formEdit.horaInicio1, formEdit.horaFin1 === formEdit.horaFin ? formEdit.horaFin1 : formEdit.horaFin1);
  const horasPausaEdit  = formEdit.hasPausa ? calcularHoras(formEdit.horaInicio2, formEdit.horaFin2) : 0;

  // Si hay pausa: total = tramo1 + tramo2
  const horasTramo1Edit = formEdit.hasPausa
    ? calcularHoras(formEdit.horaInicio1, formEdit.horaInicio2)
    : calcularHoras(formEdit.horaInicio1, formEdit.horaFin1);
  const horasTramo2Edit = formEdit.hasPausa
    ? calcularHoras(formEdit.horaFin2 || formEdit.horaInicio2, formEdit.horaFin1)
    : 0;
  const horasTotalEdit  = horasTramo1Edit + horasTramo2Edit;
  const precioTotalEdit = formEdit.tipoPrecio === "hora"
    ? horasTotalEdit * parseFloat(formEdit.precioHora || 0)
    : parseFloat(formEdit.precioFijo || 0);

  // ── Guardar edición ──────────────────────────────────────
  const handleGuardarEdit = async () => {
    setError(""); setExito("");
    setGuardandoEdit(true);
    try {
      const fechaObj  = new Date(formEdit.fechaISO);
      const diaSem    = diasSemana[fechaObj.getDay()];
      const semana    = getWeek(fechaObj, { weekStartsOn: 1 });
      const mes       = fechaObj.getMonth() + 1;
      const año       = fechaObj.getFullYear();
      const fechaFmt  = format(fechaObj, "dd/MM/yyyy");
      const tipoActual = tipos.find(t => t.nombre === formEdit.tipoCurso);
      const colorCurso = tipoActual?.colorCalendar || "#1a73e8";
      const descripcion = `${formEdit.tipoCurso} | ${horasTotalEdit.toFixed(2)}h | ${precioTotalEdit.toFixed(2)}€`;

      // Eliminar eventos Calendar anteriores
      if (editando.calendarEventId) {
        await eliminarEventoCalendar(editando.calendarEventId);
      }

      // Crear nuevos eventos Calendar
      const horaFinTramo1 = formEdit.hasPausa ? formEdit.horaInicio2 : formEdit.horaFin1;
      const eventId1 = await crearEventoCalendar({
        titulo:     `🚗 ${formEdit.tipoCurso} (${horasTramo1Edit.toFixed(2)}h)`,
        fecha:      formEdit.fechaISO,
        horaInicio: formEdit.horaInicio1,
        horaFin:    horaFinTramo1,
        color:      colorCurso,
        descripcion,
      });

      let eventId2 = "";
      if (formEdit.hasPausa && horasTramo2Edit > 0) {
        eventId2 = await crearEventoCalendar({
          titulo:     `🚗 ${formEdit.tipoCurso} (${horasTramo2Edit.toFixed(2)}h)`,
          fecha:      formEdit.fechaISO,
          horaInicio: formEdit.horaFin2,
          horaFin:    formEdit.horaFin1,
          color:      colorCurso,
          descripcion,
        });
      }

      // Actualizar en Sheets
      const sesionActualizada = {
        ...editando,
        fecha:           fechaFmt,
        diaSemana:       diaSem,
        semana,
        mes,
        año,
        tipoCurso:       formEdit.tipoCurso,
        horaInicio1:     formEdit.horaInicio1,
        horaFin1:        formEdit.horaFin1,
        pausa:           formEdit.hasPausa ? "SI" : "NO",
        horaInicio2:     formEdit.hasPausa ? formEdit.horaInicio2 : "",
        horaFin2:        formEdit.hasPausa ? formEdit.horaFin2 : "",
        horasTramo1:     horasTramo1Edit.toFixed(2),
        horasTramo2:     horasTramo2Edit.toFixed(2),
        horasTotal:      horasTotalEdit.toFixed(2),
        tipoPrecio:      formEdit.tipoPrecio,
        precioHora:      parseFloat(formEdit.precioHora),
        precioTotal:     precioTotalEdit.toFixed(2),
        calendarEventId: eventId1 + (eventId2 ? "," + eventId2 : ""),
        notas:           formEdit.notas || "",
      };

      await actualizarSesion(sesionActualizada);
      setExito("✅ Sesión actualizada correctamente");
      setEditando(null);
      await cargarDatos();
    } catch (e) {
      setError("Error al actualizar: " + e.message);
    } finally {
      setGuardandoEdit(false);
    }
  };

  // ── Eliminar sesión ──────────────────────────────────────
  const handleEliminar = async (sesion) => {
    setEliminando(sesion.id);
    setError(""); setExito("");
    try {
      if (sesion.calendarEventId) await eliminarEventoCalendar(sesion.calendarEventId);
      await eliminarFila("SESIONES", sesion._fila - 1);
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

  const exportarExcel = () => {
    const datos = sesionesFiltradas.map(s => ({
      "Fecha": s.fecha, "Día": s.diaSemana, "Semana": s.semana,
      "Tipo curso": s.tipoCurso, "Inicio": s.horaInicio1, "Fin": s.horaFin1,
      "Pausa": s.pausa === "SI" ? `${s.horaInicio2}-${s.horaFin2}` : "No",
      "Horas": parseFloat(s.horasTotal), "Precio/hora": parseFloat(s.precioHora),
      "Total (€)": parseFloat(s.precioTotal), "Notas": s.notas || "",
    }));
    datos.push({ "Fecha":"TOTAL","Día":"","Semana":"","Tipo curso":`${sesionesFiltradas.length} sesiones`,
      "Inicio":"","Fin":"","Pausa":"","Horas":totalHoras,"Precio/hora":"","Total (€)":totalImporte,"Notas":"" });
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sesiones");
    ws["!cols"] = [{wch:12},{wch:12},{wch:8},{wch:18},{wch:8},{wch:8},{wch:14},{wch:8},{wch:10},{wch:10},{wch:20}];
    XLSX.writeFile(wb, `Sesiones_${tituloPeriodo()}.xlsx`);
  };

  const exportarPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16); doc.setTextColor(21, 87, 176);
    doc.text("AutoescuelaApp — Registro de Sesiones", 14, 16);
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`Período: ${tituloPeriodo().replace(/_/g," ")}`, 14, 23);
    doc.text(`Total: ${sesionesFiltradas.length} sesiones | ${formatH(totalHoras)} | ${formatEur(totalImporte)}`, 14, 29);
    autoTable(doc, {
      startY: 33,
      head: [["Fecha","Día","Tipo curso","Horario","Pausa","Horas","Importe"]],
      body: [
        ...sesionesFiltradas.map(s => [
          s.fecha, s.diaSemana, s.tipoCurso, `${s.horaInicio1}–${s.horaFin1}`,
          s.pausa === "SI" ? `${s.horaInicio2}–${s.horaFin2}` : "—",
          formatH(parseFloat(s.horasTotal)), formatEur(parseFloat(s.precioTotal)),
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

      {/* ── Modal confirmar eliminar ─────────────────────── */}
      {confirmar && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
          <div style={{ background:"white", borderRadius:"16px", padding:"28px", maxWidth:"360px", width:"90%", textAlign:"center" }}>
            <div style={{ fontSize:"40px", marginBottom:"12px" }}>🗑️</div>
            <h3 style={{ marginBottom:"8px" }}>¿Eliminar sesión?</h3>
            <p style={{ color:"#666", fontSize:"14px", marginBottom:"20px" }}>
              <strong>{confirmar.fecha}</strong> — {confirmar.tipoCurso}<br/>
              También se eliminará el evento de Google Calendar.
            </p>
            <div style={{ display:"flex", gap:"12px" }}>
              <button className="btn btn-outline" style={{ flex:1 }} onClick={() => setConfirmar(null)}>Cancelar</button>
              <button className="btn btn-danger" style={{ flex:1, justifyContent:"center" }}
                disabled={eliminando === confirmar.id} onClick={() => handleEliminar(confirmar)}>
                {eliminando === confirmar.id
                  ? <><div className="spinner" style={{ width:"16px",height:"16px",borderWidth:"2px" }}></div> Eliminando...</>
                  : "🗑️ Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal editar sesión ──────────────────────────── */}
      {editando && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, overflowY:"auto", padding:"20px" }}>
          <div style={{ background:"white", borderRadius:"16px", padding:"24px", maxWidth:"500px", width:"100%", maxHeight:"90vh", overflowY:"auto" }}>
            <h3 style={{ marginBottom:"20px", color:"#1557b0" }}>✏️ Editar sesión</h3>

            <div className="form-row">
              <div className="form-group">
                <label>Fecha</label>
                <input type="date" className="form-control" value={formEdit.fechaISO}
                  onChange={e => handleChangeEdit("fechaISO", e.target.value)} />
              </div>
              <div className="form-group">
                <label>Tipo de curso</label>
                <select className="form-control" value={formEdit.tipoCurso}
                  onChange={e => handleCursoChangeEdit(e.target.value)}>
                  {tipos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Hora inicio</label>
                <select className="form-control" value={formEdit.horaInicio1}
                  onChange={e => handleChangeEdit("horaInicio1", e.target.value)}>
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Hora fin</label>
                <select className="form-control" value={formEdit.horaFin1}
                  onChange={e => handleChangeEdit("horaFin1", e.target.value)}>
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:"12px", margin:"12px 0" }}>
              <input type="checkbox" id="pausaEdit" checked={formEdit.hasPausa}
                onChange={e => handleChangeEdit("hasPausa", e.target.checked)}
                style={{ width:"18px", height:"18px" }} />
              <label htmlFor="pausaEdit" style={{ fontWeight:"600" }}>☕ Pausa en medio</label>
            </div>

            {formEdit.hasPausa && (
              <div className="pausa-section">
                <div className="form-row">
                  <div className="form-group">
                    <label>Inicio pausa</label>
                    <select className="form-control" value={formEdit.horaInicio2}
                      onChange={e => handleChangeEdit("horaInicio2", e.target.value)}>
                      {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fin pausa</label>
                    <select className="form-control" value={formEdit.horaFin2}
                      onChange={e => handleChangeEdit("horaFin2", e.target.value)}>
                      {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Tipo de precio</label>
              <div style={{ display:"flex", gap:"16px" }}>
                <label style={{ display:"flex", alignItems:"center", gap:"8px", cursor:"pointer" }}>
                  <input type="radio" value="hora" checked={formEdit.tipoPrecio === "hora"}
                    onChange={() => handleChangeEdit("tipoPrecio","hora")} />Por hora
                </label>
                <label style={{ display:"flex", alignItems:"center", gap:"8px", cursor:"pointer" }}>
                  <input type="radio" value="total" checked={formEdit.tipoPrecio === "total"}
                    onChange={() => handleChangeEdit("tipoPrecio","total")} />Precio fijo
                </label>
              </div>
            </div>

            {formEdit.tipoPrecio === "hora" ? (
              <div className="form-group">
                <label>Precio por hora (€)</label>
                <input type="number" className="form-control" value={formEdit.precioHora}
                  onChange={e => handleChangeEdit("precioHora", e.target.value)} min="0" step="0.5" />
              </div>
            ) : (
              <div className="form-group">
                <label>Precio fijo total (€)</label>
                <input type="number" className="form-control" value={formEdit.precioFijo || 0}
                  onChange={e => handleChangeEdit("precioFijo", e.target.value)} min="0" step="5" />
              </div>
            )}

            <div style={{ background:"#e8f0fe", borderRadius:"10px", padding:"12px", marginBottom:"16px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", textAlign:"center" }}>
              <div>
                <div style={{ fontSize:"20px", fontWeight:"800", color:"#1557b0" }}>{horasTotalEdit.toFixed(2)} h</div>
                <div style={{ fontSize:"12px", color:"#666" }}>Total horas</div>
              </div>
              <div>
                <div style={{ fontSize:"20px", fontWeight:"800", color:"#34a853" }}>{precioTotalEdit.toFixed(2)} €</div>
                <div style={{ fontSize:"12px", color:"#666" }}>Total importe</div>
              </div>
            </div>

            <div className="form-group">
              <label>Notas</label>
              <textarea className="form-control" rows={2} value={formEdit.notas || ""}
                onChange={e => handleChangeEdit("notas", e.target.value)} />
            </div>

            <div style={{ display:"flex", gap:"12px" }}>
              <button className="btn btn-outline" style={{ flex:1 }} onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button className="btn btn-success" style={{ flex:1, justifyContent:"center" }}
                disabled={guardandoEdit} onClick={handleGuardarEdit}>
                {guardandoEdit
                  ? <><div className="spinner" style={{ width:"16px",height:"16px",borderWidth:"2px" }}></div> Guardando...</>
                  : "💾 Guardar cambios"}
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
              onClick={() => setFiltro(f.key)}>{f.label}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", gap:"12px", flexWrap:"wrap", alignItems:"center" }}>
          {filtro === "mes" && (<>
            <select className="form-control" style={{ width:"auto" }}
              value={mesSelec} onChange={e => setMesSelec(parseInt(e.target.value))}>
              {meses.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
            <select className="form-control" style={{ width:"auto" }}
              value={añoSelec} onChange={e => setAñoSelec(parseInt(e.target.value))}>
              {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </>)}
          {filtro === "semana" && (<>
            <select className="form-control" style={{ width:"auto" }}
              value={semanaSelec} onChange={e => setSemanaSelec(parseInt(e.target.value))}>
              {semanas.map(s => <option key={s} value={s}>Semana {s}</option>)}
            </select>
            <select className="form-control" style={{ width:"auto" }}
              value={añoSelec} onChange={e => setAñoSelec(parseInt(e.target.value))}>
              {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </>)}
          {filtro === "año" && (
            <select className="form-control" style={{ width:"auto" }}
              value={añoSelec} onChange={e => setAñoSelec(parseInt(e.target.value))}>
              {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {filtro === "rango" && (<>
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
          </>)}
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
          <button className="btn btn-success" onClick={exportarExcel} style={{ flex:1, justifyContent:"center" }}>
            📊 Exportar Excel
          </button>
          <button className="btn btn-primary" onClick={exportarPDF} style={{ flex:1, justifyContent:"center" }}>
            📄 Exportar PDF
          </button>
        </div>
      )}

      {/* Tabla */}
      <div className="card">
        {sesionesFiltradas.length === 0 ? (
          <p style={{ textAlign:"center", color:"#999", padding:"32px" }}>No hay sesiones en este período</p>
        ) : (
          <div className="tabla-container">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Día</th><th>Tipo</th>
                  <th>Horario</th><th>Pausa</th><th>Horas</th>
                  <th>Importe</th><th>Acciones</th>
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
                      {s.pausa === "SI" && <span style={{ color:"#e65100" }}> / {s.horaInicio2}–{s.horaFin2}</span>}
                    </td>
                    <td>{s.pausa === "SI" ? "☕ Sí" : "—"}</td>
                    <td><strong>{formatH(parseFloat(s.horasTotal))}</strong></td>
                    <td><strong style={{ color:"#34a853" }}>{formatEur(parseFloat(s.precioTotal))}</strong></td>
                    <td>
                      <div style={{ display:"flex", gap:"6px" }}>
                        <button className="btn btn-outline" style={{ padding:"4px 10px", fontSize:"12px" }}
                          onClick={() => handleEditar(s)}>✏️</button>
                        <button className="btn btn-danger" style={{ padding:"4px 10px", fontSize:"12px" }}
                          onClick={() => setConfirmar(s)}>🗑️</button>
                      </div>
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