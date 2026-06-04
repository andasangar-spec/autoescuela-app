import React, { useEffect, useState } from "react";
import { getSesiones, getPagos, guardarPago, generarId } from "../services/googleApi";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay, isValid } from "date-fns";

// Convierte número serial de Sheets a fecha legible
const formatearFecha = (valor) => {
  if (!valor) return "—";
  if (typeof valor === "string" && valor.includes("/")) return valor;
  if (!isNaN(valor)) {
    const fecha = new Date((parseFloat(valor) - 25569) * 86400 * 1000);
    if (isValid(fecha)) return format(fecha, "dd/MM/yyyy");
  }
  return valor;
};

// Parsear fecha dd/MM/yyyy a Date
const parsearFecha = (fechaStr) => {
  if (!fechaStr) return null;
  const partes = fechaStr.split("/");
  if (partes.length !== 3) return null;
  return new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
};

function Contabilidad() {
  const [sesiones, setSesiones]   = useState([]);
  const [pagos, setPagos]         = useState([]);
  const [cargando, setCargando]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState("");
  const [exito, setExito]         = useState("");
  const [filtro, setFiltro]       = useState("año");
  const [añoSelec, setAñoSelec]   = useState(new Date().getFullYear());
  const [mesSelec, setMesSelec]   = useState(new Date().getMonth() + 1);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const [formPago, setFormPago] = useState({
    fecha:    format(new Date(), "yyyy-MM-dd"),
    importe:  "",
    concepto: "",
    notas:    "",
  });

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [s, p] = await Promise.all([getSesiones(), getPagos()]);
      setSesiones(s);
      setPagos(p);
    } catch (e) {
      setError("Error al cargar datos");
    } finally {
      setCargando(false);
    }
  };

  // ── Aplicar filtro ───────────────────────────────────────
  const aplicarFiltro = (lista) => lista.filter(x => {
    if (filtro === "año") {
      return parseInt(x.año) === añoSelec;
    }
    if (filtro === "mes") {
      return parseInt(x.mes) === mesSelec && parseInt(x.año) === añoSelec;
    }
    if (filtro === "rango") {
      if (!fechaDesde || !fechaHasta) return true;
      const fecha = parsearFecha(formatearFecha(x.fecha));
      if (!fecha) return false;
      return isWithinInterval(startOfDay(fecha), {
        start: startOfDay(parseISO(fechaDesde)),
        end:   endOfDay(parseISO(fechaHasta)),
      });
    }
    return true;
  });

  const sesionesFiltradas = aplicarFiltro(sesiones);
  const pagosFiltrados    = aplicarFiltro(pagos);

  const totalGenerado  = sesionesFiltradas.reduce((acc, s) => acc + (parseFloat(s.precioTotal) || 0), 0);
  const totalCobrado   = pagosFiltrados.reduce((acc, p) => acc + (parseFloat(p.importe) || 0), 0);
  const totalPendiente = totalGenerado - totalCobrado;

  const formatEur = n => `${parseFloat(n).toFixed(2).replace(".", ",")} €`;

  const handleGuardarPago = async () => {
    setError(""); setExito("");
    if (!formPago.importe || parseFloat(formPago.importe) <= 0)
      return setError("Introduce un importe válido");
    if (!formPago.concepto)
      return setError("Introduce un concepto para el pago");

    setGuardando(true);
    try {
      const fecha = new Date(formPago.fecha);
      await guardarPago({
        id:       generarId("P"),
        fecha:    format(fecha, "dd/MM/yyyy"),
        mes:      fecha.getMonth() + 1,
        año:      fecha.getFullYear(),
        importe:  parseFloat(formPago.importe),
        concepto: formPago.concepto,
        notas:    formPago.notas,
      });
      setExito("✅ Pago registrado correctamente");
      setFormPago({ fecha: format(new Date(), "yyyy-MM-dd"), importe: "", concepto: "", notas: "" });
      await cargarDatos();
    } catch (e) {
      setError("Error al guardar el pago: " + e.message);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <div className="loading"><div className="spinner"></div> Cargando...</div>;

  const pagosOrdenados = pagosFiltrados.sort((a, b) => {
    const fa = parsearFecha(formatearFecha(a.fecha));
    const fb = parsearFecha(formatearFecha(b.fecha));
    if (!fa || !fb) return 0;
    return fb - fa;
  });

  return (
    <div>
      <div className="page-header">
        <h1>💰 Contabilidad</h1>
        <button className="btn btn-outline" onClick={cargarDatos}>🔄 Actualizar</button>
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}
      {exito && <div className="alerta alerta-success">{exito}</div>}

      {/* ── Filtros ─────────────────────────────────────── */}
      <div className="card">
        <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", marginBottom:"16px" }}>
          {[
            { key:"año",   label:"Año completo" },
            { key:"mes",   label:"Por mes" },
            { key:"rango", label:"📅 Rango de fechas" },
          ].map(f => (
            <button
              key={f.key}
              className={`btn ${filtro === f.key ? "btn-primary" : "btn-outline"}`}
              onClick={() => setFiltro(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ display:"flex", gap:"12px", flexWrap:"wrap", alignItems:"center" }}>
          {filtro === "año" && (
            <select className="form-control" style={{ width:"auto" }}
              value={añoSelec} onChange={e => setAñoSelec(parseInt(e.target.value))}>
              {[2024,2025,2026,2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}

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

      {/* ── Resumen ─────────────────────────────────────── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-valor">{formatEur(totalGenerado)}</div>
          <div className="stat-label">Total generado</div>
        </div>
        <div className="stat-card verde">
          <div className="stat-icon">✅</div>
          <div className="stat-valor">{formatEur(totalCobrado)}</div>
          <div className="stat-label">Total cobrado</div>
        </div>
        <div className="stat-card rojo">
          <div className="stat-icon">⏳</div>
          <div className="stat-valor">{formatEur(totalPendiente)}</div>
          <div className="stat-label">Total pendiente</div>
        </div>
      </div>

      {/* ── Barra progreso ──────────────────────────────── */}
      <div className="card">
        <div className="card-title">📊 Progreso de cobro</div>
        <div style={{ marginBottom:"8px", display:"flex", justifyContent:"space-between", fontSize:"13px", color:"#666" }}>
          <span>Cobrado: {formatEur(totalCobrado)}</span>
          <span>{totalGenerado > 0 ? Math.round((totalCobrado/totalGenerado)*100) : 0}%</span>
        </div>
        <div style={{ background:"#e0e0e0", borderRadius:"8px", height:"16px", overflow:"hidden" }}>
          <div style={{
            background:"linear-gradient(90deg,#34a853,#1e7e34)",
            height:"100%",
            width:`${totalGenerado > 0 ? Math.min(100,(totalCobrado/totalGenerado)*100) : 0}%`,
            borderRadius:"8px",
            transition:"width 0.5s ease",
          }} />
        </div>
        <div style={{ marginTop:"8px", fontSize:"13px", color:"#ea4335" }}>
          Pendiente: {formatEur(totalPendiente)}
        </div>
      </div>

      {/* ── Registrar pago ──────────────────────────────── */}
      <div className="card">
        <div className="card-title">💵 Registrar nuevo pago</div>
        <div className="form-row">
          <div className="form-group">
            <label>Fecha del pago</label>
            <input type="date" className="form-control" value={formPago.fecha}
              onChange={e => setFormPago(f => ({ ...f, fecha: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Importe (€)</label>
            <input type="number" className="form-control" placeholder="0.00"
              value={formPago.importe}
              onChange={e => setFormPago(f => ({ ...f, importe: e.target.value }))}
              min="0" step="0.01" />
          </div>
        </div>
        <div className="form-group">
          <label>Concepto</label>
          <input type="text" className="form-control" placeholder="Ej: Pago mayo 2026..."
            value={formPago.concepto}
            onChange={e => setFormPago(f => ({ ...f, concepto: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Notas (opcional)</label>
          <input type="text" className="form-control" placeholder="Observaciones..."
            value={formPago.notas}
            onChange={e => setFormPago(f => ({ ...f, notas: e.target.value }))} />
        </div>
        <button className="btn btn-success" onClick={handleGuardarPago} disabled={guardando}
          style={{ width:"100%", justifyContent:"center", padding:"14px" }}>
          {guardando
            ? <><div className="spinner" style={{ width:"18px",height:"18px",borderWidth:"2px" }}></div> Guardando...</>
            : "💾 Registrar pago"}
        </button>
      </div>

      {/* ── Historial de pagos ───────────────────────────── */}
      <div className="card">
        <div className="card-title">🧾 Historial de pagos</div>
        {pagosOrdenados.length === 0 ? (
          <p style={{ textAlign:"center", color:"#999", padding:"24px" }}>
            No hay pagos en este período
          </p>
        ) : (
          <div className="tabla-container">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Concepto</th><th>Importe</th><th>Notas</th></tr>
              </thead>
              <tbody>
                {pagosOrdenados.map((p, i) => (
                  <tr key={i}>
                    <td>{formatearFecha(p.fecha)}</td>
                    <td>{p.concepto}</td>
                    <td><strong style={{ color:"#34a853" }}>{formatEur(p.importe)}</strong></td>
                    <td style={{ fontSize:"13px", color:"#666" }}>{p.notas || "—"}</td>
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

export default Contabilidad;