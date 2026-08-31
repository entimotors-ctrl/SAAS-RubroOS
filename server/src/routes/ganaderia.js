const express = require('express');
const db = require('../db');
const { simpleCrud } = require('../utils/crud');
const ganaderiaService = require('../services/ganaderiaService');

const router = express.Router();

router.use(
  '/animales',
  simpleCrud(
    'ganaderia_animales',
    ['arete', 'nombre', 'raza', 'sexo', 'fecha_nacimiento', 'peso_kg', 'estado', 'madre_arete', 'padre_arete'],
    { required: ['arete'] }
  )
);
router.use(
  '/reproduccion',
  simpleCrud('ganaderia_reproduccion', ['animal_id', 'tipo', 'fecha', 'fecha_probable_parto', 'notas'], {
    required: ['animal_id', 'fecha'],
    refs: { animal_id: 'ganaderia_animales' },
  })
);
router.use(
  '/sanidad',
  simpleCrud('ganaderia_sanidad', ['animal_id', 'tipo', 'nombre', 'fecha', 'proxima_fecha', 'notas'], {
    required: ['animal_id', 'nombre', 'fecha'],
    refs: { animal_id: 'ganaderia_animales' },
  })
);

router.get('/sanidad/alertas', (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, a.arete, a.nombre AS animal_nombre FROM ganaderia_sanidad s
       JOIN ganaderia_animales a ON a.id = s.animal_id AND a.tenant_id = s.tenant_id
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
       JOIN ganaderia_animales a ON a.id = p.animal_id AND a.tenant_id = p.tenant_id
       WHERE p.tenant_id = ? ORDER BY p.fecha DESC, p.id DESC LIMIT 200`
    )
    .all(req.user.tenant_id);
  res.json(rows);
});

router.post('/produccion', (req, res, next) => {
  try {
    const registro = ganaderiaService.registrarProduccion(req.user.tenant_id, req.body || {});
    res.status(201).json(registro);
  } catch (err) {
    next(err);
  }
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
       LEFT JOIN ganaderia_produccion_leche p ON p.animal_id = a.id AND p.tenant_id = a.tenant_id AND p.fecha >= date('now','-6 day')
       WHERE a.tenant_id = ? GROUP BY a.id ORDER BY litros DESC`
    )
    .all(tenantId);
  const totalAnimales = db.prepare("SELECT COUNT(*) AS n FROM ganaderia_animales WHERE tenant_id = ? AND estado = 'activo'").get(tenantId).n;
  res.json({ litrosHoy: hoy, ultimaSemana: semana, porAnimal, totalAnimales });
});

module.exports = router;
