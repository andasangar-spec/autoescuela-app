import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSesiones, eliminarFila, eliminarEventoCalendar, actualizarSesion, crearEventoCalendar, actualizarEventoCalendar, getTiposCurso, generarId } from "../services/googleApi";
import { getWeek, getYear, parseISO, isWithinInterval, startOfDay, endOfDay, format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const generarHoras = () => { const h=[]; for(let i=5;i<=22;i++) for(let m=0;m<60;m+=15) h.push(`${String(i).padStart(2,"0")}:${String(m).padStart(2,"0")}`); return h; };
const HORAS = generarHoras();
const calcularMinutos = (inicio,fin) => { if(!inicio||!fin) return 0; const [h1,m1]=inicio.split(":").map(Number); const [h2,m2]=fin.split(":").map(Number); return Math.max(0,(h2*60+m2)-(h1*60+m1)); };
const calcularHoras   = (inicio,fin) => calcularMinutos(inicio,fin)/60;
const sumarMinutos    = (hora,minutos) => { const [h,m]=hora.split(":").map(Number); const total=h*60+m+minutos; return `${String(Math.floor(total/60)%24).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`; };
const diasSemana      = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

function Sesiones() {
  const navigate                          = useNavigate();
  const [sesiones, setSesiones]           = useState([]);
  const [tipos, setTipos]                 = useState([]);
  const [cargando, setCargando]           = useState(true);
  const [error, setError]                 = useState("");
  const [exito, setExito]                 = useState("");
  const [filtro, setFiltro]               = useState("mes");
  const [mesSelec, setMesSelec]           = useState(new Date().getMonth()+1);
  const [semanaSelec, setSemanaSelec]     = useState(getWeek(new Date(),{weekStartsOn:1}));
  const [añoSelec, setAñoSelec]           = useState(new Date().getFullYear());
  const [fechaDesde, setFechaDesde]       = useState("");
  const [fechaHasta, setFechaHasta]       = useState("");
  const [eliminando, setEliminando]       = useState(null);
  const [confirmar, setConfirmar]         = useState(null);
  const [editando, setEditando]           = useState(null);
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [formEdit, setFormEdit]           = useState({});

  const meses   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const semanas = Array.from({length:53},(_,i)=>i+1);
  const años    = [2024,2025,2026,2027,2028];

  useEffect(()=>{ cargarDatos(); },[]);

  const cargarDatos = async () => {
    setCargando(true); setError("");
    try { const [s,t]=await Promise.all([getSesiones(),getTiposCurso()]); setSesiones(s); setTipos(t); }
    catch { setError("Error al cargar sesiones"); }
    finally { setCargando(false); }
  };

  const parsearFecha = (fechaStr) => { if(!fechaStr) return null; const p=fechaStr.split("/"); if(p.length!==3) return null; return new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0])); };

  const sesionesFiltradas = sesiones.filter(s => {
    if(filtro==="mes")    return parseInt(s.mes)===mesSelec && parseInt(s.año)===añoSelec;
    if(filtro==="semana"){ const f=parsearFecha(s.fecha); return f && getWeek(f,{weekStartsOn:1})===semanaSelec && getYear(f)===añoSelec; }
    if(filtro==="rango"){ if(!fechaDesde||!fechaHasta) return true; const f=parsearFecha(s.fecha); return f && isWithinInterval(startOfDay(f),{start:startOfDay(parseISO(fechaDesde)),end:endOfDay(parseISO(fechaHasta))}); }
    return parseInt(s.año)===añoSelec;
  }).sort((a,b)=>{ const fa=parsearFecha(a.fecha),fb=parsearFecha(b.fecha); return(!fa||!fb)?0:fb-fa; });

  const totalHoras   = sesionesFiltradas.reduce((acc,s)=>acc+(parseFloat(s.horasTotal)||0),0);
  const totalImporte = sesionesFiltradas.reduce((acc,s)=>acc+(parseFloat(s.precioTotal)||0),0);
  const formatEur    = n=>`${n.toFixed(2).replace(".",",")} €`;
  const formatH      = n=>`${n.toFixed(2).replace(".",",")} h`;

  const handleEditar = (sesion) => {
    const fechaObj=parsearFecha(sesion.fecha); const fechaISO=fechaObj?format(fechaObj,"yyyy-MM-dd"):"";
    setFormEdit({ _fila:sesion._fila, id:sesion.id, fechaISO, tipoCurso:sesion.tipoCurso, horaInicio1:sesion.horaInicio1||"09:00", horaFin1:sesion.horaFin1||"10:00", hasPausa:sesion.pausa==="SI", horaInicio2:sesion.horaInicio2||"14:00", horaFin2:sesion.horaFin2||"16:00", tipoPrecio:sesion.tipoPrecio||"clase", precioPorClase:sesion.precioHora||15, precioFijo:sesion.precioTotal||0, notas:sesion.notas||"", calendarEventId:sesion.calendarEventId||"" });
    setEditando(sesion);
  };

  const handleChangeEdit = (campo,valor) => {
    setFormEdit(f => {
      const nuevo={...f,[campo]:valor};
      if(campo==="horaInicio1"){ const tipo=tipos.find(t=>t.nombre===f.tipoCurso); if(tipo) nuevo.horaFin1=sumarMinutos(valor,tipo.duracionMin); }
      if(campo==="tipoCurso"){ const tipo=tipos.find(t=>t.nombre===valor); if(tipo){ nuevo.tipoPrecio=tipo.tipoPrecio==="total"?"total":"clase"; nuevo.precioPorClase=tipo.precio; nuevo.horaFin1=sumarMinutos(f.horaInicio1,tipo.duracionMin); } }
      return nuevo;
    });
  };

  const tipoEdit       = tipos.find(t=>t.nombre===formEdit.tipoCurso);
  const duracionEdit   = tipoEdit?tipoEdit.duracionMin:60;
  const minBrutoEdit   = calcularMinutos(formEdit.horaInicio1,formEdit.horaFin1);
  const minPausaEdit   = formEdit.hasPausa?calcularMinutos(formEdit.horaInicio2,formEdit.horaFin2):0;
  const minNetosEdit   = Math.max(0,minBrutoEdit-minPausaEdit);
  const horasTotalEdit = minNetosEdit/60;
  const horasT1Edit    = formEdit.hasPausa?calcularHoras(formEdit.horaInicio1,formEdit.horaInicio2):horasTotalEdit;
  const horasT2Edit    = formEdit.hasPausa?calcularHoras(formEdit.horaFin2,formEdit.horaFin1):0;
  const numClasesEdit  = duracionEdit>0?Math.floor(minNetosEdit/duracionEdit):0;
  const minRestoEdit   = minNetosEdit%duracionEdit;
  const precioTotalEdit= formEdit.tipoPrecio==="clase"?numClasesEdit*parseFloat(formEdit.precioPorClase||0):parseFloat(formEdit.precioFijo||0);

  const handleGuardarEdit = async () => {
    setError(""); setExito(""); setGuardandoEdit(true);
    try {
      const fechaObj=new Date(formEdit.fechaISO); const diaSem=diasSemana[fechaObj.getDay()]; const semana=getWeek(fechaObj,{weekStartsOn:1}); const mes=fechaObj.getMonth()+1; const año=fechaObj.getFullYear(); const fechaFmt=format(fechaObj,"dd/MM/yyyy");
      const colorCurso=tipoEdit?.colorCalendar||"#1a73e8"; const descripcion=`${formEdit.tipoCurso} | ${numClasesEdit} clase(s) × ${duracionEdit}min | ${horasTotalEdit.toFixed(2)}h | ${precioTotalEdit.toFixed(2)}€`;
      const idsExistentes=(editando.calendarEventId||"").split(",").map(id=>id.trim()).filter(Boolean);
      const horaFinT1=formEdit.hasPausa?formEdit.horaInicio2:formEdit.horaFin1;
      let eventId1="", eventId2="";
      if(idsExistentes.length>0&&idsExistentes[0]) { eventId1=await actualizarEventoCalendar({eventId:idsExistentes[0],tipoCurso:formEdit.tipoCurso,fecha:formEdit.fechaISO,horaInicio:formEdit.horaInicio1,horaFin:horaFinT1,color:colorCurso,descripcion}); }
      else { eventId1=await crearEventoCalendar({tipoCurso:formEdit.tipoCurso,fecha:formEdit.fechaISO,horaInicio:formEdit.horaInicio1,horaFin:horaFinT1,color:colorCurso,descripcion}); }
      if(formEdit.hasPausa&&horasT2Edit>0) {
        if(idsExistentes.length>1&&idsExistentes[1]) { eventId2=await actualizarEventoCalendar({eventId:idsExistentes[1],tipoCurso:formEdit.tipoCurso,fecha:formEdit.fechaISO,horaInicio:formEdit.horaFin2,horaFin:formEdit.horaFin1,color:colorCurso,descripcion}); }
        else { eventId2=await crearEventoCalendar({tipoCurso:formEdit.tipoCurso,fecha:formEdit.fechaISO,horaInicio:formEdit.horaFin2,horaFin:formEdit.horaFin1,color:colorCurso,descripcion}); }
      } else if(!formEdit.hasPausa&&idsExistentes.length>1&&idsExistentes[1]) { await eliminarEventoCalendar(idsExistentes[1]); }
      await actualizarSesion({...editando,fecha:fechaFmt,diaSemana:diaSem,semana,mes,año,tipoCurso:formEdit.tipoCurso,horaInicio1:formEdit.horaInicio1,horaFin1:formEdit.horaFin1,pausa:formEdit.hasPausa?"SI":"NO",horaInicio2:formEdit.hasPausa?formEdit.horaInicio2:"",horaFin2:formEdit.hasPausa?formEdit.horaFin2:"",horasTramo1:horasT1Edit.toFixed(2),horasTramo2:horasT2Edit.toFixed(2),horasTotal:horasTotalEdit.toFixed(2),tipoPrecio:formEdit.tipoPrecio,precioHora:parseFloat(formEdit.precioPorClase),precioTotal:precioTotalEdit.toFixed(2),calendarEventId:eventId1+(eventId2?","+eventId2:""),notas:formEdit.notas||""});
      setExito("✅ Sesión actualizada correctamente"); setEditando(null); await cargarDatos();
    } catch(e) { setError("Error al actualizar: "+e.message); }
    finally { setGuardandoEdit(false); }
  };

  const handleEliminar = async (sesion) => {
    setEliminando(sesion.id); setError(""); setExito("");
    try { if(sesion.calendarEventId) await eliminarEventoCalendar(sesion.calendarEventId); await eliminarFila("SESIONES",sesion._fila-1); setExito("✅ Sesión eliminada correctamente"); setConfirmar(null); await cargarDatos(); }
    catch(e) { setError("Error al eliminar: "+e.message); }
    finally { setEliminando(null); }
  };

  const tituloPeriodo = () => { if(filtro==="mes") return `${meses[mesSelec-1]}_${añoSelec}`; if(filtro==="semana") return `Semana${semanaSelec}_${añoSelec}`; if(filtro==="rango") return `${fechaDesde}_${fechaHasta}`; return `Año_${añoSelec}`; };

  const exportarExcel = () => {
    const datos=sesionesFiltradas.map(s=>({"Fecha":s.fecha,"Día":s.diaSemana,"Semana":s.semana,"Tipo curso":s.tipoCurso,"Inicio":s.horaInicio1,"Fin":s.horaFin1,"Pausa":s.pausa==="SI"?`${s.horaInicio2}-${s.horaFin2}`:"No","Horas":parseFloat(s.horasTotal),"Precio/clase":parseFloat(s.precioHora),"Total (€)":parseFloat(s.precioTotal),"Notas":s.notas||""}));
    datos.push({"Fecha":"TOTAL","Día":"","Semana":"","Tipo curso":`${sesionesFiltradas.length} sesiones`,"Inicio":"","Fin":"","Pausa":"","Horas":totalHoras,"Precio/clase":"","Total (€)":totalImporte,"Notas":""});
    const ws=XLSX.utils.json_to_sheet(datos); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Sesiones");
    ws["!cols"]=[{wch:12},{wch:12},{wch:8},{wch:18},{wch:8},{wch:8},{wch:14},{wch:8},{wch:10},{wch:10},{wch:20}];
    XLSX.writeFile(wb,`Sesiones_${tituloPeriodo()}.xlsx`);
  };

  const exportarPDF = () => {
    const doc=new jsPDF({orientation:"landscape"}); doc.setFontSize(16); doc.setTextColor(21,87,176); doc.text("LogiConta — Registro de Sesiones",14,16); doc.setFontSize(10); doc.setTextColor(100); doc.text(`Período: ${tituloPeriodo().replace(/_/g," ")}`,14,23); doc.text(`Total: ${sesionesFiltradas.length} sesiones | ${formatH(totalHoras)} | ${formatEur(totalImporte)}`,14,29);
    autoTable(doc,{startY:33,head:[["Fecha","Día","Tipo curso","Horario","Pausa","Horas","Importe"]],body:[...sesionesFiltradas.map(s=>[s.fecha,s.diaSemana,s.tipoCurso,`${s.horaInicio1}–${s.horaFin1}`,s.pausa==="SI"?`${s.horaInicio2}–${s.horaFin2}`:"—",formatH(parseFloat(s.horasTotal)),formatEur(parseFloat(s.precioTotal))]),["TOTAL","",`${sesionesFiltradas.length} sesiones`,"","",formatH(totalHoras),formatEur(totalImporte)]],headStyles:{fillColor:[21,87,176],fontStyle:"bold"},alternateRowStyles:{fillColor:[245,245,245]},styles:{fontSize:9},didParseCell:(data)=>{if(data.row.index===sesionesFiltradas.length){data.cell.styles.fillColor=[232,240,254];data.cell.styles.fontStyle="bold";}}});
    doc.save(`Sesiones_${tituloPeriodo()}.pdf`);
  };

  if(cargando) return <><div className="inner-bar"><button className="back-btn" onClick={()=>navigate("/")}><svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg></button><span className="inner-bar-title">Mis sesiones</span></div><div className="loading"><div className="spinner"></div> Cargando sesiones...</div></>;

  return (
    <>
      {/* Barra superior */}
      <div className="inner-bar">
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <span className="inner-bar-title">Mis sesiones</span>
        <button className="inner-bar-action" onClick={cargarDatos}>🔄</button>
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}
      {exito && <div className="alerta alerta-success">{exito}</div>}

      {/* Modal confirmar eliminar */}
      {confirmar && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-icon">🗑️</div>
            <div className="modal-title">¿Eliminar sesión?</div>
            <div className="modal-body"><strong>{confirmar.fecha}</strong> — {confirmar.tipoCurso}<br/>También se eliminará el evento de Google Calendar.</div>
            <div className="modal-actions">
              <button className="btn btn-outline" style={{flex:1}} onClick={()=>setConfirmar(null)}>Cancelar</button>
              <button className="btn btn-danger" style={{flex:1}} disabled={eliminando===confirmar.id} onClick={()=>handleEliminar(confirmar)}>
                {eliminando===confirmar.id?<><div className="spinner" style={{width:"16px",height:"16px",borderWidth:"2px"}}></div> Eliminando...</>:"Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar sesión */}
      {editando && (
        <div className="modal-overlay" style={{alignItems:"flex-start",overflowY:"auto",padding:"20px"}}>
          <div className="modal-box" style={{textAlign:"left",maxWidth:"500px",padding:"24px"}}>
            <h3 style={{marginBottom:"20px",color:"var(--b600)",fontSize:"15px",fontWeight:"700"}}>✏️ Editar sesión</h3>
            <div className="form-row">
              <div className="form-group"><label>Fecha</label><input type="date" className="form-control" value={formEdit.fechaISO} onChange={e=>handleChangeEdit("fechaISO",e.target.value)}/></div>
              <div className="form-group">
                <label>Tipo de curso</label>
                <select className="form-control" value={formEdit.tipoCurso} onChange={e=>handleChangeEdit("tipoCurso",e.target.value)}>
                  {tipos.map(t=><option key={t.id} value={t.nombre}>{t.nombre}</option>)}
                </select>
                {tipoEdit&&<span className="form-hint">⏱ {tipoEdit.duracionMin} min/clase · {tipoEdit.precio} €/clase</span>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Hora inicio</label><select className="form-control" value={formEdit.horaInicio1} onChange={e=>handleChangeEdit("horaInicio1",e.target.value)}>{HORAS.map(h=><option key={h} value={h}>{h}</option>)}</select></div>
              <div className="form-group"><label>Hora fin</label><select className="form-control" value={formEdit.horaFin1} onChange={e=>handleChangeEdit("horaFin1",e.target.value)}>{HORAS.map(h=><option key={h} value={h}>{h}</option>)}</select></div>
            </div>
            {minBrutoEdit>0&&<div className="info-badge" style={{marginBottom:"12px"}}>⏱ <strong>{(minBrutoEdit/60).toFixed(2)} h ({minBrutoEdit} min)</strong></div>}
            <div style={{display:"flex",alignItems:"center",gap:"12px",margin:"12px 0"}}>
              <input type="checkbox" id="pausaEdit" checked={formEdit.hasPausa} onChange={e=>handleChangeEdit("hasPausa",e.target.checked)} style={{width:"18px",height:"18px",accentColor:"var(--b500)"}}/>
              <label htmlFor="pausaEdit" style={{fontWeight:"600",cursor:"pointer"}}>☕ Pausa en medio</label>
            </div>
            {formEdit.hasPausa&&(
              <div className="pausa-section">
                <div className="form-row">
                  <div className="form-group"><label>Inicio pausa</label><select className="form-control" value={formEdit.horaInicio2} onChange={e=>handleChangeEdit("horaInicio2",e.target.value)}>{HORAS.map(h=><option key={h} value={h}>{h}</option>)}</select></div>
                  <div className="form-group"><label>Fin pausa</label><select className="form-control" value={formEdit.horaFin2} onChange={e=>handleChangeEdit("horaFin2",e.target.value)}>{HORAS.map(h=><option key={h} value={h}>{h}</option>)}</select></div>
                </div>
                {minPausaEdit>0&&<div className="pausa-badge">☕ Pausa: <strong>{minPausaEdit} min</strong> descontados</div>}
              </div>
            )}
            <div className="form-group" style={{marginTop:"12px"}}>
              <label>Tipo de precio</label>
              <div className="radio-group">
                <label className="radio-opt"><input type="radio" value="clase" checked={formEdit.tipoPrecio==="clase"} onChange={()=>handleChangeEdit("tipoPrecio","clase")}/> Por clase</label>
                <label className="radio-opt"><input type="radio" value="total" checked={formEdit.tipoPrecio==="total"} onChange={()=>handleChangeEdit("tipoPrecio","total")}/> Precio fijo</label>
              </div>
            </div>
            {formEdit.tipoPrecio==="clase"?(<div className="form-group"><label>Precio por clase (€)</label><input type="number" className="form-control" value={formEdit.precioPorClase} onChange={e=>handleChangeEdit("precioPorClase",e.target.value)} min="0" step="0.5"/></div>):(<div className="form-group"><label>Precio fijo total (€)</label><input type="number" className="form-control" value={formEdit.precioFijo||0} onChange={e=>handleChangeEdit("precioFijo",e.target.value)} min="0" step="5"/></div>)}
            <div className="price-resume" style={{marginBottom:"16px"}}>
              {formEdit.tipoPrecio==="clase"&&<div className="price-classes-note"><strong>{numClasesEdit} clase(s)</strong> × {duracionEdit} min{minRestoEdit>0&&<span className="resto">(+{minRestoEdit}min)</span>}</div>}
              <div className="price-resume-row"><div><div className="price-resume-value">{horasTotalEdit.toFixed(2)} h</div><div className="price-resume-label">Total horas</div></div><div><div className="price-resume-value verde">{precioTotalEdit.toFixed(2)} €</div><div className="price-resume-label">Total importe</div></div></div>
            </div>
            <div className="form-group"><label>Notas</label><textarea className="form-control" rows={2} value={formEdit.notas||""} onChange={e=>handleChangeEdit("notas",e.target.value)} style={{resize:"none"}}/></div>
            <div className="modal-actions" style={{marginTop:"16px"}}>
              <button className="btn btn-outline" style={{flex:1}} onClick={()=>setEditando(null)}>Cancelar</button>
              <button className="btn btn-success" style={{flex:1}} disabled={guardandoEdit} onClick={handleGuardarEdit}>
                {guardandoEdit?<><div className="spinner" style={{width:"16px",height:"16px",borderWidth:"2px"}}></div> Guardando...</>:"💾 Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="filter-tabs">
        {[{key:"mes",label:"Por mes"},{key:"semana",label:"Por semana"},{key:"año",label:"Año"},{key:"rango",label:"Rango"}].map(f=>(
          <button key={f.key} className={`filter-tab ${filtro===f.key?"active":""}`} onClick={()=>setFiltro(f.key)}>{f.label}</button>
        ))}
      </div>

      <div style={{display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"center"}}>
        {filtro==="mes"&&<><select className="form-control" style={{width:"auto"}} value={mesSelec} onChange={e=>setMesSelec(parseInt(e.target.value))}>{meses.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select><select className="form-control" style={{width:"80px"}} value={añoSelec} onChange={e=>setAñoSelec(parseInt(e.target.value))}>{años.map(a=><option key={a} value={a}>{a}</option>)}</select></>}
        {filtro==="semana"&&<><select className="form-control" style={{width:"auto"}} value={semanaSelec} onChange={e=>setSemanaSelec(parseInt(e.target.value))}>{semanas.map(s=><option key={s} value={s}>Semana {s}</option>)}</select><select className="form-control" style={{width:"80px"}} value={añoSelec} onChange={e=>setAñoSelec(parseInt(e.target.value))}>{años.map(a=><option key={a} value={a}>{a}</option>)}</select></>}
        {filtro==="año"&&<select className="form-control" style={{width:"auto"}} value={añoSelec} onChange={e=>setAñoSelec(parseInt(e.target.value))}>{años.map(a=><option key={a} value={a}>{a}</option>)}</select>}
        {filtro==="rango"&&<><div style={{display:"flex",alignItems:"center",gap:"6px"}}><span style={{fontSize:"13px",fontWeight:"600",color:"var(--g600)"}}>Desde:</span><input type="date" className="form-control" style={{width:"auto"}} value={fechaDesde} onChange={e=>setFechaDesde(e.target.value)}/></div><div style={{display:"flex",alignItems:"center",gap:"6px"}}><span style={{fontSize:"13px",fontWeight:"600",color:"var(--g600)"}}>Hasta:</span><input type="date" className="form-control" style={{width:"auto"}} value={fechaHasta} onChange={e=>setFechaHasta(e.target.value)}/></div></>}
      </div>

      {/* Totales */}
      <div className="totals-row">
        <div className="total-card"><div className="total-label">Sesiones</div><div className="total-value">{sesionesFiltradas.length}</div></div>
        <div className="total-card"><div className="total-label">Total horas</div><div className="total-value">{formatH(totalHoras)}</div></div>
        <div className="total-card"><div className="total-label">Total €</div><div className="total-value verde">{formatEur(totalImporte)}</div></div>
      </div>

      {/* Exportar */}
      {sesionesFiltradas.length>0&&(
        <div className="export-row">
          <button className="export-btn xl" onClick={exportarExcel}>📊 Exportar Excel</button>
          <button className="export-btn pdf" onClick={exportarPDF}>📄 Exportar PDF</button>
        </div>
      )}

      {/* Tabla */}
      <div className="card">
        {sesionesFiltradas.length===0?(
          <p style={{textAlign:"center",color:"var(--g400)",padding:"32px"}}>No hay sesiones en este período</p>
        ):(
          <div className="tabla-container">
            <table>
              <thead><tr><th>Fecha</th><th>Día</th><th>Tipo</th><th>Horario</th><th>Pausa</th><th>Horas</th><th>Importe</th><th>Acciones</th></tr></thead>
              <tbody>
                {sesionesFiltradas.map((s,i)=>(
                  <tr key={i}>
                    <td><strong>{s.fecha}</strong></td>
                    <td>{s.diaSemana}</td>
                    <td><span className="badge">{s.tipoCurso}</span></td>
                    <td style={{fontSize:"12px"}}>{s.horaInicio1}–{s.horaFin1}{s.pausa==="SI"&&<span style={{color:"var(--amarillo)"}}> / {s.horaInicio2}–{s.horaFin2}</span>}</td>
                    <td>{s.pausa==="SI"?"☕ Sí":"—"}</td>
                    <td><strong>{formatH(parseFloat(s.horasTotal))}</strong></td>
                    <td><strong style={{color:"var(--verde)"}}>{formatEur(parseFloat(s.precioTotal))}</strong></td>
                    <td>
                      <div style={{display:"flex",gap:"5px"}}>
                        <button className="action-btn edit" onClick={()=>handleEditar(s)}><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
                        <button className="action-btn del" onClick={()=>setConfirmar(s)}><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
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

export default Sesiones;
