const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadImage } = require('../storage/storage.service');
const res = require('../../common/utils/apiResponse');

// Configuración de multer (memoria)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

router.post('/', upload.single('foto'), async (req, reply, next) => {
  try {
    if (!req.file) {
      return reply.status(400).json(res.error('No se ha subido ningún archivo.'));
    }

    const { originalname, mimetype, buffer } = req.file;
    const url = await uploadImage(buffer, originalname, mimetype);

    reply.json(res.success({ url }, 'Imagen subida correctamente.'));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
