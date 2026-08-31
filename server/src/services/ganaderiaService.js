const db = require('../db');
const { ServiceError } = require('./errors');

function registrarProduccion(tenantId, { animal_id, fecha, turno, litros } = {}) {
  if (!animal_id || !fecha || !litros) throw new ServiceError('Faltan campos: animal_id, fecha, litros');
  const numLitros = Number(litros);
  if (!Number.isFinite(numLitros) || numLitros <= 0) throw new ServiceError('Litros inválidos: debe ser un número mayor que 0');
  const animal = db.prepare('SELECT 1 FROM ganaderia_animales WHERE id = ? AND tenant_id = ?').get(animal_id, tenantId);
  if (!animal) throw new ServiceError('El animal indicado no existe o no pertenece a tu negocio');

  const info = db
    .prepare('INSERT INTO ganaderia_produccion_leche (tenant_id, animal_id, fecha, turno, litros) VALUES (?, ?, ?, ?, ?)')
    .run(tenantId, animal_id, fecha, turno || 'AM', numLitros);
  return db.prepare('SELECT * FROM ganaderia_produccion_leche WHERE id = ?').get(info.lastInsertRowid);
}

// ---- Lecturas (reutilizadas por la API REST y por las tools de IA) ----

function resumenProduccion(tenantId) {
  const hoy = db
    .prepare("SELECT COALESCE(SUM(litros),0) AS litros FROM ganaderia_produccion_leche WHERE tenant_id = ? AND fecha = date('now')")
    .get(tenantId).litros;
  const semana = db
    .prepare(
      `SELECT fecha, COALESCE(SUM(litros),0) AS litros FROM ganaderia_produccion_leche
       WHERE tenant_id = ? AND fecha >= date('now','-6 day') GROUP BY fecha ORDER BY fecha`
    )
    .all(tenantId);
  const porAnimal = db
    .prepare(
      `SELECT a.arete, a.nombre, COALESCE(SUM(p.litros),0) AS litros FROM ganaderia_animales a
       LEFT JOIN ganaderia_produccion_leche p ON p.animal_id = a.id AND p.tenant_id = a.tenant_id AND p.fecha >= date('now','-6 day')
       WHERE a.tenant_id = ? GROUP BY a.id ORDER BY litros DESC`
    )
    .all(tenantId);
  const totalAnimales = db.prepare("SELECT COUNT(*) AS n FROM ganaderia_animales WHERE tenant_id = ? AND estado = 'activo'").get(tenantId).n;
  return { litrosHoy: hoy, ultimaSemana: semana, porAnimal, totalAnimales };
}

function buscarAnimal(tenantId, { arete, nombre } = {}) {
  if (!arete && !nombre) throw new ServiceError('Indica un arete o un nombre para buscar');
  if (arete) {
    return db.prepare('SELECT * FROM ganaderia_animales WHERE tenant_id = ? AND arete = ?').all(tenantId, arete);
  }
  return db.prepare('SELECT * FROM ganaderia_animales WHERE tenant_id = ? AND nombre LIKE ? ORDER BY nombre LIMIT 20').all(tenantId, `%${nombre}%`);
}

module.exports = { registrarProduccion, resumenProduccion, buscarAnimal };
