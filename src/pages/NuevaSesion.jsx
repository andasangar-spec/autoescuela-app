// ============================================================
// pages/NuevaSesion.jsx
// Formulario de entrada de datos de una sesión/clase
// ============================================================

import React, { useEffect, useState } from 'react';
import { getTiposCurso, guardarSesion, crearEventoCalendar, generarId } from '../services/googleApi';
import { getWeek, getMonth, getYear, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

// Generar opciones de tiempo cada 15 minutos
const generarHoras = () => {
  const horas = [];
  for (let h = 5; h <= 22; h++) {
    for (let m = 0; m < 60; m += 15) {
      horas.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    }
  }
  return horas;
};
const HORAS = generarHoras();

// Calcular diferencia en horas entre dos strings HH:MM
const calcularHoras = (inicio, fin) => {
  if (!inicio || !fin) return 0;
  const [h1, m1] = inicio.split(':').map(Number);
  const [h2, m2] = fin.split(':').map(Number);
  const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  return Math.max(0, mins / 60);
};

const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function NuevaSesion() {
  const [tipos, setTipos]           = useState([]);
  const [cargando, setCargando]     = useState(false);
  const [guardando, setGuardando]   = useState(false);
  const [exito, setExito]           = useState('');
  const [error, setError]           = useState('');
  const [hasPausa, setHasPausa]     = useState(false);

  // Estado del formulario
  const [form, setForm] = useState({
    fecha:       format(new Date(), 'yyyy-MM-dd'),
    tipoCurso:   '',
    horaInicio1: '09:00',
    horaFin1:    '14:00',
    horaInicio2: '16:00',
    horaFin2:    '19:00',
    tipoPrecio:  'hora',
    precioHora:  15,
    precioFijo:  0,
    notas:       '',
  });

  useEffect(() => {
    cargarTipos();
  }, []);

  const cargarTipos = async () => {
    setCargando(true);
    try {
      const t = await getTiposCurso();
      setTipos(t);
      if (t.length > 0) {
        setForm(f => ({
          ...f,
          tipoCurso: t[0].nombre,
          tipoPrecio: t[0].tipoPrecio,
          precioHora: t[0].precio,
        }));
      }
    } catch (e) {
      setError('Error cargando tipos de curso');
    } finally {
      setCargando(false);
    }
  };

  const handleCursoChange = (nombre) => {
    const tipo = tipos.find(t => t.nombre === nombre);
    if (tipo) {
      setForm(f => ({
        ...f,
        tipoCurso: nombre,
        tipoPrecio: tipo.tipoPrecio,
        precioHora: tipo.precio,
        precioFijo: tipo.tipoPrecio === 'total' ? tipo.precio : 0,
      }));
    }
  };

  const handleChange = (campo, valor) => {
    setForm(f => ({ ...f, [campo]: valor }));
  };

  // Calcular horas y precio en tiempo real
  const horasTramo1 = calcularHoras(form.horaInicio1, form.horaFin1);
  const horasTramo2 = hasPausa ? calcularHoras(form.horaInicio2, form.horaFin2) : 0;
  const horasTotal  = horasTramo1 + horasTramo2;

  const tipoActual = tipos.find(t => t.nombre === form.tipoCurso);
  const precioTotal = form.tipoPrecio === 'hora'
    ? horasTotal * parseFloat(form.precioHora)
    : parseFloat(form.precioFijo || 0);

  const fechaObj = parseISO(form.fecha);
  const diaSemana = diasSemana[fechaObj.getDay()];
  const semana    = getWeek(fechaObj, { weekStartsOn: 1 });
  const mes       = getMonth(fechaObj) + 1;
  const año       = getYear(fechaObj);

  const handleGuardar = async () => {
    setError('');
    setExito('');

    // Validaciones
    if (!form.tipoCurso) return setError('Selecciona un tipo de curso');
    if (horasTramo1 <= 0) return setError('La hora de fin debe ser posterior a la de inicio');
    if (hasPausa && horasTramo2 <= 0) return setError('La hora de fin del tramo 2 debe ser posterior a la de inicio');

    setGuardando(true);
    try {
      // Crear eventos en Google Calendar
      let eventId1 = '';
      let eventId2 = '';

      const colorCurso = tipoActual?.colorCalendar || '#1a73e8';
      const descripcion = `${form.tipoCurso} | ${horasTotal.toFixed(2)}h | ${precioTotal.toFixed(2)}€${form.notas ? '\n' + form.notas : ''}`;

      // Evento tramo 1
      eventId1 = await crearEventoCalendar({
        titulo: `🚗 ${form.tipoCurso} (${horasTramo1.toFixed(2)}h)`,
        fecha: form.fecha,
        horaInicio: form.horaInicio1,
        horaFin: form.horaFin1,
        color: colorCurso,
        descripcion,
      });

      // Evento tramo 2 si hay pausa
      if (hasPausa && horasTramo2 > 0) {
        eventId2 = await crearEventoCalendar({
          titulo: `🚗 ${form.tipoCurso} (${horasTramo2.toFixed(2)}h)`,
          fecha: form.fecha,
          horaInicio: form.horaInicio2,
          horaFin: form.horaFin2,
          color: colorCurso,
          descripcion,
        });
      }

      // Guardar en Google Sheets
      const sesion = {
        id:              generarId('S'),
        fecha:           format(fechaObj, 'dd/MM/yyyy'),
        diaSemana,
        semana,
        mes,
        año,
        tipoCurso:       form.tipoCurso,
        horaInicio1:     form.horaInicio1,
        horaFin1:        form.horaFin1,
        pausa:           hasPausa ? 'SI' : 'NO',
        horaInicio2:     hasPausa ? form.horaInicio2 : '',
        horaFin2:        hasPausa ? form.horaFin2 : '',
        horasTramo1:     horasTramo1.toFixed(2),
        horasTramo2:     horasTramo2.toFixed(2),
        horasTotal:      horasTotal.toFixed(2),
        tipoPrecio:      form.tipoPrecio,
        precioHora:      parseFloat(form.precioHora),
        precioTotal:     precioTotal.toFixed(2),
        calendarEventId: eventId1 + (eventId2 ? ',' + eventId2 : ''),
        notas:           form.notas,
      };

      await guardarSesion(sesion);

      setExito(`✅ Sesión guardada correctamente en Sheets y Calendar`);

      // Resetear formulario
      setForm(f => ({
        ...f,
        fecha: format(new Date(), 'yyyy-MM-dd'),
        notas: '',
      }));
      setHasPausa(false);

    } catch (e) {
      setError('Error al guardar: ' + e.message);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <div className="loading"><div className="spinner"></div> Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>➕ Nueva sesión</h1>
      </div>

      {exito && <div className="alerta alerta-success">{exito}</div>}
      {error && <div className="alerta alerta-error">{error}</div>}

      {/* ── Información básica ─────────────────────────────── */}
      <div className="card">
        <div className="card-title">📅 Información básica</div>

        <div className="form-row">
          <div className="form-group">
            <label>Fecha</label>
            <input
              type="date"
              className="form-control"
              value={form.fecha}
              onChange={e => handleChange('fecha', e.target.value)}
            />
            {form.fecha && (
              <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
                {diaSemana} — Semana {semana}
              </small>
            )}
          </div>

          <div className="form-group">
            <label>Tipo de curso / clase</label>
            <select
              className="form-control"
              value={form.tipoCurso}
              onChange={e => handleCursoChange(e.target.value)}
            >
              {tipos.map(t => (
                <option key={t.id} value={t.nombre}>{t.nombre}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Horario Tramo 1 ────────────────────────────────── */}
      <div className="card">
        <div className="card-title">🕐 Horario — Tramo 1</div>

        <div className="form-row">
          <div className="form-group">
            <label>Hora de inicio</label>
            <select
              className="form-control"
              value={form.horaInicio1}
              onChange={e => handleChange('horaInicio1', e.target.value)}
            >
              {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Hora de fin</label>
            <select
              className="form-control"
              value={form.horaFin1}
              onChange={e => handleChange('horaFin1', e.target.value)}
            >
              {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>

        {horasTramo1 > 0 && (
          <div style={{ background: '#e8f0fe', padding: '8px 12px', borderRadius: '8px', fontSize: '14px', color: '#1557b0' }}>
            ⏱️ Tramo 1: <strong>{horasTramo1.toFixed(2)} horas</strong>
          </div>
        )}
      </div>

      {/* ── Pausa ─────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: hasPausa ? '16px' : '0' }}>
          <input
            type="checkbox"
            id="pausa"
            checked={hasPausa}
            onChange={e => setHasPausa(e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
          <label htmlFor="pausa" style={{ cursor: 'pointer', fontWeight: '600', fontSize: '15px' }}>
            ☕ Añadir pausa en medio
          </label>
        </div>

        {hasPausa && (
          <div className="pausa-section">
            <div className="card-title" style={{ color: '#e65100' }}>🕐 Horario — Tramo 2 (tras la pausa)</div>
            <div className="form-row">
              <div className="form-group">
                <label>Hora de inicio</label>
                <select
                  className="form-control"
                  value={form.horaInicio2}
                  onChange={e => handleChange('horaInicio2', e.target.value)}
                >
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Hora de fin</label>
                <select
                  className="form-control"
                  value={form.horaFin2}
                  onChange={e => handleChange('horaFin2', e.target.value)}
                >
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
            {horasTramo2 > 0 && (
              <div style={{ background: '#fff3e0', padding: '8px 12px', borderRadius: '8px', fontSize: '14px', color: '#e65100' }}>
                ⏱️ Tramo 2: <strong>{horasTramo2.toFixed(2)} horas</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Precio ────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">💰 Precio</div>

        <div className="form-group">
          <label>Tipo de precio</label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                value="hora"
                checked={form.tipoPrecio === 'hora'}
                onChange={() => handleChange('tipoPrecio', 'hora')}
              />
              Por hora
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                value="total"
                checked={form.tipoPrecio === 'total'}
                onChange={() => handleChange('tipoPrecio', 'total')}
              />
              Precio fijo total
            </label>
          </div>
        </div>

        {form.tipoPrecio === 'hora' ? (
          <div className="form-group">
            <label>Precio por hora (€)</label>
            <input
              type="number"
              className="form-control"
              value={form.precioHora}
              onChange={e => handleChange('precioHora', e.target.value)}
              min="0"
              step="0.5"
            />
          </div>
        ) : (
          <div className="form-group">
            <label>Precio total del curso (€)</label>
            <input
              type="number"
              className="form-control"
              value={form.precioFijo}
              onChange={e => handleChange('precioFijo', e.target.value)}
              min="0"
              step="5"
            />
          </div>
        )}

        {/* Resumen */}
        <div style={{
          background: 'linear-gradient(135deg, #e8f0fe, #d2e3fc)',
          borderRadius: '12px',
          padding: '16px',
          marginTop: '8px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: '#1557b0' }}>
                {horasTotal.toFixed(2)} h
              </div>
              <div style={{ fontSize: '12px', color: '#5f6368' }}>Total horas</div>
            </div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: '#34a853' }}>
                {precioTotal.toFixed(2)} €
              </div>
              <div style={{ fontSize: '12px', color: '#5f6368' }}>Total a cobrar</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Notas ─────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">📝 Notas (opcional)</div>
        <textarea
          className="form-control"
          rows={3}
          placeholder="Observaciones, alumno, etc."
          value={form.notas}
          onChange={e => handleChange('notas', e.target.value)}
        />
      </div>

      {/* ── Botón guardar ─────────────────────────────────── */}
      <button
        className="btn btn-success"
        onClick={handleGuardar}
        disabled={guardando}
        style={{ width: '100%', justifyContent: 'center', padding: '16px', fontSize: '16px' }}
      >
        {guardando
          ? <><div className="spinner" style={{ width:'18px',height:'18px',borderWidth:'2px' }}></div> Guardando...</>
          : '💾 Guardar sesión en Sheets y Calendar'
        }
      </button>
    </div>
  );
}

export default NuevaSesion;
