const mantenimientosService = require('./mantenimientos.service');
const apiRes = require('../../common/utils/apiResponse');

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
    } catch (err) {
        next(err);
    }
};

exports.markAsAttended = async (req, res, next) => {
    try {
        const actualizado = await mantenimientosService.markAsAttended(req.params.id);
        if (!actualizado) return res.status(404).json(apiRes.error('Not found', 'NOT_FOUND'));
        res.json(apiRes.success(actualizado));
    } catch (err) {
        next(err);
    }
};
