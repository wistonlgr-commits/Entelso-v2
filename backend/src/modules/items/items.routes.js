const router   = require('express').Router();
const ctrl     = require('./items.controller');
const { requireAuth, hasRole } = require('../../common/middleware/auth.middleware');
const validate = require('../../common/middleware/validate.middleware');
const {
  createItemSchema,
  updateItemSchema,
  createCategorySchema,
  updateCategorySchema,
  updateStockSchema,
} = require('./items.validation');

router.get('/categorias',          requireAuth, ctrl.getCategorias);
router.post('/categorias',         requireAuth, hasRole('admin', 'almacen'), validate(createCategorySchema), ctrl.createCategoria);
router.put('/categorias/:nombre',  requireAuth, hasRole('admin', 'almacen'), validate(updateCategorySchema), ctrl.renameCategoria);
router.delete('/categorias/:nombre', requireAuth, hasRole('admin', 'almacen'), ctrl.deleteCategoria);
router.get('/',                    requireAuth, ctrl.getAll);
router.get('/:id',                 requireAuth, ctrl.getById);
router.post('/',                   requireAuth, hasRole('admin', 'almacen'), validate(createItemSchema), ctrl.create);
router.put('/:id',                 requireAuth, hasRole('admin', 'almacen'), validate(updateItemSchema), ctrl.update);
router.patch('/:id/stock',         requireAuth, hasRole('admin', 'almacen'), validate(updateStockSchema), ctrl.updateStock);
router.delete('/:id',              requireAuth, hasRole('admin', 'almacen'), ctrl.remove);

module.exports = router;
