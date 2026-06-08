const SPREADSHEET_ID = "1LHCwfVH39txuID55bSk9mRrpErdGAa9v0sRqTgI0_2A";
const BASE_SHEETS    = "https://sheets.googleapis.com/v4/spreadsheets";
const BASE_CALENDAR  = "https://www.googleapis.com/calendar/v3";

const getToken = () => localStorage.getItem("google_token");
const headers  = () => ({
  "Authorization": `Bearer ${getToken()}`,
  "Content-Type":  "application/json",
});

const limpiarNumero = (v) => {
  if (v === undefined || v === null || v === "") return 0;
  const limpio = String(v).replace(/[€$\s]/g, "").replace(",", ".");
  const num = parseFloat(limpio);
  return isNaN(num) ? 0 : num;
};

// ── ID del calendario Control_Contable (caché en memoria) ────
let _calendarIdCache = null;

export async function getCalendarControlContable() {
  if (_calendarIdCache) return _calendarIdCache;
  const res  = await fetch(`${BASE_CALENDAR}/users/me/calendarList`, { headers: headers() });
  const data = await res.json();
  const cal  = (data.items || []).find(c => c.summary === "Control_Contable");
  _calendarIdCache = cal ? cal.id : null;
  return _calendarIdCache;
}

// ── Leer rango ───────────────────────────────────────────────
export async function leerRango(hoja, rango) {
  const url = `${BASE_SHEETS}/${SPREADSHEET_ID}/values/${hoja}!${rango}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Error leyendo ${hoja}!${rango}`);
  const data = await res.json();
  return data.values || [];
}

// ── Escribir rango ───────────────────────────────────────────
export async function escribirRango(hoja, rango, valores) {
  const url = `${BASE_SHEETS}/${SPREADSHEET_ID}/values/${hoja}!${rango}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ values: valores }),
  });
  if (!res.ok) throw new Error(`Error escribiendo en ${hoja}!${rango}`);
  return res.json();
}

// ── Añadir fila ──────────────────────────────────────────────
export async function añadirFila(hoja, valores) {
  const url = `${BASE_SHEETS}/${SPREADSHEET_ID}/values/${hoja}!A1:Z1000:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ values: [valores] }),
  });
  if (!res.ok) throw new Error(`Error añadiendo fila en ${hoja}`);
  return res.json();
}

// ── Obtener ID interno de hoja ───────────────────────────────
async function getSheetId(nombreHoja) {
  const url  = `${BASE_SHEETS}/${SPREADSHEET_ID}`;
  const res  = await fetch(url, { headers: headers() });
  const data = await res.json();
  const hoja = data.sheets.find(s => s.properties.title === nombreHoja);
  return hoja ? hoja.properties.sheetId : 0;
}

// ── Eliminar fila por índice (0-based) ───────────────────────
export async function eliminarFila(nombreHoja, indiceFilaConCabecera) {
  const sheetId = await getSheetId(nombreHoja);
  const url = `${BASE_SHEETS}/${SPREADSHEET_ID}:batchUpdate`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension:  "ROWS",
            startIndex: indiceFilaConCabecera,
            endIndex:   indiceFilaConCabecera + 1,
          }
        }
      }]
    }),
  });
  if (!res.ok) throw new Error("Error eliminando fila en Sheets");
  return res.json();
}

// ── Obtener tipos de curso ───────────────────────────────────
export async function getTiposCurso() {
  const filas = await leerRango("TIPOS_CURSO", "A2:G100");
  return filas
    .filter(f => f[0])
    .map(f => ({
      id:            f[0] || "",
      nombre:        f[1] || "",
      tipoPrecio:    f[2] || "clase",
      precio:        limpiarNumero(f[3]) || 15,
      colorCalendar: f[4] || "#1a73e8",
      activo:        f[5] === "SI",
      duracionMin:   parseInt(f[6]) || 60,
    }))
    .filter(t => t.activo);
}

// ── Obtener sesiones ─────────────────────────────────────────
export async function getSesiones() {
  const filas = await leerRango("SESIONES", "A2:T1000");
  return filas
    .filter(f => f[0])
    .map((f, idx) => ({
      _fila:           idx + 2,
      id:              f[0]  || "",
      fecha:           f[1]  || "",
      diaSemana:       f[2]  || "",
      semana:          f[3]  || "",
      mes:             f[4]  || "",
      año:             f[5]  || "",
      tipoCurso:       f[6]  || "",
      horaInicio1:     f[7]  || "",
      horaFin1:        f[8]  || "",
      pausa:           f[9]  || "NO",
      horaInicio2:     f[10] || "",
      horaFin2:        f[11] || "",
      horasTramo1:     limpiarNumero(f[12]),
      horasTramo2:     limpiarNumero(f[13]),
      horasTotal:      limpiarNumero(f[14]),
      tipoPrecio:      f[15] || "clase",
      precioHora:      limpiarNumero(f[16]) || 15,
      precioTotal:     limpiarNumero(f[17]),
      calendarEventId: f[18] || "",
      notas:           f[19] || "",
    }));
}

// ── Obtener pagos ────────────────────────────────────────────
export async function getPagos() {
  const filas = await leerRango("PAGOS", "A2:G500");
  return filas
    .filter(f => f[0])
    .map((f, idx) => ({
      _fila:    idx + 2,
      id:       f[0] || "",
      fecha:    f[1] || "",
      mes:      f[2] || "",
      año:      f[3] || "",
      importe:  limpiarNumero(f[4]),
      concepto: f[5] || "",
      notas:    f[6] || "",
    }));
}

