const db = require('../db');
const { date, text } = require('./validation');
const { ServiceError } = require('./errors');
const settings = require('./settings');

const DAYS = new Set([0, 1, 2, 3, 4, 5, 6]);

function time(value, label = 'Hora') {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new ServiceError(`${label} inválida`);
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

async function activeBarber(tenantId, barberId) {
  const barber = await db.prepare('SELECT id,nombre FROM barberia_barberos WHERE id=? AND tenant_id=? AND activo=1').get(barberId, tenantId);
  if (!barber) throw new ServiceError('Selecciona un barbero activo de tu negocio', 404);
  return barber;
}

async function list(tenantId) {
  return {
    horarios: await db.prepare(`SELECT h.*,b.nombre AS barbero_nombre
      FROM barberia_horarios h JOIN barberia_barberos b ON b.id=h.barbero_id AND b.tenant_id=h.tenant_id
      WHERE h.tenant_id=? ORDER BY b.nombre,h.dia_semana`).all(tenantId),
    bloqueos: await db.prepare(`SELECT bl.*,b.nombre AS barbero_nombre
      FROM barberia_bloqueos bl JOIN barberia_barberos b ON b.id=bl.barbero_id AND b.tenant_id=bl.tenant_id
      WHERE bl.tenant_id=? ORDER BY bl.fecha ASC,bl.hora_inicio ASC,bl.id ASC`).all(tenantId),
  };
}

function normalizeSchedule(rows) {
  if (!Array.isArray(rows) || rows.length !== 7) throw new ServiceError('Configura los siete días de la semana');
  const byDay = new Map();
  for (const row of rows) {
    const day = Number(row?.dia_semana);
    if (!Number.isInteger(day) || !DAYS.has(day) || byDay.has(day)) throw new ServiceError('Horario semanal inválido');
    const active = row.activo === true || row.activo === 1 || row.activo === '1';
    if (active) {
      const start = time(row.hora_inicio, 'Hora de inicio');
      const end = time(row.hora_fin, 'Hora de cierre');
      if (end <= start) throw new ServiceError('La hora de cierre debe ser posterior a la de inicio');
    }
    byDay.set(day, {
      dia_semana: day,
      activo: active ? 1 : 0,
      hora_inicio: active ? row.hora_inicio : null,
      hora_fin: active ? row.hora_fin : null,
    });
  }
  return [...byDay.values()].sort((a, b) => a.dia_semana - b.dia_semana);
}

async function setSchedule(tenantId, barberId, rows) {
  await activeBarber(tenantId, barberId);
  const schedule = normalizeSchedule(rows);
  await db.transaction(async () => {
    const save = db.prepare(`INSERT INTO barberia_horarios(tenant_id,barbero_id,dia_semana,hora_inicio,hora_fin,activo)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(tenant_id,barbero_id,dia_semana) DO UPDATE SET
        hora_inicio=excluded.hora_inicio,hora_fin=excluded.hora_fin,activo=excluded.activo`);
    for (const row of schedule) await save.run(tenantId, barberId, row.dia_semana, row.hora_inicio, row.hora_fin, row.activo);
  }).immediate();
  return db.prepare('SELECT * FROM barberia_horarios WHERE tenant_id=? AND barbero_id=? ORDER BY dia_semana').all(tenantId, barberId);
}

async function createBlock(tenantId, data = {}) {
  const barberId = Number(data.barbero_id);
  if (!Number.isInteger(barberId) || barberId < 1) throw new ServiceError('Barbero inválido');
  await activeBarber(tenantId, barberId);
  const blockDate = date(data.fecha);
  const hasStart = data.hora_inicio !== undefined && data.hora_inicio !== null && data.hora_inicio !== '';
  const hasEnd = data.hora_fin !== undefined && data.hora_fin !== null && data.hora_fin !== '';
  if (hasStart !== hasEnd) throw new ServiceError('Indica ambas horas o deja el bloqueo como día completo');
  if (hasStart && time(data.hora_fin, 'Hora final') <= time(data.hora_inicio, 'Hora de inicio')) {
    throw new ServiceError('La hora final debe ser posterior a la de inicio');
  }
  const reason = data.motivo === undefined || data.motivo === null || data.motivo === '' ? 'No disponible' : text(data.motivo, 'Motivo', 120);
  const result = await db.prepare(`INSERT INTO barberia_bloqueos(tenant_id,barbero_id,fecha,hora_inicio,hora_fin,motivo)
    VALUES(?,?,?,?,?,?)`).run(tenantId, barberId, blockDate, hasStart ? data.hora_inicio : null, hasEnd ? data.hora_fin : null, reason);
  return db.prepare('SELECT * FROM barberia_bloqueos WHERE tenant_id=? AND id=?').get(tenantId, result.lastInsertRowid);
}

async function removeBlock(tenantId, blockId) {
  const result = await db.prepare('DELETE FROM barberia_bloqueos WHERE tenant_id=? AND id=?').run(tenantId, blockId);
  if (!result.changes) throw new ServiceError('Bloqueo no encontrado', 404);
}

async function assertAvailable(tenantId, barberId, appointmentDate, startTime, endTime) {
  // SQLite: strftime('%w', fecha) -> Postgres: EXTRACT(DOW FROM fecha::date)
  // — misma convención (0=domingo..6=sábado) en los dos motores.
  const dowSql = process.env.DATABASE_URL
    ? 'SELECT EXTRACT(DOW FROM ?::date)::integer AS day'
    : "SELECT CAST(strftime('%w', ?) AS INTEGER) AS day";
  const weekday = (await db.prepare(dowSql).get(appointmentDate)).day;
  const schedule = await db.prepare(`SELECT hora_inicio,hora_fin FROM barberia_horarios
    WHERE tenant_id=? AND barbero_id=? AND dia_semana=? AND activo=1`).get(tenantId, barberId, weekday);
  if (!schedule) throw new ServiceError('El barbero no atiende ese día', 409);
  if (startTime < schedule.hora_inicio || endTime > schedule.hora_fin) {
    throw new ServiceError(`La cita debe quedar dentro del horario de ${schedule.hora_inicio} a ${schedule.hora_fin}`, 409);
  }
  const block = await db.prepare(`SELECT motivo FROM barberia_bloqueos
    WHERE tenant_id=? AND barbero_id=? AND fecha=?
      AND (hora_inicio IS NULL OR (? < hora_fin AND ? > hora_inicio))
    ORDER BY hora_inicio ASC,id ASC LIMIT 1`).get(tenantId, barberId, appointmentDate, startTime, endTime);
  if (block) throw new ServiceError(`El barbero no está disponible: ${block.motivo}`, 409);
}

function minutesToHHMM(min) {
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

/**
 * Horas de inicio disponibles para un barbero/fecha/servicio dados — a
 * diferencia de assertAvailable() (que valida UN horario propuesto), esta
 * enumera TODOS los que caben, para la página pública de agendar y el
 * agendado por WhatsApp de un cliente (ver routes/publicBooking.js).
 */
async function freeSlots(tenantId, barberId, fecha, servicioId) {
  date(fecha);
  await activeBarber(tenantId, barberId);
  const service = await db.prepare('SELECT duracion_min FROM barberia_servicios WHERE id=? AND tenant_id=?').get(servicioId, tenantId);
  if (!service) throw new ServiceError('Servicio no encontrado', 404);
  const duration = service.duracion_min;

  // SQLite: strftime('%w', fecha) -> Postgres: EXTRACT(DOW FROM fecha::date)
  // — misma convención (0=domingo..6=sábado) en los dos motores.
  const dowSql = process.env.DATABASE_URL
    ? 'SELECT EXTRACT(DOW FROM ?::date)::integer AS day'
    : "SELECT CAST(strftime('%w', ?) AS INTEGER) AS day";
  const weekday = (await db.prepare(dowSql).get(fecha)).day;
  const schedule = await db.prepare(`SELECT hora_inicio,hora_fin FROM barberia_horarios
    WHERE tenant_id=? AND barbero_id=? AND dia_semana=? AND activo=1`).get(tenantId, barberId, weekday);
  if (!schedule) return [];

  const bloqueos = await db.prepare(`SELECT hora_inicio,hora_fin FROM barberia_bloqueos
    WHERE tenant_id=? AND barbero_id=? AND fecha=?`).all(tenantId, barberId, fecha);
  const citas = await db.prepare(`SELECT c.hora, COALESCE(c.duracion_min,s.duracion_min,30) AS duration
    FROM barberia_citas c LEFT JOIN barberia_servicios s ON s.id=c.servicio_id AND s.tenant_id=c.tenant_id
    WHERE c.tenant_id=? AND c.barbero_id=? AND c.fecha=? AND c.estado NOT IN ('cancelada','no_asistio')`).all(tenantId, barberId, fecha);

  // No ofrecer horarios que ya pasaron si la fecha pedida es hoy (según el
  // día/hora de negocio del tenant, no UTC ni la hora del navegador del cliente).
  const { timezone } = await settings.get(tenantId);
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const part = (k) => parts.find((p) => p.type === k).value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const nowMinutes = Number(part('hour')) * 60 + Number(part('minute'));

  const start = time(schedule.hora_inicio, 'Hora de inicio');
  const end = time(schedule.hora_fin, 'Hora de cierre');
  const STEP_MIN = 15;
  const slots = [];
  for (let t = start; t + duration <= end; t += STEP_MIN) {
    if (fecha === today && t < nowMinutes) continue;
    const slotEnd = t + duration;
    const blocked = bloqueos.some((b) => b.hora_inicio == null || (t < time(b.hora_fin) && slotEnd > time(b.hora_inicio)));
    if (blocked) continue;
    const busy = citas.some((c) => { const cs = time(c.hora); return t < cs + c.duration && slotEnd > cs; });
    if (busy) continue;
    slots.push(minutesToHHMM(t));
  }
  return slots;
}

module.exports = { assertAvailable, createBlock, list, removeBlock, setSchedule, freeSlots };
