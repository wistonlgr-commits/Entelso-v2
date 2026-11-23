const mantenimientosService = require('./mantenimientos.service');
const apiRes = require('../../common/utils/apiResponse');
const auditService = require('../audit/audit.service');
const activosSvc = require('../activos/activos.service');

exports.getAll = async (req, res, next) => {
    try {
        const data = await mantenimientosService.getAll();
        res.json(apiRes.success(data));
    } catch (err) {
        next(err);
    }
};

exports.create = async (req, res, next) => {
    try {
        const nuevo = await mantenimientosService.create(req.body);
        res.status(201).json(apiRes.success(nuevo));
        const reqUserId = req.user?.sub ?? null;
        const targetActivoId = nuevo?.activo_id || req.body?.activo_id || null;
        const motivo = req.body?.motivo || '';
        void (async () => {
            let serial = null;
            try {
                if (targetActivoId) {
                    const a = await activosSvc.getById(targetActivoId);
                    serial = a?.numero_serie || null;
                }
            } catch (_) {}
            await auditService.logSafe({
                userId: reqUserId,
                accion: 'maint.scheduled',
                detalles: [serial, motivo].filter(Boolean).join(' · '),
                meta: { module: 'maintenance', severity: 'warning', source: 'web', target: serial, targetId: targetActivoId },
            });
        })();
    } catch (err) {
        next(err);
    }
};

exports.markAsAttended = async (req, res, next) => {
    try {
        const actualizado = await mantenimientosService.markAsAttended(req.params.id);
        if (!actualizado) return res.status(404).json(apiRes.error('Not found', 'NOT_FOUND'));
        res.json(apiRes.success(actualizado));
        const reqUserId = req.user?.sub ?? null;
        const targetActivoId = actualizado?.activo_id || null;
        const motivo = actualizado?.motivo || 'Resolved';
        void (async () => {
            let serial = null;
            try {
                if (targetActivoId) {
                    const a = await activosSvc.getById(targetActivoId);
                    serial = a?.numero_serie || null;
                }
            } catch (_) {}
            await auditService.logSafe({
                userId: reqUserId,
                accion: 'maint.resolved',
                detalles: [serial, motivo].filter(Boolean).join(' · '),
                meta: { module: 'maintenance', severity: 'create', source: 'web', target: serial, targetId: targetActivoId },
            });
        })();
    } catch (err) {
        next(err);
    }
};
