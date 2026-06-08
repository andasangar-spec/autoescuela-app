import React, { useEffect, useState } from "react";
import { getTiposCurso, guardarSesion, crearEventoCalendar, generarId } from "../services/googleApi";
import { getWeek, getMonth, getYear, format, parseISO } from "date-fns";

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

const calcularMinutos = (inicio, fin) => {
  if (!inicio || !fin) return 0;
  const [h1,m1] = inicio.split(":").map(Number);
  const [h2,m2] = fin.split(":").map(Number);
  return Math.max(0, (h2*60+m2)-(h1*60+m1));
};

const sumarMinutos = (hora, minutos) => {
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m + minutos;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
};

const diasSemana = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

function NuevaSesion() {
  const [tipos, setTipos]         = useState([]);
  const [cargando, setCargando]   = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito]         = useState("");
  const [error, setError]         = useState("");
  const [hasPausa, setHasPausa]   = useState(false);

  const [form, setForm] = useState({
    fecha:       format(new Date(), "yyyy-MM-dd"),
    tipoCurso:   "",
    horaInicio:  "09:00",
    horaFin:     "10:00",
    pausaInicio: "14:00",
    pausaFin:    "16:00",
    tipoPrecio:  "clase",
    precioPorClase: 15,
    precioFijo:  0,
    notas:       "",
  });

  useEffect(() => { cargarTipos(); }, []);

  const cargarTipos = async () => {
    setCargando(true);
    try {
      const t = await getTiposCurso();
      setTipos(t);
      if (t.length > 0) {
        const primero = t[0];
        const horaFin = sumarMinutos("09:00", primero.duracionMin);
        setForm(f => ({
          ...f,
          tipoCurso:      primero.nombre,
          tipoPrecio:     primero.tipoPrecio,
          precioPorClase: primero.precio,
          precioFijo:     primero.tipoPrecio === "total" ? primero.precio : 0,
          horaFin,
        }));
      }
    } catch (e) {
      setError("Error cargando tipos de curso");
    } finally {
      setCargando(false);
    }
  };

  const handleCursoChange = (nombre) => {
    const tipo = tipos.find(t => t.nombre === nombre);
    if (tipo) {
      const horaFin = sumarMinutos(form.horaInicio, tipo.duracionMin);
      setForm(f => ({
        ...f,
        tipoCurso:      nombre,
        tipoPrecio:     tipo.tipoPrecio,
        precioPorClase: tipo.precio,
        precioFijo:     tipo.tipoPrecio === "total" ? tipo.precio : 0,
        horaFin,
      }));
    }
  };

  const handleChange = (campo, valor) => {
    if (campo === "horaInicio") {
      const tipoActual = tipos.find(t => t.nombre === form.tipoCurso);
      if (tipoActual) {
        const horaFin = sumarMinutos(valor, tipoActual.duracionMin);
        setForm(f => ({ ...f, horaInicio: valor, horaFin }));
        return;
      }
    }
    setForm(f => ({ ...f, [campo]: valor }));
  };

  // ── Cálculos ─────────────────────────────────────────────
  const minutosBruto  = calcularMinutos(form.horaInicio, form.horaFin);
  const minutosPausa  = hasPausa ? calcularMinutos(form.pausaInicio, form.pausaFin) : 0;
  const minutosNetos  = Math.max(0, minutosBruto - minutosPausa);
  const horasTotal    = minutosNetos / 60;

  const horasTramo1   = hasPausa
    ? calcularHoras(form.horaInicio, form.pausaInicio)
    : horasTotal;
  const horasTramo2   = hasPausa
    ? calcularHoras(form.pausaFin, form.horaFin)
    : 0;

  const tipoActual    = tipos.find(t => t.nombre === form.tipoCurso);
  const duracionMin   = tipoActual ? tipoActual.duracionMin : 60;

  // Cálculo número de clases y precio
  const numClases     = duracionMin > 0 ? Math.floor(minutosNetos / duracionMin) : 0;
  const minutosResto  = minutosNetos % duracionMin;

  const precioTotal   = form.tipoPrecio === "clase"
    ? numClases * parseFloat(form.precioPorClase || 0)
    : form.tipoPrecio === "total"
    ? parseFloat(form.precioFijo || 0)
    : 0;

  const fechaObj  = parseISO(form.fecha);
  const diaSemana = diasSemana[fechaObj.getDay()];
  const semana    = getWeek(fechaObj, { weekStartsOn: 1 });
  const mes       = getMonth(fechaObj) + 1;
  const año       = getYear(fechaObj);

  const handleGuardar = async () => {
    setError(""); setExito("");
    if (!form.tipoCurso) return setError("Selecciona un tipo de curso");
    if (minutosBruto <= 0) return setError("La hora de fin debe ser posterior a la de inicio");
    if (hasPausa && minutosPausa <= 0) return setError("La hora de fin de pausa debe ser posterior al inicio");
    if (hasPausa && calcularMinutos(form.horaInicio, form.pausaInicio) <= 0)
      return setError("La pausa debe estar dentro del horario de la sesión");
    if (hasPausa && calcularMinutos(form.pausaFin, form.horaFin) <= 0)
      return setError("La sesión debe continuar después de la pausa");

    setGuardando(true);
    try {
      const colorCurso  = tipoActual?.colorCalendar || "#1a73e8";
      const descripcion = `${form.tipoCurso} | ${numClases} clase(s) × ${duracionMin}min | ${horasTotal.toFixed(2)}h | ${precioTotal.toFixed(2)}€`;

      const eventId1 = await crearEventoCalendar({
        tipoCurso:  form.tipoCurso,
        fecha:      form.fecha,
        horaInicio: form.horaInicio,
        horaFin:    hasPausa ? form.pausaInicio : form.horaFin,
        color:      colorCurso,
        descripcion,
      });

      let eventId2 = "";
      if (hasPausa && horasTramo2 > 0) {
        eventId2 = await crearEventoCalendar({
          tipoCurso:  form.tipoCurso,
          fecha:      form.fecha,
          horaInicio: form.pausaFin,
          horaFin:    form.horaFin,
          color:      colorCurso,
          descripcion,
        });
      }

      await guardarSesion({
        id:              generarId("S"),
        fecha:           format(fechaObj, "dd/MM/yyyy"),
        diaSemana,
        semana,
        mes,
        año,
        tipoCurso:       form.tipoCurso,
        horaInicio1:     form.horaInicio,
        horaFin1:        hasPausa ? form.pausaInicio : form.horaFin,
        pausa:           hasPausa ? "SI" : "NO",
        horaInicio2:     hasPausa ? form.pausaFin : "",
        horaFin2:        hasPausa ? form.horaFin : "",
        horasTramo1:     horasTramo1.toFixed(2),
        horasTramo2:     horasTramo2.toFixed(2),
        horasTotal:      horasTotal.toFixed(2),
        tipoPrecio:      form.tipoPrecio,
        precioHora:      parseFloat(form.precioPorClase),
        precioTotal:     precioTotal.toFixed(2),
        calendarEventId: eventId1 + (eventId2 ? "," + eventId2 : ""),
        notas:           form.notas,
      });

      setExito("✅ Sesión guardada correctamente en Sheets y Calendar");
      setForm(f => ({ ...f, fecha: format(new Date(), "yyyy-MM-dd"), notas: "" }));
      setHasPausa(false);
    } catch (e) {
      setError("Error al guardar: " + e.message);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <div className="loading"><div className="spinner"></div> Cargando...</div>;

  return (
    <div>
      <div className="page-header"><h1>➕ Nueva sesión</h1></div>
      {exito && <div className="alerta alerta-success">{exito}</div>}
      {error && <div className="alerta alerta-error">{error}</div>}

      {/* Información básica */}
      <div className="card">
        <div className="card-title">📅 Información básica</div>
        <div className="form-row">
          <div className="form-group">
            <label>Fecha</label>
            <input type="date" className="form-control" value={form.fecha}
              onChange={e => handleChange("fecha", e.target.value)} />
            {form.fecha && (
              <small style={{ color:"#666", marginTop:"4px", display:"block" }}>
                {diaSemana} — Semana {semana}
              </small>
            )}
          </div>
          <div className="form-group">
            <label>Tipo de curso / clase</label>
            <select className="form-control" value={form.tipoCurso}
              onChange={e => handleCursoChange(e.target.value)}>
              {tipos.map(t => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
            </select>
            {tipoActual && (
              <small style={{ color:"#1557b0", marginTop:"4px", display:"block" }}>
                ⏱️ <strong>{tipoActual.duracionMin} min/clase</strong> — 💶 <strong>{tipoActual.precio}€/clase</strong>
              </small>
            )}
          </div>
        </div>
      </div>

      {/* Horario */}
      <div className="card">
        <div className="card-title">🕐 Horario de la sesión</div>
        <div className="form-row">
          <div className="form-group">
            <label>Hora de inicio</label>
            <select className="form-control" value={form.horaInicio}
              onChange={e => handleChange("horaInicio", e.target.value)}>
              {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Hora de fin</label>
            <select className="form-control" value={form.horaFin}
              onChange={e => handleChange("horaFin", e.target.value)}>
              {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>
        {minutosBruto > 0 && (
          <div style={{ background:"#e8f0fe", padding:"10px 14px", borderRadius:"8px", fontSize:"14px", color:"#1557b0" }}>
            ⏱️ Duración total: <strong>{horasTotal.toFixed(2)}h ({minutosBruto} min)</strong>
          </div>
        )}
      </div>

      {/* Pausa */}
      <div className="card">
        <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom: hasPausa ? "16px" : "0" }}>
          <input type="checkbox" id="pausa" checked={hasPausa}
            onChange={e => setHasPausa(e.target.checked)}
            style={{ width:"18px", height:"18px", cursor:"pointer" }} />
          <label htmlFor="pausa" style={{ cursor:"pointer", fontWeight:"600", fontSize:"15px" }}>
            ☕ Añadir pausa en medio
          </label>
        </div>
        {hasPausa && (
          <div className="pausa-section">
            <div className="card-title" style={{ color:"#e65100" }}>☕ Horario de la pausa</div>
            <div className="form-row">
              <div className="form-group">
                <label>Inicio de pausa</label>
                <select className="form-control" value={form.pausaInicio}
                  onChange={e => handleChange("pausaInicio", e.target.value)}>
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Fin de pausa</label>
                <select className="form-control" value={form.pausaFin}
                  onChange={e => handleChange("pausaFin", e.target.value)}>
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
            {minutosPausa > 0 && (
              <div style={{ background:"#fff3e0", padding:"8px 12px", borderRadius:"8px", fontSize:"14px", color:"#e65100" }}>
                ☕ Pausa: <strong>{minutosPausa} min</strong> descontados
              </div>
            )}
          </div>
        )}
      </div>

      {/* Precio */}
      <div className="card">
        <div className="card-title">💰 Precio</div>
        <div className="form-group">
          <label>Tipo de precio</label>
          <div style={{ display:"flex", gap:"16px" }}>
            <label style={{ display:"flex", alignItems:"center", gap:"8px", cursor:"pointer" }}>
              <input type="radio" value="clase" checked={form.tipoPrecio === "clase"}
                onChange={() => handleChange("tipoPrecio","clase")} />
              Por clase
            </label>
            <label style={{ display:"flex", alignItems:"center", gap:"8px", cursor:"pointer" }}>
              <input type="radio" value="total" checked={form.tipoPrecio === "total"}
                onChange={() => handleChange("tipoPrecio","total")} />
              Precio fijo total
            </label>
          </div>
        </div>

        {form.tipoPrecio === "clase" ? (
          <div className="form-group">
            <label>Precio por clase (€)</label>
            <input type="number" className="form-control" value={form.precioPorClase}
              onChange={e => handleChange("precioPorClase", e.target.value)} min="0" step="0.5" />
          </div>
        ) : (
          <div className="form-group">
            <label>Precio fijo total (€)</label>
            <input type="number" className="form-control" value={form.precioFijo}
              onChange={e => handleChange("precioFijo", e.target.value)} min="0" step="5" />
          </div>
        )}

        {/* Resumen */}
        <div style={{ background:"linear-gradient(135deg,#e8f0fe,#d2e3fc)", borderRadius:"12px", padding:"16px", marginTop:"8px" }}>
          {form.tipoPrecio === "clase" && (
            <div style={{ textAlign:"center", marginBottom:"12px", fontSize:"14px", color:"#1557b0" }}>
              <strong>{numClases} clase(s)</strong> × {duracionMin}min
              {minutosResto > 0 && (
                <span style={{ color:"#e65100", marginLeft:"8px" }}>
                  (+{minutosResto}min sin completar clase)
                </span>
              )}
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", textAlign:"center" }}>
            <div>
              <div style={{ fontSize:"24px", fontWeight:"800", color:"#1557b0" }}>
                {horasTotal.toFixed(2)} h
              </div>
              <div style={{ fontSize:"12px", color:"#5f6368" }}>
                Total horas {hasPausa && <span style={{ color:"#e65100" }}>(-{(minutosPausa/60).toFixed(2)}h pausa)</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize:"24px", fontWeight:"800", color:"#34a853" }}>
                {precioTotal.toFixed(2)} €
              </div>
              <div style={{ fontSize:"12px", color:"#5f6368" }}>Total a cobrar</div>
            </div>
          </div>
        </div>
      </div>

      {/* Notas */}
      <div className="card">
        <div className="card-title">📝 Notas (opcional)</div>
        <textarea className="form-control" rows={3} placeholder="Observaciones..."
          value={form.notas} onChange={e => handleChange("notas", e.target.value)} />
      </div>

      <button className="btn btn-success" onClick={handleGuardar} disabled={guardando}
        style={{ width:"100%", justifyContent:"center", padding:"16px", fontSize:"16px" }}>
        {guardando
          ? <><div className="spinner" style={{ width:"18px",height:"18px",borderWidth:"2px" }}></div> Guardando...</>
          : "💾 Guardar sesión en Sheets y Calendar"}
      </button>
    </div>
  );
}

export default NuevaSesion;