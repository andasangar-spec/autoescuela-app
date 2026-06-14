import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSesiones, getPagos, guardarPago, actualizarPago, eliminarFila, generarId } from "../services/googleApi";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay, isValid } from "date-fns";

const formatearFecha = (valor) => {
  if (!valor) return "—";
  if (typeof valor === "string" && valor.includes("/")) return valor;
  if (!isNaN(valor)) { const fecha = new Date((parseFloat(valor) - 25569) * 86400 * 1000); if (isValid(fecha)) return format(fecha, "dd/MM/yyyy"); }
  return valor;
};

const parsearFecha = (fechaStr) => {
  if (!fechaStr) return null;
  const str = typeof fechaStr === "string" && !fechaStr.includes("/") ? formatearFecha(fechaStr) : fechaStr;
  const partes = str.split("/");
  if (partes.length !== 3) return null;
  return new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
};

function Contabilidad() {
  const navigate                            = useNavigate();
  const [sesiones, setSesiones]             = useState([]);
  const [pagos, setPagos]                   = useState([]);
  const [cargando, setCargando]             = useState(true);
  const [guardando, setGuardando]           = useState(false);
  const [error, setError]                   = useState("");
  const [exito, setExito]                   = useState("");
  const [filtro, setFiltro]                 = useState("año");
  const [añoSelec, setAñoSelec]             = useState(new Date().getFullYear());
  const [mesSelec, setMesSelec]             = useState(new Date().getMonth() + 1);
  const [fechaDesde, setFechaDesde]         = useState("");
  const [fechaHasta, setFechaHasta]         = useState("");
  const [confirmar, setConfirmar]           = useState(null);
  const [eliminando, setEliminando]         = useState(null);
  const [editandoPago, setEditandoPago]     = useState(null);
  const [formEdit, setFormEdit]             = useState({});

  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const años  = [2024,2025,2026,2027,2028];

  const [formPago, setFormPago] = useState({ fecha: format(new Date(),"yyyy-MM-dd"), importe: "", concepto: "", notas: "" });

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try { const [s,p] = await Promise.all([getSesiones(), getPagos()]); setSesiones(s); setPagos(p); }
    catch { setError("Error al cargar datos"); }
    finally { setCargando(false); }
  };

  const aplicarFiltro = (lista) => lista.filter(x => {
    if (filtro === "año") return parseInt(x.año) === añoSelec;
    if (filtro === "mes") return parseInt(x.mes) === mesSelec && parseInt(x.año) === añoSelec;
    if (filtro === "rango") {
      if (!fechaDesde || !fechaHasta) return true;
      const fecha = parsearFecha(x.fecha); if (!fecha) return false;
      return isWithinInterval(startOfDay(fecha), { start: startOfDay(parseISO(fechaDesde)), end: endOfDay(parseISO(fechaHasta)) });
    }
    return true;
  });

  const sesionesAño    = sesiones.filter(x => parseInt(x.año) === añoSelec);
  const pagosAñoTotal  = pagos.filter(x => parseInt(x.año) === añoSelec);
  const totalGenerado  = sesionesAño.reduce((acc,s) => acc + (parseFloat(s.precioTotal) || 0), 0);
  const totalCobrado   = pagosAñoTotal.reduce((acc,p) => acc + (parseFloat(p.importe) || 0), 0);
  const totalPendiente = totalGenerado - totalCobrado;
  const pct            = totalGenerado > 0 ? Math.min(100, Math.round((totalCobrado / totalGenerado) * 100)) : 0;

  const pagosFiltrados = aplicarFiltro(pagos).sort((a,b) => { const fa=parsearFecha(formatearFecha(a.fecha)), fb=parsearFecha(formatearFecha(b.fecha)); if(!fa||!fb) return 0; return fb-fa; });
  const formatEur = n => `${parseFloat(n).toFixed(2).replace(".",",")} €`;

  const handleGuardarPago = async () => {
    setError(""); setExito("");
    if (!formPago.importe || parseFloat(formPago.importe) <= 0) return setError("Introduce un importe válido");
    if (!formPago.concepto) return setError("Introduce un concepto para el pago");
    setGuardando(true);
    try {
      const fecha = new Date(formPago.fecha);
      await guardarPago({ id: generarId("P"), fecha: format(fecha,"dd/MM/yyyy"), mes: fecha.getMonth()+1, año: fecha.getFullYear(), importe: parseFloat(formPago.importe), concepto: formPago.concepto, notas: formPago.notas });
      setExito("✅ Pago registrado correctamente");
      setFormPago({ fecha: format(new Date(),"yyyy-MM-dd"), importe: "", concepto: "", notas: "" });
      await cargarDatos();
    } catch(e) { setError("Error al guardar el pago: " + e.message); }
    finally { setGuardando(false); }
  };

  const handleEditarPago = (pago) => {
    const fechaStr=formatearFecha(pago.fecha); const fechaObj=parsearFecha(fechaStr); const fechaISO=fechaObj?format(fechaObj,"yyyy-MM-dd"):format(new Date(),"yyyy-MM-dd");
    setFormEdit({ _fila:pago._fila, id:pago.id, fechaISO, importe:pago.importe, concepto:pago.concepto, notas:pago.notas||"" });
    setEditandoPago(pago);
  };

  const handleGuardarEdit = async () => {
    setError(""); setExito("");
    if (!formEdit.importe || parseFloat(formEdit.importe) <= 0) return setError("Introduce un importe válido");
    if (!formEdit.concepto) return setError("Introduce un concepto");
    setGuardando(true);
    try {
      const fecha = new Date(formEdit.fechaISO);
      await actualizarPago({ _fila:formEdit._fila, id:formEdit.id, fecha:format(fecha,"dd/MM/yyyy"), mes:fecha.getMonth()+1, año:fecha.getFullYear(), importe:parseFloat(formEdit.importe), concepto:formEdit.concepto, notas:formEdit.notas||"" });
      setExito("✅ Pago actualizado correctamente"); setEditandoPago(null); await cargarDatos();
    } catch(e) { setError("Error al actualizar: " + e.message); }
    finally { setGuardando(false); }
  };

  const handleEliminarPago = async (pago) => {
    setEliminando(pago.id); setError(""); setExito("");
    try { await eliminarFila("PAGOS", pago._fila-1); setExito("✅ Pago eliminado correctamente"); setConfirmar(null); await cargarDatos(); }
    catch(e) { setError("Error al eliminar: " + e.message); }
    finally { setEliminando(null); }
  };

  if (cargando) return <><div className="inner-bar"><button className="back-btn" onClick={()=>navigate("/")}><svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg></button><span className="inner-bar-title">Contabilidad</span></div><div className="loading"><div className="spinner"></div> Cargando...</div></>;

  return (
    <>
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
            <div className="modal-body"><strong>{formatearFecha(confirmar.fecha)}</strong> — {confirmar.concepto}<br/><strong>{formatEur(confirmar.importe)}</strong></div>
            <div className="modal-actions">
              <button className="btn btn-outline" style={{flex:1}} onClick={()=>setConfirmar(null)}>Cancelar</button>
              <button className="btn btn-danger" style={{flex:1}} disabled={eliminando===confirmar.id} onClick={()=>handleEliminarPago(confirmar)}>
                {eliminando===confirmar.id?<><div className="spinner" style={{width:"16px",height:"16px",borderWidth:"2px"}}></div> Eliminando...</>:"Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar pago */}
      {editandoPago && (
        <div className="modal-overlay">
          <div className="modal-box" style={{textAlign:"left",maxWidth:"420px"}}>
            <h3 style={{marginBottom:"20px",color:"var(--b600)",fontSize:"15px",fontWeight:"700"}}>✏️ Editar pago</h3>
            <div className="form-row">
              <div className="form-group"><label>Fecha</label><input type="date" className="form-control" value={formEdit.fechaISO} onChange={e=>setFormEdit(f=>({...f,fechaISO:e.target.value}))}/></div>
              <div className="form-group"><label>Importe (€)</label><input type="number" className="form-control" value={formEdit.importe} onChange={e=>setFormEdit(f=>({...f,importe:e.target.value}))} min="0" step="0.01"/></div>
            </div>
            <div className="form-group"><label>Concepto</label><input type="text" className="form-control" value={formEdit.concepto} onChange={e=>setFormEdit(f=>({...f,concepto:e.target.value}))}/></div>
            <div className="form-group"><label>Notas (opcional)</label><input type="text" className="form-control" value={formEdit.notas} onChange={e=>setFormEdit(f=>({...f,notas:e.target.value}))}/></div>
            <div className="modal-actions" style={{marginTop:"16px"}}>
              <button className="btn btn-outline" style={{flex:1}} onClick={()=>setEditandoPago(null)}>Cancelar</button>
              <button className="btn btn-success" style={{flex:1}} disabled={guardando} onClick={handleGuardarEdit}>
                {guardando?<><div className="spinner" style={{width:"16px",height:"16px",borderWidth:"2px"}}></div> Guardando...</>:"💾 Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selector de año + KPIs */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Año</span>
          <select className="form-control" style={{width:"auto",padding:"5px 10px",fontSize:"13px"}} value={añoSelec} onChange={e=>setAñoSelec(parseInt(e.target.value))}>
            {años.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="card-body">
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon" style={{background:"var(--b500)"}}><svg viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" fill="white"/></svg></div>
              <div className="kpi-label">Total generado</div>
              <div className="kpi-value">{formatEur(totalGenerado)}</div>
              <div className="kpi-sub">Año {añoSelec}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon" style={{background:"var(--verde)"}}><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="white"/></svg></div>
              <div className="kpi-label">Total cobrado</div>
              <div className="kpi-value verde">{formatEur(totalCobrado)}</div>
              <div className="kpi-sub">{pct}% cobrado</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon" style={{background:"var(--rojo)"}}><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="white"/></svg></div>
              <div className="kpi-label">Total pendiente</div>
              <div className="kpi-value rojo">{formatEur(totalPendiente)}</div>
              <div className="kpi-sub">{100-pct}% pendiente</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon" style={{background:"var(--g600)"}}><svg viewBox="0 0 24 24"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" fill="white"/></svg></div>
              <div className="kpi-label">Sesiones año</div>
              <div className="kpi-value">{sesionesAño.length}</div>
              <div className="kpi-sub">Año {añoSelec}</div>
            </div>
          </div>
          {/* Barra de progreso */}
          <div className="progress-wrap" style={{marginTop:"14px"}}>
            <div className="progress-top"><span>Cobrado: {formatEur(totalCobrado)}</span><span style={{fontWeight:"700"}}>{pct}%</span></div>
            <div className="progress-bg"><div className="progress-fill" style={{width:`${pct}%`}}></div></div>
            <div className="progress-bot">Pendiente: {formatEur(totalPendiente)}</div>
          </div>
        </div>
      </div>

      {/* Registrar nuevo pago */}
      <div className="card">
        <div className="card-header"><span className="card-title">Registrar nuevo pago</span></div>
        <div className="card-body" style={{display:"flex",flexDirection:"column",gap:"12px"}}>
          <div className="form-row">
            <div className="form-group"><label>Fecha del pago</label><input type="date" className="form-control" value={formPago.fecha} onChange={e=>setFormPago(f=>({...f,fecha:e.target.value}))}/></div>
            <div className="form-group"><label>Importe (€)</label><input type="number" className="form-control" placeholder="0.00" value={formPago.importe} onChange={e=>setFormPago(f=>({...f,importe:e.target.value}))} min="0" step="0.01"/></div>
          </div>
          <div className="form-group"><label>Concepto</label><input type="text" className="form-control" placeholder="Ej: Pago junio 2026..." value={formPago.concepto} onChange={e=>setFormPago(f=>({...f,concepto:e.target.value}))}/></div>
          <div className="form-group"><label>Notas (opcional)</label><input type="text" className="form-control" placeholder="Observaciones..." value={formPago.notas} onChange={e=>setFormPago(f=>({...f,notas:e.target.value}))}/></div>
          <button className="btn btn-success btn-full" onClick={handleGuardarPago} disabled={guardando}>
            {guardando?<><div className="spinner" style={{width:"18px",height:"18px",borderWidth:"2px"}}></div> Guardando...</>:"💾 Registrar pago"}
          </button>
        </div>
      </div>

      {/* Historial con filtros */}
      <div className="card">
        <div className="card-header"><span className="card-title">Historial de pagos</span></div>
        <div className="card-body">
          <div className="filter-tabs" style={{marginBottom:"12px"}}>
            {[{key:"año",label:"Año"},{key:"mes",label:"Por mes"},{key:"rango",label:"Rango"}].map(f=>(
              <button key={f.key} className={`filter-tab ${filtro===f.key?"active":""}`} onClick={()=>setFiltro(f.key)}>{f.label}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:"10px",flexWrap:"wrap",marginBottom:"12px"}}>
            {filtro==="mes"&&<><select className="form-control" style={{width:"auto"}} value={mesSelec} onChange={e=>setMesSelec(parseInt(e.target.value))}>{meses.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select><select className="form-control" style={{width:"80px"}} value={añoSelec} onChange={e=>setAñoSelec(parseInt(e.target.value))}>{años.map(a=><option key={a} value={a}>{a}</option>)}</select></>}
            {filtro==="rango"&&<><div style={{display:"flex",alignItems:"center",gap:"6px"}}><span style={{fontSize:"13px",fontWeight:"600"}}>Desde:</span><input type="date" className="form-control" style={{width:"auto"}} value={fechaDesde} onChange={e=>setFechaDesde(e.target.value)}/></div><div style={{display:"flex",alignItems:"center",gap:"6px"}}><span style={{fontSize:"13px",fontWeight:"600"}}>Hasta:</span><input type="date" className="form-control" style={{width:"auto"}} value={fechaHasta} onChange={e=>setFechaHasta(e.target.value)}/></div></>}
          </div>
          {pagosFiltrados.length===0?(
            <p style={{textAlign:"center",color:"var(--g400)",padding:"24px"}}>No hay pagos en este período</p>
          ):(
            <div className="tabla-container">
              <table>
                <thead><tr><th>Fecha</th><th>Concepto</th><th>Importe</th><th>Notas</th><th>Acciones</th></tr></thead>
                <tbody>
                  {pagosFiltrados.map((p,i)=>(
                    <tr key={i}>
                      <td>{formatearFecha(p.fecha)}</td>
                      <td>{p.concepto}</td>
                      <td><strong style={{color:"var(--verde)"}}>{formatEur(p.importe)}</strong></td>
                      <td style={{fontSize:"12px",color:"var(--g400)"}}>{p.notas||"—"}</td>
                      <td>
                        <div style={{display:"flex",gap:"5px"}}>
                          <button className="action-btn edit" onClick={()=>handleEditarPago(p)}><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
                          <button className="action-btn del" onClick={()=>setConfirmar(p)}><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
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
    </>
  );
}

export default Contabilidad;
