const db = require('../db');
const { ServiceError } = require('./errors');

function registrarProduccion(tenantId, { animal_id, fecha, turno, litros } = {}) {
  if (!animal_id || !fecha || !litros) throw new ServiceError('Faltan campos: animal_id, fecha, litros');
  const animal = db.prepare('SELECT 1 FROM ganaderia_animales WHERE id = ? AND tenant_id = ?').get(animal_id, tenantId);
  if (!animal) throw new ServiceError('El animal indicado no existe o no pertenece a tu negocio');

  const info = db
    .prepare('INSERT INTO ganaderia_produccion_leche (tenant_id, animal_id, fecha, turno, litros) VALUES (?, ?, ?, ?, ?)')
    .run(tenantId, animal_id, fecha, turno || 'AM', Number(litros));
  return db.prepare('SELECT * FROM ganaderia_produccion_leche WHERE id = ?').get(info.lastInsertRowid);
}

module.exports = { registrarProduccion };
