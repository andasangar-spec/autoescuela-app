import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSesiones, getPagos, guardarPago, actualizarPago, eliminarFila, generarId } from "../services/googleApi";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay, isValid } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const formatearFecha = (valor) => {
  if (!valor) return "—";
  if (typeof valor === "string" && valor.includes("/")) return valor;
  if (!isNaN(valor)) {
    const fecha = new Date((parseFloat(valor) - 25569) * 86400 * 1000);
    if (isValid(fecha)) return format(fecha, "dd/MM/yyyy");
  }
  return valor;
};

const parsearFecha = (fechaStr) => {
  if (!fechaStr) return null;
  const str = typeof fechaStr === "string" && !fechaStr.includes("/") ? formatearFecha(fechaStr) : fechaStr;
  const p = str.split("/");
  if (p.length !== 3) return null;
  return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
};

function Contabilidad() {
  const navigate = useNavigate();
  const [sesiones, setSesiones]         = useState([]);
  const [pagos, setPagos]               = useState([]);
  const [cargando, setCargando]         = useState(true);
  const [guardando, setGuardando]       = useState(false);
  const [error, setError]               = useState("");
  const [exito, setExito]               = useState("");
  const [filtro, setFiltro]             = useState("año");
  const [añoSelec, setAñoSelec]         = useState(new Date().getFullYear());
  const [mesSelec, setMesSelec]         = useState(new Date().getMonth() + 1);
  const [fechaDesde, setFechaDesde]     = useState("");
  const [fechaHasta, setFechaHasta]     = useState("");
  const [confirmar, setConfirmar]       = useState(null);
  const [eliminando, setEliminando]     = useState(null);
  const [editandoPago, setEditandoPago] = useState(null);
  const [formEdit, setFormEdit]         = useState({});

  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const años  = [2024, 2025, 2026, 2027, 2028];

  const [formPago, setFormPago] = useState({
    fecha: format(new Date(), "yyyy-MM-dd"), importe: "", concepto: "", notas: "",
  });

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [s, p] = await Promise.all([getSesiones(), getPagos()]);
      setSesiones(s); setPagos(p);
    } catch (e) { setError("Error al cargar datos"); }
    finally { setCargando(false); }
  };

  const aplicarFiltro = (lista) => lista.filter(x => {
    if (filtro === "año") return parseInt(x.año) === añoSelec;
    if (filtro === "mes") return parseInt(x.mes) === mesSelec && parseInt(x.año) === añoSelec;
    if (filtro === "rango") {
      if (!fechaDesde || !fechaHasta) return true;
      const fecha = parsearFecha(x.fecha);
      if (!fecha) return false;
      return isWithinInterval(startOfDay(fecha), {
        start: startOfDay(parseISO(fechaDesde)), end: endOfDay(parseISO(fechaHasta)),
      });
    }
    return true;
  });

  const sesionesAño   = sesiones.filter(x => parseInt(x.año) === añoSelec);
  const pagosAñoTotal = pagos.filter(x => parseInt(x.año) === añoSelec);
  const totalGenerado  = sesionesAño.reduce((acc, s) => acc + (parseFloat(s.precioTotal) || 0), 0);
  const totalCobrado   = pagosAñoTotal.reduce((acc, p) => acc + (parseFloat(p.importe) || 0), 0);
  const totalPendiente = totalGenerado - totalCobrado;

  const pagosFiltrados = aplicarFiltro(pagos).sort((a, b) => {
    const fa = parsearFecha(formatearFecha(a.fecha));
    const fb = parsearFecha(formatearFecha(b.fecha));
    return (!fa || !fb) ? 0 : fb - fa;
  });

  const totalPagosFiltrados = pagosFiltrados.reduce((acc, p) => acc + (parseFloat(p.importe) || 0), 0);
  const formatEur = n => `${parseFloat(n).toFixed(2).replace(".", ",")} €`;

  const tituloPeriodo = () => {
    if (filtro === "año")   return `Año_${añoSelec}`;
    if (filtro === "mes")   return `${meses[mesSelec-1]}_${añoSelec}`;
    if (filtro === "rango") return `${fechaDesde}_${fechaHasta}`;
    return `Contabilidad_${añoSelec}`;
  };

  // ── Exportar Excel ───────────────────────────────────────
  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();
    const resumen = [
      ["AUTOESCUELAAPP — RESUMEN CONTABILIDAD"],
      [`Año: ${añoSelec}`], [],
      ["RESUMEN ANUAL", ""],
      ["Total generado", totalGenerado],
      ["Total cobrado", totalCobrado],
      ["Total pendiente", totalPendiente], [],
      [`HISTORIAL DE PAGOS — ${tituloPeriodo().replace(/_/g, " ")}`, ""],
      ["Fecha", "Concepto", "Importe (€)", "Notas"],
      ...pagosFiltrados.map(p => [formatearFecha(p.fecha), p.concepto, parseFloat(p.importe), p.notas || ""]),
      [], ["TOTAL PAGOS PERIODO", "", totalPagosFiltrados, ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(resumen);
    ws["!cols"] = [{ wch: 20 }, { wch: 35 }, { wch: 15 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws, "Contabilidad");
    XLSX.writeFile(wb, `Contabilidad_${tituloPeriodo()}.xlsx`);
  };

  // ── Exportar PDF ─────────────────────────────────────────
  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.setTextColor(21, 87, 176);
    doc.text("AutoescuelaApp — Contabilidad", 14, 18);
    doc.setFontSize(11); doc.setTextColor(100);
    doc.text(`Período: ${tituloPeriodo().replace(/_/g, " ")}`, 14, 27);
    doc.setFontSize(12); doc.setTextColor(21, 87, 176);
    doc.text(`Resumen año ${añoSelec}`, 14, 38);

    autoTable(doc, {
      startY: 42,
      head: [["Concepto", "Importe"]],
      body: [
        ["Total generado",  formatEur(totalGenerado)],
        ["Total cobrado",   formatEur(totalCobrado)],
        ["Total pendiente", formatEur(totalPendiente)],
      ],
      headStyles:  { fillColor: [21, 87, 176], fontStyle: "bold" },
      bodyStyles:  { fontSize: 11 },
      columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 60, halign: "right" } },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === 2) { data.cell.styles.textColor = [234, 67, 53]; data.cell.styles.fontStyle = "bold"; }
        if (data.section === "body" && data.row.index === 1) { data.cell.styles.textColor = [52, 168, 83]; data.cell.styles.fontStyle = "bold"; }
      },
    });

    const pct = totalGenerado > 0 ? Math.round((totalCobrado / totalGenerado) * 100) : 0;
    const afterResumen = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`Progreso de cobro: ${pct}% cobrado`, 14, afterResumen);
    doc.setFontSize(12); doc.setTextColor(21, 87, 176);
    doc.text(`Historial de pagos — ${tituloPeriodo().replace(/_/g, " ")}`, 14, afterResumen + 10);

    autoTable(doc, {
      startY: afterResumen + 14,
      head: [["Fecha", "Concepto", "Importe", "Notas"]],
      body: [
        ...pagosFiltrados.map(p => [formatearFecha(p.fecha), p.concepto, formatEur(p.importe), p.notas || "—"]),
        ["TOTAL", "", formatEur(totalPagosFiltrados), ""],
      ],
      headStyles: { fillColor: [21, 87, 176], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      styles: { fontSize: 10 },
      columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 80 }, 2: { cellWidth: 30, halign: "right" }, 3: { cellWidth: 45 } },
      didParseCell: (data) => {
        if (data.row.index === pagosFiltrados.length) { data.cell.styles.fillColor = [232, 240, 254]; data.cell.styles.fontStyle = "bold"; }
      },
    });

    doc.save(`Contabilidad_${tituloPeriodo()}.pdf`);
  };

  // ── Nuevo pago ───────────────────────────────────────────
  const handleGuardarPago = async () => {
    setError(""); setExito("");
    if (!formPago.importe || parseFloat(formPago.importe) <= 0) return setError("Introduce un importe válido");
    if (!formPago.concepto) return setError("Introduce un concepto para el pago");
    setGuardando(true);
    try {
      const fecha = new Date(formPago.fecha);
      await guardarPago({
        id: generarId("P"), fecha: format(fecha, "dd/MM/yyyy"),
        mes: fecha.getMonth() + 1, año: fecha.getFullYear(),
        importe: parseFloat(formPago.importe), concepto: formPago.concepto, notas: formPago.notas,
      });
      setExito("✅ Pago registrado correctamente");
      setFormPago({ fecha: format(new Date(), "yyyy-MM-dd"), importe: "", concepto: "", notas: "" });
      await cargarDatos();
    } catch (e) { setError("Error al guardar el pago: " + e.message); }
    finally { setGuardando(false); }
  };

  const handleEditarPago = (pago) => {
    const fechaStr = formatearFecha(pago.fecha);
    const fechaObj = parsearFecha(fechaStr);
    const fechaISO = fechaObj ? format(fechaObj, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    setFormEdit({ _fila: pago._fila, id: pago.id, fechaISO, importe: pago.importe, concepto: pago.concepto, notas: pago.notas || "" });
    setEditandoPago(pago);
  };

  const handleGuardarEdit = async () => {
    setError(""); setExito("");
    if (!formEdit.importe || parseFloat(formEdit.importe) <= 0) return setError("Introduce un importe válido");
    if (!formEdit.concepto) return setError("Introduce un concepto");
    setGuardando(true);
    try {
      const fecha = new Date(formEdit.fechaISO);
      await actualizarPago({
        _fila: formEdit._fila, id: formEdit.id, fecha: format(fecha, "dd/MM/yyyy"),
        mes: fecha.getMonth() + 1, año: fecha.getFullYear(),
        importe: parseFloat(formEdit.importe), concepto: formEdit.concepto, notas: formEdit.notas || "",
      });
      setExito("✅ Pago actualizado correctamente");
      setEditandoPago(null);
      await cargarDatos();
    } catch (e) { setError("Error al actualizar: " + e.message); }
    finally { setGuardando(false); }
  };

  const handleEliminarPago = async (pago) => {
    setEliminando(pago.id); setError(""); setExito("");
    try {
      await eliminarFila("PAGOS", pago._fila - 1);
      setExito("✅ Pago eliminado correctamente");
      setConfirmar(null);
      await cargarDatos();
    } catch (e) { setError("Error al eliminar: " + e.message); }
    finally { setEliminando(null); }
  };

  if (cargando) return <>
    <div className="inner-bar">
      <button className="back-btn" onClick={() => navigate("/")}>
        <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      </button>
      <span className="inner-bar-title">Contabilidad</span>
    </div>
    <div className="loading"><div className="spinner"></div> Cargando...</div>
  </>;

  return (
    <>
      {/* Barra superior */}
      <div className="inner-bar">
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <span className="inner-bar-title">Contabilidad</span>
        <button className="inner-bar-action" onClick={cargarDatos}>🔄</button>
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}
      {exito && <div className="alerta alerta-success">{exito}</div>}

      {/* Modal confirmar eliminar */}
      {confirmar && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-icon">🗑️</div>
            <div className="modal-title">¿Eliminar pago?</div>
            <div className="modal-body">
              <strong>{formatearFecha(confirmar.fecha)}</strong> — {confirmar.concepto}<br/>
              <strong>{formatEur(confirmar.importe)}</strong>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setConfirmar(null)}>Cancelar</button>
              <button className="btn btn-danger" style={{ flex: 1 }} disabled={eliminando === confirmar.id} onClick={() => handleEliminarPago(confirmar)}>
                {eliminando === confirmar.id ? <><div className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }}></div> Eliminando...</> : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar pago */}
      {editandoPago && (
        <div className="modal-overlay" style={{ alignItems: "flex-start", overflowY: "auto", padding: "20px" }}>
          <div className="modal-box" style={{ textAlign: "left", maxWidth: "420px", padding: "24px" }}>
            <h3 style={{ marginBottom: "20px", color: "var(--b600)", fontSize: "15px", fontWeight: "700" }}>✏️ Editar pago</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Fecha</label>
                <input type="date" className="form-control" value={formEdit.fechaISO} onChange={e => setFormEdit(f => ({ ...f, fechaISO: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Importe (€)</label>
                <input type="number" className="form-control" value={formEdit.importe} onChange={e => setFormEdit(f => ({ ...f, importe: e.target.value }))} min="0" step="0.01" />
              </div>
            </div>
            <div className="form-group">
              <label>Concepto</label>
              <input type="text" className="form-control" value={formEdit.concepto} onChange={e => setFormEdit(f => ({ ...f, concepto: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Notas (opcional)</label>
              <input type="text" className="form-control" value={formEdit.notas} onChange={e => setFormEdit(f => ({ ...f, notas: e.target.value }))} />
            </div>
            <div className="modal-actions" style={{ marginTop: "16px" }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setEditandoPago(null)}>Cancelar</button>
              <button className="btn btn-success" style={{ flex: 1 }} disabled={guardando} onClick={handleGuardarEdit}>
                {guardando ? <><div className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }}></div> Guardando...</> : "💾 Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selector de año + resumen anual */}
      <div className="card">
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
          <span style={{ fontWeight: "600", fontSize: "14px", color: "var(--g600)" }}>Año:</span>
          <select className="form-control" style={{ width: "auto" }} value={añoSelec} onChange={e => setAñoSelec(parseInt(e.target.value))}>
            {años.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--g600)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          📆 Resumen año {añoSelec}
        </div>

        <div className="totals-row">
          <div className="total-card"><div className="total-label">Total generado</div><div className="total-value">{formatEur(totalGenerado)}</div></div>
          <div className="total-card"><div className="total-label">Total cobrado</div><div className="total-value verde">{formatEur(totalCobrado)}</div></div>
          <div className="total-card"><div className="total-label">Pendiente</div><div className="total-value" style={{ color: "var(--rojo)" }}>{formatEur(totalPendiente)}</div></div>
        </div>

        {/* Barra de progreso */}
        <div style={{ marginTop: "14px" }}>
          <div style={{ marginBottom: "6px", display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--g600)" }}>
            <span>Cobrado: {formatEur(totalCobrado)}</span>
            <span>{totalGenerado > 0 ? Math.round((totalCobrado / totalGenerado) * 100) : 0}%</span>
          </div>
          <div style={{ background: "var(--g200)", borderRadius: "8px", height: "14px", overflow: "hidden" }}>
            <div style={{
              background: "linear-gradient(90deg, var(--verde), #1e7e34)", height: "100%",
              width: `${totalGenerado > 0 ? Math.min(100, (totalCobrado / totalGenerado) * 100) : 0}%`,
              borderRadius: "8px", transition: "width 0.5s ease",
            }} />
          </div>
        </div>
      </div>

      {/* Registrar nuevo pago */}
      <div className="card">
        <div className="card-title">💵 Registrar nuevo pago</div>
        <div className="form-row">
          <div className="form-group">
            <label>Fecha del pago</label>
            <input type="date" className="form-control" value={formPago.fecha} onChange={e => setFormPago(f => ({ ...f, fecha: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Importe (€)</label>
            <input type="number" className="form-control" placeholder="0.00" value={formPago.importe} onChange={e => setFormPago(f => ({ ...f, importe: e.target.value }))} min="0" step="0.01" />
          </div>
        </div>
        <div className="form-group">
          <label>Concepto</label>
          <input type="text" className="form-control" placeholder="Ej: Pago junio 2026..." value={formPago.concepto} onChange={e => setFormPago(f => ({ ...f, concepto: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Notas (opcional)</label>
          <input type="text" className="form-control" placeholder="Observaciones..." value={formPago.notas} onChange={e => setFormPago(f => ({ ...f, notas: e.target.value }))} />
        </div>
        <button className="btn btn-success" onClick={handleGuardarPago} disabled={guardando} style={{ width: "100%", justifyContent: "center", padding: "14px" }}>
          {guardando ? <><div className="spinner" style={{ width: "18px", height: "18px", borderWidth: "2px" }}></div> Guardando...</> : "💾 Registrar pago"}
        </button>
      </div>

      {/* Historial con filtros y exportación */}
      <div className="card">
        <div className="card-title">🧾 Historial de pagos</div>

        <div className="filter-tabs">
          {[{ key: "año", label: "Año" }, { key: "mes", label: "Por mes" }, { key: "rango", label: "Rango" }].map(f => (
            <button key={f.key} className={`filter-tab ${filtro === f.key ? "active" : ""}`} onClick={() => setFiltro(f.key)}>{f.label}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "16px" }}>
          {filtro === "mes" && (<>
            <select className="form-control" style={{ width: "auto" }} value={mesSelec} onChange={e => setMesSelec(parseInt(e.target.value))}>
              {meses.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select className="form-control" style={{ width: "80px" }} value={añoSelec} onChange={e => setAñoSelec(parseInt(e.target.value))}>
              {años.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </>)}
          {filtro === "rango" && (<>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--g600)" }}>Desde:</span>
              <input type="date" className="form-control" style={{ width: "auto" }} value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--g600)" }}>Hasta:</span>
              <input type="date" className="form-control" style={{ width: "auto" }} value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
            </div>
          </>)}
        </div>

        {/* Total del período filtrado */}
        <div className="totals-row" style={{ marginBottom: "16px" }}>
          <div className="total-card"><div className="total-label">Pagos</div><div className="total-value">{pagosFiltrados.length}</div></div>
          <div className="total-card"><div className="total-label">Total período</div><div className="total-value verde">{formatEur(totalPagosFiltrados)}</div></div>
        </div>

        {/* Exportar */}
        {pagosFiltrados.length > 0 && (
          <div className="export-row">
            <button className="export-btn xl" onClick={exportarExcel}>📊 Exportar Excel</button>
            <button className="export-btn pdf" onClick={exportarPDF}>📄 Exportar PDF</button>
          </div>
        )}

        {pagosFiltrados.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--g400)", padding: "24px" }}>No hay pagos en este período</p>
        ) : (
          <div className="tabla-container">
            <table>
              <thead><tr><th>Fecha</th><th>Concepto</th><th>Importe</th><th>Notas</th><th>Acciones</th></tr></thead>
              <tbody>
                {pagosFiltrados.map((p, i) => (
                  <tr key={i}>
                    <td>{formatearFecha(p.fecha)}</td>
                    <td>{p.concepto}</td>
                    <td><strong style={{ color: "var(--verde)" }}>{formatEur(p.importe)}</strong></td>
                    <td style={{ fontSize: "13px", color: "var(--g600)" }}>{p.notas || "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: "5px" }}>
                        <button className="action-btn edit" onClick={() => handleEditarPago(p)}>
                          <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        </button>
                        <button className="action-btn del" onClick={() => setConfirmar(p)}>
                          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        </button>
                      </div>
                    </td>
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

export default Contabilidad;
