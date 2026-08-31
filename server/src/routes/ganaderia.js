const express = require('express');
const db = require('../db');
const { simpleCrud } = require('../utils/crud');

const router = express.Router();

router.use(
  '/animales',
  simpleCrud('ganaderia_animales', ['arete', 'nombre', 'raza', 'sexo', 'fecha_nacimiento', 'peso_kg', 'estado', 'madre_arete', 'padre_arete'])
);
router.use('/reproduccion', simpleCrud('ganaderia_reproduccion', ['animal_id', 'tipo', 'fecha', 'fecha_probable_parto', 'notas']));
router.use('/sanidad', simpleCrud('ganaderia_sanidad', ['animal_id', 'tipo', 'nombre', 'fecha', 'proxima_fecha', 'notas']));

router.get('/sanidad/alertas', (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, a.arete, a.nombre AS animal_nombre FROM ganaderia_sanidad s
       JOIN ganaderia_animales a ON a.id = s.animal_id
       WHERE s.tenant_id = ? AND s.proxima_fecha IS NOT NULL AND s.proxima_fecha <= date('now', '+30 day')
       ORDER BY s.proxima_fecha ASC`
    )
    .all(req.user.tenant_id);
  res.json(rows);
});

// ---- Producción de leche ----
router.get('/produccion', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, a.arete, a.nombre AS animal_nombre FROM ganaderia_produccion_leche p
       JOIN ganaderia_animales a ON a.id = p.animal_id
       WHERE p.tenant_id = ? ORDER BY p.fecha DESC, p.id DESC LIMIT 200`
    )
    .all(req.user.tenant_id);
  res.json(rows);
});

router.post('/produccion', (req, res) => {
  const { animal_id, fecha, turno, litros } = req.body || {};
  if (!animal_id || !fecha || !litros) return res.status(400).json({ error: 'Faltan campos: animal_id, fecha, litros' });
  const info = db
    .prepare('INSERT INTO ganaderia_produccion_leche (tenant_id, animal_id, fecha, turno, litros) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.tenant_id, animal_id, fecha, turno || 'AM', Number(litros));
  res.status(201).json(db.prepare('SELECT * FROM ganaderia_produccion_leche WHERE id = ?').get(info.lastInsertRowid));
});

router.get('/produccion/resumen', (req, res) => {
  const tenantId = req.user.tenant_id;
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
       LEFT JOIN ganaderia_produccion_leche p ON p.animal_id = a.id AND p.fecha >= date('now','-6 day')
       WHERE a.tenant_id = ? GROUP BY a.id ORDER BY litros DESC`
    )
    .all(tenantId);
  const totalAnimales = db.prepare("SELECT COUNT(*) AS n FROM ganaderia_animales WHERE tenant_id = ? AND estado = 'activo'").get(tenantId).n;
  res.json({ litrosHoy: hoy, ultimaSemana: semana, porAnimal, totalAnimales });
});

module.exports = router;