// ── Guardar sesión ───────────────────────────────────────────
export async function guardarSesion(sesion) {
  return añadirFila("SESIONES", [
    sesion.id,          sesion.fecha,        sesion.diaSemana,
    sesion.semana,      sesion.mes,          sesion.año,
    sesion.tipoCurso,   sesion.horaInicio1,  sesion.horaFin1,
    sesion.pausa,       sesion.horaInicio2  || "",
    sesion.horaFin2     || "",
    sesion.horasTramo1, sesion.horasTramo2  || 0,
    sesion.horasTotal,  sesion.tipoPrecio,
    sesion.precioHora,  sesion.precioTotal,
    sesion.calendarEventId || "",
    sesion.notas           || "",
  ]);
}

// ── Actualizar sesión existente ──────────────────────────────
export async function actualizarSesion(sesion) {
  const fila = sesion._fila;
  return escribirRango("SESIONES", `A${fila}:T${fila}`, [[
    sesion.id,          sesion.fecha,        sesion.diaSemana,
    sesion.semana,      sesion.mes,          sesion.año,
    sesion.tipoCurso,   sesion.horaInicio1,  sesion.horaFin1,
    sesion.pausa,       sesion.horaInicio2  || "",
    sesion.horaFin2     || "",
    sesion.horasTramo1, sesion.horasTramo2  || 0,
    sesion.horasTotal,  sesion.tipoPrecio,
    sesion.precioHora,  sesion.precioTotal,
    sesion.calendarEventId || "",
    sesion.notas           || "",
  ]]);
}

// ── Guardar pago ─────────────────────────────────────────────
export async function guardarPago(pago) {
  return añadirFila("PAGOS", [
    pago.id, pago.fecha, pago.mes, pago.año,
    pago.importe, pago.concepto, pago.notas || "",
  ]);
}

// ── Actualizar pago existente ────────────────────────────────
export async function actualizarPago(pago) {
  const fila = pago._fila;
  return escribirRango("PAGOS", `A${fila}:G${fila}`, [[
    pago.id, pago.fecha, pago.mes, pago.año,
    pago.importe, pago.concepto, pago.notas || "",
  ]]);
}

// ── Crear evento en Control_Contable ─────────────────────────
export async function crearEventoCalendar({ titulo, fecha, horaInicio, horaFin, color, descripcion }) {
  const colorMap = {
    "#4285F4":"1","#EA4335":"11","#FBBC04":"5",
    "#34A853":"2","#FF6D00":"6", "#46BDC6":"7",
    "#7B61FF":"9","#E91E63":"4", "#795548":"8",
  };
  const calendarId = await getCalendarControlContable();
  if (!calendarId) throw new Error("No se encontró el calendario Control_Contable");

  const evento = {
    summary:     titulo,
    description: descripcion || "",
    start: { dateTime: `${fecha}T${horaInicio}:00`, timeZone: "Europe/Madrid" },
    end:   { dateTime: `${fecha}T${horaFin}:00`,    timeZone: "Europe/Madrid" },
    colorId: colorMap[color?.toUpperCase()] || "1",
  };

  const res = await fetch(
    `${BASE_CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", headers: headers(), body: JSON.stringify(evento) }
  );
  if (!res.ok) throw new Error("Error creando evento en Control_Contable");
  const data = await res.json();
  return data.id;
}

// ── Actualizar evento existente en Control_Contable ──────────
export async function actualizarEventoCalendar({ eventId, titulo, fecha, horaInicio, horaFin, color, descripcion }) {
  const colorMap = {
    "#4285F4":"1","#EA4335":"11","#FBBC04":"5",
    "#34A853":"2","#FF6D00":"6", "#46BDC6":"7",
    "#7B61FF":"9","#E91E63":"4", "#795548":"8",
  };
  const calendarId = await getCalendarControlContable();
  if (!calendarId) throw new Error("No se encontró el calendario Control_Contable");

  const evento = {
    summary:     titulo,
    description: descripcion || "",
    start: { dateTime: `${fecha}T${horaInicio}:00`, timeZone: "Europe/Madrid" },
    end:   { dateTime: `${fecha}T${horaFin}:00`,    timeZone: "Europe/Madrid" },
    colorId: colorMap[color?.toUpperCase()] || "1",
  };

  const res = await fetch(
    `${BASE_CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    { method: "PUT", headers: headers(), body: JSON.stringify(evento) }
  );

  // Si el evento no existe (fue eliminado en Calendar), crear uno nuevo
  if (res.status === 404) {
    return crearEventoCalendar({ titulo, fecha, horaInicio, horaFin, color, descripcion });
  }
  if (!res.ok) throw new Error("Error actualizando evento en Calendar");
  const data = await res.json();
  return data.id;
}

// ── Eliminar evento de Control_Contable ──────────────────────
export async function eliminarEventoCalendar(eventId) {
  if (!eventId) return;
  const calendarId = await getCalendarControlContable();
  if (!calendarId) return;
  const ids = eventId.split(",").filter(Boolean);
  for (const id of ids) {
    try {
      await fetch(
        `${BASE_CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events/${id.trim()}`,
        { method: "DELETE", headers: headers() }
      );
    } catch (e) {
      console.warn("No se pudo eliminar evento Calendar:", id);
    }
  }
}

// ── Leer eventos de Control_Contable ─────────────────────────
export async function getEventosCalendar(calendarId) {
  const ahora    = new Date();
  const hace1año = new Date(ahora.getFullYear() - 1, 0, 1).toISOString();
  const url = `${BASE_CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${hace1año}&maxResults=500&singleEvents=true&orderBy=startTime`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error("Error leyendo eventos de Calendar");
  const data = await res.json();
  return data.items || [];
}

// ── Generar ID único ─────────────────────────────────────────
export function generarId(prefijo = "S") {
  const ahora = new Date();
  return `${prefijo}${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,"0")}${String(ahora.getDate()).padStart(2,"0")}_${Date.now().toString().slice(-6)}`;
}