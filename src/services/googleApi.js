// ============================================================
// services/googleApi.js
// Servicio central para todas las llamadas a Google Sheets y Calendar
// ============================================================

const SPREADSHEET_ID = '1LHCwfVH39txuID55bSk9mRrpErdGAa9v0sRqTgI0_2A';
const BASE_SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const BASE_CALENDAR = 'https://www.googleapis.com/calendar/v3';

// Obtener token guardado
const getToken = () => localStorage.getItem('google_token');

// Headers comunes
const headers = () => ({
  'Authorization': `Bearer ${getToken()}`,
  'Content-Type': 'application/json',
});

// ── SHEETS: Leer rango ───────────────────────────────────────
export async function leerRango(hoja, rango) {
  const url = `${BASE_SHEETS}/${SPREADSHEET_ID}/values/${hoja}!${rango}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Error leyendo ${hoja}!${rango}`);
  const data = await res.json();
  return data.values || [];
}

// ── SHEETS: Escribir en rango ────────────────────────────────
export async function escribirRango(hoja, rango, valores) {
  const url = `${BASE_SHEETS}/${SPREADSHEET_ID}/values/${hoja}!${rango}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ values: valores }),
  });
  if (!res.ok) throw new Error(`Error escribiendo en ${hoja}!${rango}`);
  return res.json();
}

// ── SHEETS: Añadir fila al final ─────────────────────────────
export async function añadirFila(hoja, valores) {
  const url = `${BASE_SHEETS}/${SPREADSHEET_ID}/values/${hoja}!A1:Z1000:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ values: [valores] }),
  });
  if (!res.ok) throw new Error(`Error añadiendo fila en ${hoja}`);
  return res.json();
}

// ── SHEETS: Obtener todos los tipos de curso ─────────────────
export async function getTiposCurso() {
  const filas = await leerRango('TIPOS_CURSO', 'A2:F100');
  return filas.map(f => ({
    id:             f[0] || '',
    nombre:         f[1] || '',
    tipoPrecio:     f[2] || 'hora',
    precio:         parseFloat(f[3]) || 15,
    colorCalendar:  f[4] || '#1a73e8',
    activo:         f[5] === 'SI',
  })).filter(t => t.activo);
}

// ── SHEETS: Obtener sesiones ─────────────────────────────────
export async function getSesiones() {
  const filas = await leerRango('SESIONES', 'A2:T1000');
  return filas
    .filter(f => f[0]) // Filtrar filas vacías
    .map(f => ({
      id:              f[0]  || '',
      fecha:           f[1]  || '',
      diaSemana:       f[2]  || '',
      semana:          f[3]  || '',
      mes:             f[4]  || '',
      año:             f[5]  || '',
      tipoCurso:       f[6]  || '',
      horaInicio1:     f[7]  || '',
      horaFin1:        f[8]  || '',
      pausa:           f[9]  || 'NO',
      horaInicio2:     f[10] || '',
      horaFin2:        f[11] || '',
      horasTramo1:     parseFloat(f[12]) || 0,
      horasTramo2:     parseFloat(f[13]) || 0,
      horasTotal:      parseFloat(f[14]) || 0,
      tipoPrecio:      f[15] || 'hora',
      precioHora:      parseFloat(f[16]) || 15,
      precioTotal:     parseFloat(f[17]) || 0,
      calendarEventId: f[18] || '',
      notas:           f[19] || '',
    }));
}

// ── SHEETS: Obtener pagos ────────────────────────────────────
export async function getPagos() {
  const filas = await leerRango('PAGOS', 'A2:G500');
  return filas
    .filter(f => f[0])
    .map(f => ({
      id:       f[0] || '',
      fecha:    f[1] || '',
      mes:      f[2] || '',
      año:      f[3] || '',
      importe:  parseFloat(f[4]) || 0,
      concepto: f[5] || '',
      notas:    f[6] || '',
    }));
}

// ── SHEETS: Guardar sesión ───────────────────────────────────
export async function guardarSesion(sesion) {
  const fila = [
    sesion.id,
    sesion.fecha,
    sesion.diaSemana,
    sesion.semana,
    sesion.mes,
    sesion.año,
    sesion.tipoCurso,
    sesion.horaInicio1,
    sesion.horaFin1,
    sesion.pausa,
    sesion.horaInicio2 || '',
    sesion.horaFin2 || '',
    sesion.horasTramo1,
    sesion.horasTramo2 || 0,
    sesion.horasTotal,
    sesion.tipoPrecio,
    sesion.precioHora,
    sesion.precioTotal,
    sesion.calendarEventId || '',
    sesion.notas || '',
  ];
  return añadirFila('SESIONES', fila);
}

// ── SHEETS: Guardar pago ─────────────────────────────────────
export async function guardarPago(pago) {
  const fila = [
    pago.id,
    pago.fecha,
    pago.mes,
    pago.año,
    pago.importe,
    pago.concepto,
    pago.notas || '',
  ];
  return añadirFila('PAGOS', fila);
}

// ── CALENDAR: Crear evento ───────────────────────────────────
export async function crearEventoCalendar({ titulo, fecha, horaInicio, horaFin, color, descripcion }) {
  // Convertir color hex a colorId de Google Calendar
  const colorId = hexToCalendarColor(color);

  const evento = {
    summary: titulo,
    description: descripcion || '',
    start: {
      dateTime: `${fecha}T${horaInicio}:00`,
      timeZone: 'Europe/Madrid',
    },
    end: {
      dateTime: `${fecha}T${horaFin}:00`,
      timeZone: 'Europe/Madrid',
    },
    colorId,
  };

  const res = await fetch(`${BASE_CALENDAR}/calendars/primary/events`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(evento),
  });

  if (!res.ok) throw new Error('Error creando evento en Google Calendar');
  const data = await res.json();
  return data.id;
}

// ── Helper: convertir color hex a colorId de Calendar ────────
function hexToCalendarColor(hex) {
  const mapa = {
    '#4285F4': '1',  // Azul
    '#EA4335': '11', // Rojo
    '#FBBC04': '5',  // Amarillo
    '#34A853': '2',  // Verde
    '#FF6D00': '6',  // Naranja
    '#46BDC6': '7',  // Turquesa
    '#7B61FF': '9',  // Morado
    '#E91E63': '4',  // Rosa
    '#795548': '8',  // Marrón
    '#607D8B': '8',  // Gris azulado
  };
  return mapa[hex?.toUpperCase()] || '1';
}

// ── Generar ID único ─────────────────────────────────────────
export function generarId(prefijo = 'S') {
  const ahora = new Date();
  return `${prefijo}${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}_${Date.now().toString().slice(-6)}`;
}