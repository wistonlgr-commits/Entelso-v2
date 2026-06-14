const mantenimientosService = require('./mantenimientos.service');
const apiRes = require('../../common/utils/apiResponse');

exports.getAll = async (req, res) => {
    try {
        const data = await mantenimientosService.getAll();
        res.json(apiRes.success(data));
    } catch (err) {
        console.error("Error fetching mantenimientos:", err);
        res.status(500).json(apiRes.error('Server error', 'SERVER_ERROR'));
    }
};

exports.create = async (req, res) => {
    try {
        const nuevo = await mantenimientosService.create(req.body);
        res.status(201).json(apiRes.success(nuevo));
    } catch (err) {
        console.error("Error creating mantenimiento:", err);
        res.status(500).json(apiRes.error('Server error', 'SERVER_ERROR'));
    }
};

exports.markAsAttended = async (req, res) => {
    try {
        const actualizado = await mantenimientosService.markAsAttended(req.params.id);
        if (!actualizado) return res.status(404).json(apiRes.error('Not found', 'NOT_FOUND'));
        res.json(apiRes.success(actualizado));
    } catch (err) {
        console.error("Error updating mantenimiento:", err);
        res.status(500).json(apiRes.error('Server error', 'SERVER_ERROR'));
    }
};
