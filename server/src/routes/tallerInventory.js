const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../security/access');
const { ServiceError } = require('../services/errors');
const { number, money } = require('../services/tallerSales');
const router = express.Router();
router.get('/', async (req, res) => res.json(await db.prepare('SELECT * FROM taller_inventario WHERE tenant_id = ? ORDER BY id DESC').all(req.user.tenant_id)));
router.get('/:id/movimientos', async (req, res) => res.json(await db.prepare('SELECT * FROM taller_stock_movimientos WHERE tenant_id = ? AND producto_id = ? ORDER BY id DESC').all(req.user.tenant_id, req.params.id)));
router.use(requireAdmin);
async function save(req, id) {
  const tid = req.user.tenant_id;
  return db.transaction(async () => {
    const old = id ? await db.prepare('SELECT * FROM taller_inventario WHERE id = ? AND tenant_id = ?').get(id, tid) : null;
    if (id && !old) throw new ServiceError('Producto no encontrado', 404);
    const data = { nombre: '', sku: null, precio: 0, stock: 0, ...old, ...req.body };
    if (typeof data.nombre !== 'string' || !data.nombre.trim()) throw new ServiceError('El nombre es obligatorio');
    const precio = money(data.precio, 'Precio') / 100;
    const stock = number(data.stock, 'Stock');
    if (Math.abs(stock * 1000 - Math.round(stock * 1000)) > 0.00001) throw new ServiceError('Stock: usa hasta tres decimales');
    if (old && stock !== old.stock && !String(req.body.motivo || '').trim()) throw new ServiceError('Indica el motivo del ajuste de stock');
    if (old) await db.prepare('UPDATE taller_inventario SET nombre = ?, sku = ?, precio = ?, stock = ? WHERE id = ? AND tenant_id = ?').run(data.nombre.trim(), data.sku, precio, stock, id, tid);
    else id = (await db.prepare('INSERT INTO taller_inventario (tenant_id, nombre, sku, precio, stock) VALUES (?, ?, ?, ?, ?)').run(tid, data.nombre.trim(), data.sku, precio, stock)).lastInsertRowid;
    if (!old || stock !== old.stock) await db.prepare('INSERT INTO taller_stock_movimientos (tenant_id, producto_id, cantidad, stock_resultante, motivo, user_id) VALUES (?, ?, ?, ?, ?, ?)').run(tid, id, stock - (old?.stock || 0), stock, old ? String(req.body.motivo).trim() : 'existencia inicial', req.user.sub);
    return db.prepare('SELECT * FROM taller_inventario WHERE id = ? AND tenant_id = ?').get(id, tid);
  }).immediate();
}
router.post('/', async (req, res, next) => { try { res.status(201).json(await save(req)); } catch (e) { next(e); } });
router.put('/:id', async (req, res, next) => { try { res.json(await save(req, req.params.id)); } catch (e) { next(e); } });
router.delete('/:id', async (req, res, next) => {
  try {
    const row = await db.prepare('SELECT id FROM taller_inventario WHERE id = ? AND tenant_id = ?').get(req.params.id, req.user.tenant_id);
    if (!row) throw new ServiceError('Producto no encontrado', 404);
    if (await db.prepare('SELECT id FROM taller_stock_movimientos WHERE producto_id = ? LIMIT 1').get(row.id) || await db.prepare('SELECT id FROM taller_venta_items WHERE producto_id = ? LIMIT 1').get(row.id)) throw new ServiceError('El producto tiene historial. Ajusta su stock conservando la trazabilidad.', 409);
    await db.prepare('DELETE FROM taller_inventario WHERE id = ? AND tenant_id = ?').run(row.id, req.user.tenant_id);
    res.status(204).end();
  } catch (e) { next(e); }
});
module.exports = router;
