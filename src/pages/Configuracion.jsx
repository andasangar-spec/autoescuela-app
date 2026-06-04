import React, { useEffect, useState } from "react";
import { leerRango, escribirRango } from "../services/googleApi";

function Configuracion() {
  const [tipos, setTipos]         = useState([]);
  const [cargando, setCargando]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState("");
  const [exito, setExito]         = useState("");
  const [hayCambios, setHayCambios] = useState(false);

  useEffect(() => { cargarTipos(); }, []);

  const cargarTipos = async () => {
    setCargando(true);
    setError("");
    try {
      const filas = await leerRango("TIPOS_CURSO", "A2:F30");
      const datos = filas
        .filter(f => f[0])
        .map(f => ({
          id:            f[0] || "",
          nombre:        f[1] || "",
          tipoPrecio:    f[2] || "hora",
          precio:        f[3] !== undefined && f[3] !== "" ? parseFloat(f[3]) : 15,
          colorCalendar: f[4] || "#1a73e8",
          activo:        f[5] === "SI",
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
    setTipos(prev => prev.map((t, i) => {
      if (i !== idx) return t;
      // Asegurar que precio siempre es número válido
      if (campo === "precio") {
        const num = parseFloat(valor);
        return { ...t, [campo]: isNaN(num) ? 0 : num };
      }
      return { ...t, [campo]: valor };
    }));
    setHayCambios(true);
  };

  const guardarTodos = async () => {
    setError(""); setExito(""); setGuardando(true);
    try {
      // Validar que todos los precios son números válidos
      const hayErrores = tipos.some(t => isNaN(t.precio) || t.precio < 0);
      if (hayErrores) return setError("Hay precios inválidos. Revisa los valores.");

      const filas = tipos.map(t => [
        t.id,
        t.nombre,
        t.tipoPrecio,
        t.precio.toString(), // Enviar como string para evitar conversiones
        t.colorCalendar,
        t.activo ? "SI" : "NO",
      ]);

      await escribirRango("TIPOS_CURSO", `A2:F${filas.length + 1}`, filas);
      setExito("✅ Configuración guardada correctamente en Google Sheets");
      setHayCambios(false);
    } catch (e) {
      setError("Error al guardar: " + e.message);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <div className="loading"><div className="spinner"></div> Cargando configuración...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>⚙️ Configuración</h1>
        <button className="btn btn-outline" onClick={cargarTipos}>🔄 Recargar</button>
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}
      {exito && <div className="alerta alerta-success">{exito}</div>}

      {hayCambios && (
        <div className="alerta" style={{ background:"#fff8e1", borderLeft:"4px solid #fbbc04", color:"#e65100" }}>
          ⚠️ Tienes cambios sin guardar
        </div>
      )}

      <div className="card">
        <div className="card-title">📚 Tipos de curso / clase y precios</div>
        <p style={{ fontSize:"13px", color:"#666", marginBottom:"16px" }}>
          Modifica el nombre, precio y configuración de cada tipo de clase.
        </p>

        <div style={{ overflowX:"auto" }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre del curso</th>
                <th>Tipo precio</th>
                <th>Precio (€)</th>
                <th>Color Calendar</th>
                <th>Activo</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((tipo, idx) => (
                <tr key={idx}>
                  <td style={{ fontSize:"12px", color:"#999" }}>{tipo.id}</td>
                  <td>
                    <input
                      type="text"
                      value={tipo.nombre}
                      onChange={e => handleCambio(idx, "nombre", e.target.value)}
                      style={{ border:"1px solid #e0e0e0", borderRadius:"6px", padding:"6px 10px", width:"160px", fontSize:"14px" }}
                    />
                  </td>
                  <td>
                    <select
                      value={tipo.tipoPrecio}
                      onChange={e => handleCambio(idx, "tipoPrecio", e.target.value)}
                      style={{ border:"1px solid #e0e0e0", borderRadius:"6px", padding:"6px 10px", fontSize:"14px" }}
                    >
                      <option value="hora">Por hora</option>
                      <option value="total">Precio fijo</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={tipo.precio}
                      onChange={e => handleCambio(idx, "precio", e.target.value)}
                      min="0"
                      step="0.5"
                      style={{
                        border: isNaN(tipo.precio) ? "2px solid #ea4335" : "1px solid #e0e0e0",
                        borderRadius:"6px",
                        padding:"6px 10px",
                        width:"90px",
                        fontSize:"14px",
                        fontWeight:"600",
                      }}
                    />
                  </td>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                      <input
                        type="color"
                        value={tipo.colorCalendar}
                        onChange={e => handleCambio(idx, "colorCalendar", e.target.value)}
                        style={{ width:"36px", height:"32px", cursor:"pointer", border:"none" }}
                      />
                      <span style={{ fontSize:"12px", color:"#999" }}>{tipo.colorCalendar}</span>
                    </div>
                  </td>
                  <td>
                    <label style={{ display:"flex", alignItems:"center", gap:"6px", cursor:"pointer" }}>
                      <input
                        type="checkbox"
                        checked={tipo.activo}
                        onChange={e => handleCambio(idx, "activo", e.target.checked)}
                        style={{ width:"16px", height:"16px" }}
                      />
                      {tipo.activo ? "✅" : "❌"}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop:"20px", display:"flex", gap:"12px" }}>
          <button
            className="btn btn-success"
            onClick={guardarTodos}
            disabled={guardando || !hayCambios}
            style={{ flex:1, justifyContent:"center", padding:"14px", opacity: hayCambios ? 1 : 0.6 }}
          >
            {guardando
              ? <><div className="spinner" style={{ width:"18px",height:"18px",borderWidth:"2px" }}></div> Guardando...</>
              : "💾 Guardar todos los cambios en Sheets"
            }
          </button>
          <button className="btn btn-outline" onClick={cargarTipos}>
            ↩️ Descartar
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">ℹ️ Información del sistema</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", fontSize:"13px" }}>
          <div>
            <strong>Google Sheet ID:</strong><br/>
            <code style={{ fontSize:"11px", color:"#666", wordBreak:"break-all" }}>
              1LHCwfVH39txuID55bSk9mRrpErdGAa9v0sRqTgI0_2A
            </code>
          </div>
          <div>
            <strong>Versión:</strong> 1.0.0<br/>
            <strong>Zona horaria:</strong> Europe/Madrid
          </div>
        </div>
      </div>
    </div>
  );
}

export default Configuracion;