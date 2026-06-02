// ============================================================
// pages/Sesiones.jsx
// Lista de todas las sesiones con filtros por semana/mes
// ============================================================

import React, { useEffect, useState } from 'react';
import { getSesiones } from '../services/googleApi';

function Sesiones() {
  const [sesiones, setSesiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState('');
  const [filtro, setFiltro]     = useState('mes');
  const [mesSelec, setMesSelec] = useState(new Date().getMonth() + 1);
  const [añoSelec, setAñoSelec] = useState(new Date().getFullYear());

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setCargando(true);
    setError('');
    try {
      const s = await getSesiones();
      setSesiones(s);
    } catch (e) {
      setError('Error al cargar sesiones');
    } finally {
      setCargando(false);
    }
  };

  const sesionesFiltradas = sesiones.filter(s => {
    if (filtro === 'mes') {
      return parseInt(s.mes) === mesSelec && parseInt(s.año) === añoSelec;
    }
    return parseInt(s.año) === añoSelec;
  }).sort((a, b) => b.fecha.localeCompare(a.fecha));

  const totalHoras  = sesionesFiltradas.reduce((acc, s) => acc + (parseFloat(s.horasTotal) || 0), 0);
  const totalImporte = sesionesFiltradas.reduce((acc, s) => acc + (parseFloat(s.precioTotal) || 0), 0);

  const formatEur = n => `${n.toFixed(2).replace('.', ',')} €`;
  const formatH   = n => `${n.toFixed(2).replace('.', ',')} h`;

  if (cargando) return <div className="loading"><div className="spinner"></div> Cargando sesiones...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>📋 Mis sesiones</h1>
        <button className="btn btn-outline" onClick={cargarDatos}>🔄 Actualizar</button>
      </div>

      {error && <div className="alerta alerta-error">{error}</div>}

      {/* Filtros */}
      <div className="card">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn ${filtro === 'mes' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFiltro('mes')}
            >
              Por mes
            </button>
            <button
              className={`btn ${filtro === 'año' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFiltro('año')}
            >
              Año completo
            </button>
          </div>

          {filtro === 'mes' && (
            <select
              className="form-control"
              style={{ width: 'auto' }}
              value={mesSelec}
              onChange={e => setMesSelec(parseInt(e.target.value))}
            >
              {meses.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          )}

          <select
            className="form-control"
            style={{ width: 'auto' }}
            value={añoSelec}
            onChange={e => setAñoSelec(parseInt(e.target.value))}
          >
            {[2024, 2025, 2026, 2027].map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Totales del filtro */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
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

      {/* Tabla */}
      <div className="card">
        {sesionesFiltradas.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#999', padding: '32px' }}>
            No hay sesiones en este período
          </p>
        ) : (
          <div className="tabla-container">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Día</th>
                  <th>Tipo</th>
                  <th>Horario</th>
                  <th>Pausa</th>
                  <th>Horas</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                {sesionesFiltradas.map((s, i) => (
                  <tr key={i}>
                    <td><strong>{s.fecha}</strong></td>
                    <td>{s.diaSemana}</td>
                    <td>
                      <span className="badge" style={{ background: '#1a73e8' }}>
                        {s.tipoCurso}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px' }}>
                      {s.horaInicio1}–{s.horaFin1}
                      {s.pausa === 'SI' && (
                        <span style={{ color: '#e65100' }}> / {s.horaInicio2}–{s.horaFin2}</span>
                      )}
                    </td>
                    <td>{s.pausa === 'SI' ? '☕ Sí' : '—'}</td>
                    <td><strong>{formatH(parseFloat(s.horasTotal))}</strong></td>
                    <td><strong style={{ color: '#34a853' }}>{formatEur(parseFloat(s.precioTotal))}</strong></td>
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
