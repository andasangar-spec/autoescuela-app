import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { leerRango, escribirRango } from "../services/googleApi";

function Configuracion() {
  const navigate                    = useNavigate();
  const [tipos, setTipos]           = useState([]);
  const [cargando, setCargando]     = useState(true);
  const [guardando, setGuardando]   = useState(false);
  const [error, setError]           = useState("");
  const [exito, setExito]           = useState("");
  const [hayCambios, setHayCambios] = useState(false);

  useEffect(() => { cargarTipos(); }, []);

  const cargarTipos = async () => {
    setCargando(true); setError("");
    try {
      const filas = await leerRango("TIPOS_CURSO", "A2:G30");
      const datos = filas
        .filter(f => f[0])
        .map(f => ({
          id:            f[0] || "",
          nombre:        f[1] || "",
          tipoPrecio:    f[2] || "clase",
          precio:        f[3] !== undefined && f[3] !== "" ? String(f[3]) : "15",
          colorCalendar: f[4] || "#1a73e8",
          activo:        f[5] === "SI",
          duracionMin:   f[6] !== undefined && f[6] !== "" ? String(f[6]) : "60",
        }));
      setTipos(datos);
      setHayCambios(false);
    } catch (e) {
      setError("Error al cargar tipos de curso: " + e.message);
    } finally {
      setCargando(false);
    }
  };

  const handleCambio = (idx, campo, valor) => {
    setTipos(prev => prev.map((t, i) => i === idx ? { ...t, [campo]: valor } : t));
    setHayCambios(true);
  };

  const guardarTodos = async () => {
    setError(""); setExito(""); setGuardando(true);
    try {
      for (const t of tipos) {
        const precio = parseFloat(t.precio);
        const dur    = parseInt(t.duracionMin);
        if (isNaN(precio) || precio < 0)
          return setError(`Precio inválido en "${t.nombre}"`);
        if (isNaN(dur) || dur < 1)
          return setError(`Duración inválida en "${t.nombre}"`);
      }
      const filas = tipos.map(t => [
        t.id, t.nombre, t.tipoPrecio,
        parseFloat(t.precio).toString(),
        t.colorCalendar,
        t.activo ? "SI" : "NO",
        parseInt(t.duracionMin).toString(),
      ]);
      await escribirRango("TIPOS_CURSO", `A2:G${filas.length + 1}`, filas);
      setExito("✅ Configuración guardada correctamente en Google Sheets");
      setHayCambios(false);
    } catch (e) {
      setError("Error al guardar: " + e.message);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return (
    <>
      <div className="inner-bar">
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <span className="inner-bar-title">Configuración</span>
      </div>
      <div className="loading"><div className="spinner"></div> Cargando configuración...</div>
    </>
  );

  return (
    <>
      {/* Barra superior con volver */}
      <div className="inner-bar">
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <span className="inner-bar-title">Configuración</span>
        <button className="inner-bar-action" onClick={cargarTipos}>🔄</button>
      </div>

      {error       && <div className="alerta alerta-error">{error}</div>}
      {exito       && <div className="alerta alerta-success">{exito}</div>}
      {hayCambios  && <div className="alerta alerta-warn">⚠️ Tienes cambios sin guardar</div>}

      {/* Tabla tipos de curso — todas las columnas originales */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📚 Tipos de curso · Precios · Duración</span>
        </div>
        <div className="card-body">
          <p style={{ fontSize:"13px", color:"var(--g400)", marginBottom:"14px" }}>
            Configura el precio por clase y la duración. El importe se calcula automáticamente multiplicando el número de clases por el precio unitario.
          </p>
          <div className="tabla-container">
            <table className="config-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre del curso</th>
                  <th>Tipo precio</th>
                  <th>Precio por clase (€)</th>
                  <th>Duración clase (min)</th>
                  <th>Color Calendar</th>
                  <th>Activo</th>
                </tr>
              </thead>
              <tbody>
                {tipos.map((tipo, idx) => (
                  <tr key={idx}>
                    <td style={{ fontSize:"11px", color:"var(--g400)" }}>{tipo.id}</td>
                    <td>
                      <input
                        type="text"
                        className="config-input"
                        value={tipo.nombre}
                        onChange={e => handleCambio(idx, "nombre", e.target.value)}
                        style={{ width:"150px" }}
                      />
                    </td>
                    <td>
                      <select
                        className="config-select"
                        value={tipo.tipoPrecio}
                        onChange={e => handleCambio(idx, "tipoPrecio", e.target.value)}>
                        <option value="clase">Por clase</option>
                        <option value="total">Precio fijo total</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={`config-input ${isNaN(parseFloat(tipo.precio)) ? "error" : ""}`}
                        value={tipo.precio}
                        onChange={e => handleCambio(idx, "precio", e.target.value)}
                        style={{ width:"80px", fontWeight:"600" }}
                      />
                    </td>
                    <td>
                      <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          className={`config-input ${isNaN(parseInt(tipo.duracionMin)) ? "error" : ""}`}
                          value={tipo.duracionMin}
                          onChange={e => handleCambio(idx, "duracionMin", e.target.value)}
                          style={{ width:"60px" }}
                        />
                        <span style={{ fontSize:"12px", color:"var(--g400)" }}>min</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                        <input
                          type="color"
                          className="config-color"
                          value={tipo.colorCalendar}
                          onChange={e => handleCambio(idx, "colorCalendar", e.target.value)}
                        />
                        <span style={{ fontSize:"11px", color:"var(--g400)" }}>{tipo.colorCalendar}</span>
                      </div>
                    </td>
                    <td>
                      <label style={{ display:"flex", alignItems:"center", gap:"6px", cursor:"pointer" }}>
                        <input
                          type="checkbox"
                          checked={tipo.activo}
                          onChange={e => handleCambio(idx, "activo", e.target.checked)}
                          style={{ width:"16px", height:"16px", accentColor:"var(--b500)" }}
                        />
                        <span style={{ fontSize:"13px" }}>{tipo.activo ? "✅" : "❌"}</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop:"16px", display:"flex", gap:"10px" }}>
            <button
              className="btn btn-success"
              style={{ flex:1, justifyContent:"center", opacity: hayCambios ? 1 : 0.6 }}
              onClick={guardarTodos}
              disabled={guardando || !hayCambios}>
              {guardando
                ? <><div className="spinner" style={{ width:"18px", height:"18px", borderWidth:"2px" }}></div> Guardando...</>
                : "💾 Guardar todos los cambios en Sheets"}
            </button>
            <button className="btn btn-outline" onClick={cargarTipos}>↩️ Descartar</button>
          </div>
        </div>
      </div>

      {/* Info del sistema */}
      <div className="card">
        <div className="card-header"><span className="card-title">ℹ️ Información del sistema</span></div>
        <div className="card-body">
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px", fontSize:"13px" }}>
            <div>
              <strong style={{ color:"var(--g800)" }}>Google Sheet ID:</strong>
              <br/>
              <code style={{ fontSize:"11px", color:"var(--g400)", wordBreak:"break-all" }}>
                1LHCwfVH39txuID55bSk9mRrpErdGAa9v0sRqTgI0_2A
              </code>
            </div>
            <div>
              <strong style={{ color:"var(--g800)" }}>Versión:</strong>
              <span style={{ color:"var(--g600)", marginLeft:"6px" }}>1.0.0</span>
              <br/>
              <strong style={{ color:"var(--g800)" }}>Zona horaria:</strong>
              <span style={{ color:"var(--g600)", marginLeft:"6px" }}>Europe/Madrid</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Configuracion;
