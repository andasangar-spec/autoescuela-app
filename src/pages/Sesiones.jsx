import React, { useEffect, useState } from "react";
import {
  getSesiones,
  eliminarFila,
  eliminarEventoCalendar,
  actualizarSesion,
  crearEventoCalendar,
  getTiposCurso,
  generarId,
  actualizarEventoCalendar // 🟢 CORREGIDO: Importación añadida
} from "../services/googleApi";
import { getWeek, getYear, parseISO, isWithinInterval, startOfDay, endOfDay, format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const generarHoras = () => {
  const h = [];
  for (let i = 5; i <= 22; i++)
    for (let m = 0; m < 60; m += 15)
      h.push(`${String(i).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  return h;
};
const HORAS = generarHoras();

const calcularMinutos = (inicio, fin) => {
  if (!inicio || !fin) return 0;
  const [h1, m1] = inicio.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
};

const calcularHoras = (inicio, fin) => calcularMinutos(inicio, fin) / 60;

const sumarMinutos = (hora, minutos) => {
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m + minutos;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function Sesiones() {
  const [sesiones, setSesiones]           = useState([]);
  const [tipos, setTipos]                 = useState([]);
  const [cargando, setCargando]           = useState(true);
  const [error, setError]                 = useState("");
  const [exito, setExito]                 = useState("");
  const [filtro, setFiltro]               = useState("mes");
  const [mesSelec, setMesSelec]           = useState(new Date().getMonth() + 1);
  const [semanaSelec, setSemanaSelec]     = useState(getWeek(new Date(), { weekStartsOn: 1 }));
  const [añoSelec, setAñoSelec]           = useState(new Date().getFullYear());
  const [fechaDesde, setFechaDesde]       = useState("");
  const [fechaHasta, setFechaHasta]       = useState("");
  const [eliminando, setEliminando]       = useState(null);
  const [confirmar, setConfirmar]         = useState(null);
  const [editando, setEditando]           = useState(null);
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [formEdit, setFormEdit]           = useState({});

  const meses   = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const semanas = Array.from({ length: 53 }, (_, i) => i + 1);

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setCargando(true); setError("");
    try {
      const [s, t] = await Promise.all([getSesiones(), getTiposCurso()]);
      setSesiones(s);
      setTipos(t);
    } catch (e) { 
      setError("Error al cargar sesiones"); 
    } finally { 
      setCargando(false); 
    }
  };

  const parsearFecha = (fechaStr) => {
    if (!fechaStr) return null;
    const p = fechaStr.split("/");
    if (p.length !== 3) return null;
    return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  };

  const sesionesFiltradas = sesiones.filter(s => {
    if (filtro === "mes")    return parseInt(s.mes) === mesSelec && parseInt(s.año) === añoSelec;
    if (filtro === "semana") {
      const f = parsearFecha(s.fecha);
      return f && getWeek(f, { weekStartsOn: 1 }) === semanaSelec && getYear(f) === añoSelec;
    }
    if (filtro === "rango") {
      if (!fechaDesde || !fechaHasta) return true;
      const f = parsearFecha(s.fecha);
      return f && isWithinInterval(startOfDay(f), {
        start: startOfDay(parseISO(fechaDesde)),
        end:   endOfDay(parseISO(fechaHasta)),
      });
    }
    return parseInt(s.año) === añoSelec;
  }).sort((a, b) => {
    const fa = parsearFecha(a.fecha), fb = parsearFecha(b.fecha);
    return (!fa || !fb) ? 0 : fb - fa;
  });

  const totalHoras   = sesionesFiltradas.reduce((acc, s) => acc + (parseFloat(s.horasTotal) || 0), 0);
  const totalImporte = sesionesFiltradas.reduce((acc, s) => acc + (parseFloat(s.precioTotal) || 0), 0);
  const formatEur    = n => `${n.toFixed(2).replace(".", ",")} €`;
  const formatH      = n => `${n.toFixed(2).replace(".", ",")} h`;

  const handleEditar = (sesion) => {
    const fechaObj = parsearFecha(sesion.fecha);
    const fechaISO = fechaObj ? format(fechaObj, "yyyy-MM-dd") : "";
    setFormEdit({
      _fila:           sesion._fila,
      id:              sesion.id,
      fechaISO,
      tipoCurso:       sesion.tipoCurso,
      horaInicio1:     sesion.horaInicio1  || "09:00",
      horaFin1:        sesion.horaFin1     || "10:00",
      hasPausa:        sesion.pausa === "SI",
      horaInicio2:     sesion.horaInicio2  || "14:00",
      horaFin2:        sesion.horaFin2     || "16:00",
      tipoPrecio:      sesion.tipoPrecio   || "clase",
      precioPorClase:  sesion.precioHora   || 15,
      precioFijo:      sesion.precioTotal  || 0,
      notas:           sesion.notas        || "",
      calendarEventId: sesion.calendarEventId || "",
    });
    setEditando(sesion);
  };

  const handleChangeEdit = (campo, valor) => {
    setFormEdit(f => {
      const nuevo = { ...f, [campo]: valor };
      if (campo === "horaInicio1") {
        const tipo = tipos.find(t => t.nombre === f.tipoCurso);
        if (tipo) nuevo.horaFin1 = sumarMinutos(valor, tipo.duracionMin);
      }
      if (campo === "tipoCurso") {
        const tipo = tipos.find(t => t.nombre === valor);
        if (tipo) {
          nuevo.tipoPrecio     = tipo.tipoPrecio === "total" ? "total" : "clase";
          nuevo.precioPorClase = tipo.precio;
          nuevo.horaFin1       = sumarMinutos(f.horaInicio1, tipo.duracionMin);
        }
      }
      return nuevo;
    });
  };

  // ── Cálculos Dinámicos Edición ───────────────────────────
  const tipoEdit        = tipos.find(t => t.nombre === formEdit.tipoCurso);
  const duracionEdit    = tipoEdit ? tipoEdit.duracionMin : 60;
  const minBrutoEdit    = calcularMinutos(formEdit.horaInicio1, formEdit.horaFin1);
  const minPausaEdit    = formEdit.hasPausa ? calcularMinutos(formEdit.horaInicio2, formEdit.horaFin2) : 0;
  const minNetosEdit    = Math.max(0, minBrutoEdit - minPausaEdit);
  const horasTotalEdit  = minNetosEdit / 60;
  const horasT1Edit     = formEdit.hasPausa ? calcularHoras(formEdit.horaInicio1, formEdit.horaInicio2) : horasTotalEdit;
  const horasT2Edit     = formEdit.hasPausa ? calcularHoras(formEdit.horaFin2, formEdit.horaFin1) : 0;
  const numClasesEdit   = duracionEdit > 0 ? Math.floor(minNetosEdit / duracionEdit) : 0;
  const precioTotalEdit = formEdit.tipoPrecio === "clase"
    ? numClasesEdit * parseFloat(formEdit.precioPorClase || 0)
    : formEdit.tipoPrecio === "total" ? parseFloat(formEdit.precioFijo || 0) : 0;

  // ── Guardar Edición ──────────────────────────────────────
  const handleGuardarEdit = async () => {
    setError(""); setExito("");
    setGuardandoEdit(true);
    try {
      const fechaObj   = new Date(formEdit.fechaISO + "T00:00:00");
      const diaSem     = diasSemana[fechaObj.getDay()];
      const semana     = getWeek(fechaObj, { weekStartsOn: 1 });
      const mes        = fechaObj.getMonth() + 1;
      const año        = fechaObj.getFullYear();
      const fechaFmt   = format(fechaObj, "dd/MM/yyyy");
      const colorCurso = tipoEdit?.colorCalendar || "#1a73e8";
      const descripcion = `${formEdit.tipoCurso} | ${numClasesEdit} clase(s) × ${duracionEdit}min | ${horasTotalEdit.toFixed(2)}h | ${precioTotalEdit.toFixed(2)}€`;

      const idsExistentes = (editando.calendarEventId || "")
        .split(",")
        .map(id => id.trim())
        .filter(Boolean);

      const horaFinT1 = formEdit.hasPausa ? formEdit.horaInicio2 : formEdit.horaFin1;
      let eventId1 = "";
      let eventId2 = "";

      // Tramo 1 del Calendario
      if (idsExistentes.length > 0 && idsExistentes[0]) {
        eventId1 = await actualizarEventoCalendar({
          eventId:    idsExistentes[0],
          tipoCurso:  formEdit.tipoCurso,
          fecha:      formEdit.fechaISO,
          horaInicio: formEdit.horaInicio1,
          horaFin:    horaFinT1,
          color:      colorCurso,
          descripcion,
        });
      } else {
        eventId1 = await crearEventoCalendar({
          tipoCurso:  formEdit.tipoCurso,
          fecha:      formEdit.fechaISO,
          horaInicio: formEdit.horaInicio1,
          horaFin:    horaFinT1,
          color:      colorCurso,
          descripcion,
        });
      }

      // Tramo 2 (Manejo de Pausas)
      if (formEdit.hasPausa && horasT2Edit > 0) {
        if (idsExistentes.length > 1 && idsExistentes[1]) {
          eventId2 = await actualizarEventoCalendar({
            eventId:    idsExistentes[1],
            tipoCurso:  formEdit.tipoCurso,
            fecha:      formEdit.fechaISO,
            horaInicio: formEdit.horaFin2,
            horaFin:    formEdit.horaFin1,
            color:      colorCurso,
            descripcion,
          });
        } else {
          eventId2 = await crearEventoCalendar({
            tipoCurso:  formEdit.tipoCurso,
            fecha:      formEdit.fechaISO,
            horaInicio: formEdit.horaFin2,
            horaFin:    formEdit.horaFin1,
            color:      colorCurso,
            descripcion,
          });
        }
      } else if (!formEdit.hasPausa && idsExistentes.length > 1 && idsExistentes[1]) {
        await eliminarEventoCalendar(idsExistentes[1]);
      }

      // Sincronizar cambios en base de datos/API externa
      await actualizarSesion({
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
        horasTramo1:     horasT1Edit.toFixed(2),
        horasTramo2:     horasT2Edit.toFixed(2),
        horasTotal:      horasTotalEdit.toFixed(2),
        tipoPrecio:      formEdit.tipoPrecio,
        precioHora:      parseFloat(formEdit.precioPorClase || 0),
        precioTotal:     precioTotalEdit.toFixed(2),
        calendarEventId: eventId1 + (eventId2 ? "," + eventId2 : ""),
        notas:           formEdit.notas || "",
      });

      setExito("✅ Sesión actualizada correctamente");
      setEditando(null);
      await cargarDatos();
    } catch (e) {
      setError("Error al actualizar: " + e.message);
    } finally {
      setGuardandoEdit(false);
    }
  };

  const handleEliminar = async (sesion) => {
    setEliminando(sesion.id); setError(""); setExito("");
    try {
      if (sesion.calendarEventId) {
        const ids = sesion.calendarEventId.split(",");
        for (const id of ids) await eliminarEventoCalendar(id.trim());
      }
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
    if (filtro === "mes")    return `${meses[mesSelec - 1]}_${añoSelec}`;
    if (filtro === "semana") return `Semana${semanaSelec}_${añoSelec}`;
    if (filtro === "rango")  return `${fechaDesde}_a_${fechaHasta}`;
    return `Año_${añoSelec}`;
  };

  const exportarExcel = () => {
    const datos = sesionesFiltradas.map(s => ({
      "Fecha": s.fecha, "Día": s.diaSemana, "Semana": s.semana,
      "Tipo curso": s.tipoCurso, "Inicio": s.horaInicio1, "Fin": s.horaFin1,
      "Pausa": s.pausa === "SI" ? `${s.horaInicio2}-${s.horaFin2}` : "No",
      "Horas": parseFloat(s.horasTotal), "Precio/clase": parseFloat(s.precioHora || 0),
      "Total (€)": parseFloat(s.precioTotal), "Notas": s.notas || "",
    }));
    datos.push({
      "Fecha": "TOTAL", "Día": "", "Semana": "", "Tipo curso": `${sesionesFiltradas.length} sesiones`,
      "Inicio": "", "Fin": "", "Pausa": "", "Horas": totalHoras, "Precio/clase": "", "Total (€)": totalImporte, "Notas": ""
    });
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sesiones");
    ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 20 }];
    XLSX.writeFile(wb, `Sesiones_${tituloPeriodo()}.xlsx`);
  };

  const exportarPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16); doc.setTextColor(21, 87, 176);
    doc.text("AutoescuelaApp — Registro de Sesiones", 14, 16);
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`Período: ${tituloPeriodo().replace(/_/g, " ")}`, 14, 23);
    doc.text(`Total: ${sesionesFiltradas.length} sesiones | ${formatH(totalHoras)} | ${formatEur(totalImporte)}`, 14, 29);
    autoTable(doc, {
      startY: 33,
      head: [["Fecha", "Día", "Tipo curso", "Horario", "Pausa", "Horas", "Importe"]],
      body: [
        ...sesionesFiltradas.map(s => [
          s.fecha, s.diaSemana, s.tipoCurso,
          `${s.horaInicio1}–${s.horaFin1}`,
          s.pausa === "SI" ? `${s.horaInicio2}–${s.horaFin2}` : "—",
          formatH(parseFloat(s.horasTotal)), formatEur(parseFloat(s.precioTotal)),
        ]),
        ["TOTAL", "", `${sesionesFiltradas.length} sesiones`, "", "", formatH(totalHoras), formatEur(totalImporte)],
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
    <div style={{ padding: "20px", fontFamily: "system-ui, sans-serif" }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "between", alignItems: "center", marginBottom: "20px" }}>
        <h1>📋 Mis sesiones</h1>
        <button className="btn btn-outline" onClick={cargarDatos}>🔄 Actualizar</button>
      </div>

      {error && <div className="alerta alerta-error" style={{ color: "red", padding: "10px", background: "#fde8e8", borderRadius: "8px", marginBottom: "15px" }}>{error}</div>}
      {exito && <div className="alerta alerta-success" style={{ color: "green", padding: "10px", background: "#eafaf1", borderRadius: "8px", marginBottom: "15px" }}>{exito}</div>}

      {/* ── Panel de Filtros ──────────────────────────────── */}
      <div style={{ display: "flex", gap: "15px", flexWrap: "wrap", background: "#f8f9fa", padding: "15px", borderRadius: "12px", marginBottom: "20px" }}>
        <div className="form-group">
          <label>Filtro:</label>
          <select className="form-control" value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="mes">Mes</option>
            <option value="semana">Semana</option>
            <option value="rango">Rango</option>
            <option value="año">Año</option>
          </select>
        </div>
        {filtro === "mes" && (
          <>
            <select className="form-control" value={mesSelec} onChange={e => setMesSelec(Number(e.target.value))}>
              {meses.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <input type="number" className="form-control" value={añoSelec} onChange={e => setAñoSelec(Number(e.target.value))} />
          </>
        )}
        {filtro === "semana" && (
          <>
            <select className="form-control" value={semanaSelec} onChange={e => setSemanaSelec(Number(e.target.value))}>
              {semanas.map(s => <option key={s} value={s}>Semana {s}</option>)}
            </select>
            <input type="number" className="form-control" value={añoSelec} onChange={e => setAñoSelec(Number(e.target.value))} />
          </>
        )}
        {filtro === "rango" && (
          <>
            <input type="date" className="form-control" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
            <input type="date" className="form-control" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
          </>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
          <button className="btn btn-outline" onClick={exportarExcel}>📊 Excel</button>
          <button className="btn btn-outline" onClick={exportarPDF}>📄 PDF</button>
        </div>
      </div>

      {/* ── Lista de Sesiones ─────────────────────────────── */}
      <div style={{ overflowX: "auto", background: "white", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f3f4", borderBottom: "2px solid #ddd", textAlign: "left" }}>
              <th style={{ padding: "12px" }}>Fecha</th>
              <th style={{ padding: "12px" }}>Curso</th>
              <th style={{ padding: "12px" }}>Horario</th>
              <th style={{ padding: "12px" }}>Pausa</th>
              <th style={{ padding: "12px" }}>Horas</th>
              <th style={{ padding: "12px" }}>Importe</th>
              <th style={{ padding: "12px" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sesionesFiltradas.map(s => (
              <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "12px" }}>{s.fecha} ({s.diaSemana.substring(0,2)})</td>
                <td style={{ padding: "12px" }}>{s.tipoCurso}</td>
                <td style={{ padding: "12px" }}>{s.horaInicio1} - {s.horaFin1}</td>
                <td style={{ padding: "12px" }}>{s.pausa === "SI" ? `${s.horaInicio2}-${s.horaFin2}` : "No"}</td>
                <td style={{ padding: "12px" }}>{formatH(parseFloat(s.horasTotal))}</td>
                <td style={{ padding: "12px" }}>{formatEur(parseFloat(s.precioTotal))}</td>
                <td style={{ padding: "12px" }}>
                  <button onClick={() => handleEditar(s)} style={{ marginRight: "8px", background: "none", border: "none", cursor: "pointer" }}>✏️</button>
                  <button onClick={() => setConfirmar(s)} style={{ background: "none", border: "none", cursor: "pointer" }}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal Confirmar Eliminar ─────────────────────── */}
      {confirmar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyValue: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "white", borderRadius: "16px", padding: "28px", maxWidth: "360px", width: "90%", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>🗑️</div>
            <h3>¿Eliminar sesión?</h3>
            <p style={{ color: "#666", fontSize: "14px", marginBottom: "20px" }}>
              <strong>{confirmar.fecha}</strong> — {confirmar.tipoCurso}<br />
              Se removerá de la hoja de cálculo y de Google Calendar.
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setConfirmar(null)}>Cancelar</button>
              <button className="btn btn-danger" style={{ flex: 1, color: "white", background: "#d93025", border: "none", borderRadius: "8px" }}
                disabled={eliminando === confirmar.id} onClick={() => handleEliminar(confirmar)}>
                {eliminando === confirmar.id ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Editar Sesión (🟢 COMPLETADO) ──────────── */}
      {editando && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "white", borderRadius: "16px", padding: "24px", maxWidth: "500px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ marginBottom: "20px", color: "#1557b0" }}>✏️ Editar sesión</h3>
            
            <div style={{ display: "flex", gap: "15px", marginBottom: "15px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: "5px" }}>Fecha</label>
                <input type="date" style={{ width: "100%", padding: "8px" }} value={formEdit.fechaISO} onChange={e => handleChangeEdit("fechaISO", e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: "5px" }}>Tipo de Curso</label>
                <select style={{ width: "100%", padding: "8px" }} value={formEdit.tipoCurso} onChange={e => handleChangeEdit("tipoCurso", e.target.value)}>
                  {tipos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: "15px", marginBottom: "15px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: "5px" }}>Hora Inicio</label>
                <select style={{ width: "100%", padding: "8px" }} value={formEdit.horaInicio1} onChange={e => handleChangeEdit("horaInicio1", e.target.value)}>
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: "5px" }}>Hora Fin</label>
                <select style={{ width: "100%", padding: "8px" }} value={formEdit.horaFin1} onChange={e => handleChangeEdit("horaFin1", e.target.value)}>
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input type="checkbox" checked={formEdit.hasPausa} onChange={e => handleChangeEdit("hasPausa", e.target.checked)} />
                ¿Tiene Pausa / Descanso?
              </label>
            </div>

            {formEdit.hasPausa && (
              <div style={{ display: "flex", gap: "15px", marginBottom: "15px", background: "#f1f3f4", padding: "10px", borderRadius: "8px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: "5px" }}>Inicio Pausa</label>
                  <select style={{ width: "100%", padding: "8px" }} value={formEdit.horaInicio2} onChange={e => handleChangeEdit("horaInicio2", e.target.value)}>
                    {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: "5px" }}>Fin Pausa</label>
                  <select style={{ width: "100%", padding: "8px" }} value={formEdit.horaFin2} onChange={e => handleChangeEdit("horaFin2", e.target.value)}>
                    {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px" }}>Notas</label>
              <textarea style={{ width: "100%", padding: "8px" }} rows="3" value={formEdit.notas} onChange={e => handleChangeEdit("notas", e.target.value)} />
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 1, background: "#1557b0", color: "white", border: "none", borderRadius: "8px" }}
                disabled={guardandoEdit} onClick={handleGuardarEdit}>
                {guardandoEdit ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
