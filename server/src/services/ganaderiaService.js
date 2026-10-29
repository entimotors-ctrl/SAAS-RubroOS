const db = require('../db');
const { ServiceError } = require('./errors');

async function registrarProduccion(tenantId, { animal_id, fecha, turno='AM', litros } = {}) {
  return db.transaction(async ()=>{
    const {date,number}=require('./validation');
    date(fecha);
    const n=number(litros,'Litros',0.001);
    if(!['AM','PM'].includes(turno)) throw new ServiceError('Turno debe ser AM o PM');
    const animal=await db.prepare('SELECT * FROM ganaderia_animales WHERE id=? AND tenant_id=?').get(animal_id||null,tenantId);
    if(!animal) throw new ServiceError('Animal no encontrado');
    if(animal.sexo!=='hembra'||animal.estado!=='activo') throw new ServiceError('Solo se registra leche de hembras activas');
    if(await db.prepare('SELECT id FROM ganaderia_produccion_leche WHERE tenant_id=? AND animal_id=? AND fecha=? AND turno=?').get(tenantId,animal.id,fecha,turno)) throw new ServiceError('Ya existe un ordeño de este animal en esa fecha y turno',409);
    const id=(await db.prepare('INSERT INTO ganaderia_produccion_leche(tenant_id,animal_id,fecha,turno,litros) VALUES(?,?,?,?,?)').run(tenantId,animal.id,fecha,turno,n)).lastInsertRowid;
    return db.prepare('SELECT * FROM ganaderia_produccion_leche WHERE id=?').get(id);
  }).immediate();
}

// ---- Lecturas (reutilizadas por la API REST y por las tools de IA) ----

async function resumenProduccion(tenantId) {
  const hoy = (await db
    .prepare("SELECT COALESCE(SUM(litros),0) AS litros FROM ganaderia_produccion_leche WHERE tenant_id = ? AND fecha = business_today(tenant_id)")
    .get(tenantId)).litros;
  // date(x,'-6 day') (SQLite) -> x - 6 (Postgres: date - integer = date).
  const semanaSql = process.env.DATABASE_URL
    ? `SELECT fecha, COALESCE(SUM(litros),0) AS litros FROM ganaderia_produccion_leche
       WHERE tenant_id = ? AND fecha >= business_today(tenant_id) - 6 GROUP BY fecha ORDER BY fecha`
    : `SELECT fecha, COALESCE(SUM(litros),0) AS litros FROM ganaderia_produccion_leche
       WHERE tenant_id = ? AND fecha >= date(business_today(tenant_id),'-6 day') GROUP BY fecha ORDER BY fecha`;
  const semana = await db.prepare(semanaSql).all(tenantId);
  const porAnimalSql = process.env.DATABASE_URL
    ? `SELECT a.arete, a.nombre, COALESCE(SUM(p.litros),0) AS litros FROM ganaderia_animales a
       LEFT JOIN ganaderia_produccion_leche p ON p.animal_id = a.id AND p.tenant_id = a.tenant_id AND p.fecha >= business_today(a.tenant_id) - 6
       WHERE a.tenant_id = ? GROUP BY a.id ORDER BY litros DESC`
    : `SELECT a.arete, a.nombre, COALESCE(SUM(p.litros),0) AS litros FROM ganaderia_animales a
       LEFT JOIN ganaderia_produccion_leche p ON p.animal_id = a.id AND p.tenant_id = a.tenant_id AND p.fecha >= date(business_today(a.tenant_id),'-6 day')
       WHERE a.tenant_id = ? GROUP BY a.id ORDER BY litros DESC`;
  const porAnimal = await db.prepare(porAnimalSql).all(tenantId);
  const totalAnimales = (await db.prepare("SELECT COUNT(*) AS n FROM ganaderia_animales WHERE tenant_id = ? AND estado = 'activo'").get(tenantId)).n;
  return { litrosHoy: hoy, ultimaSemana: semana, porAnimal, totalAnimales };
}

async function buscarAnimal(tenantId, { arete, nombre } = {}) {
  if (!arete && !nombre) throw new ServiceError('Indica un arete o un nombre para buscar');
  if (arete) {
    return db.prepare('SELECT * FROM ganaderia_animales WHERE tenant_id = ? AND arete = ?').all(tenantId, arete);
  }
  return db.prepare('SELECT * FROM ganaderia_animales WHERE tenant_id = ? AND nombre LIKE ? ORDER BY nombre LIMIT 20').all(tenantId, `%${nombre}%`);
}

module.exports = { registrarProduccion, resumenProduccion, buscarAnimal };
