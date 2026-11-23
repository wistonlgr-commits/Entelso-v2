const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadImage } = require('../storage/storage.service');
const res = require('../../common/utils/apiResponse');
const { requireAuth } = require('../../common/middleware/auth.middleware');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

// Configuración de multer (memoria)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const normMime = file.mimetype ? file.mimetype.trim().toLowerCase().split(';')[0].trim() : '';
    if (ALLOWED_MIME_TYPES.includes(normMime)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Tipo de archivo no permitido. Solo se aceptan imágenes (JPEG, PNG, WebP, GIF).'), {
        isOperational: true,
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      }));
    }
  },
});

router.post('/', requireAuth, upload.single('foto'), async (req, reply, next) => {
  try {
    if (!req.file) {
      return reply.status(400).json(res.error('No se ha subido ningún archivo.', 'VALIDATION_ERROR'));
    }

    const { originalname, mimetype, buffer } = req.file;
    const url = await uploadImage(buffer, originalname, mimetype);

    reply.json(res.success({ url }, 'Imagen subida correctamente.'));
  } catch (error) {
    next(error);
  }
});

router.post('/batch', requireAuth, upload.array('fotos', 5), async (req, reply, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return reply.status(400).json(res.error('No se han subido archivos.', 'VALIDATION_ERROR'));
    }

    const uploadPromises = req.files.map(file => 
      uploadImage(file.buffer, file.originalname, file.mimetype)
    );
    
    const urls = await Promise.all(uploadPromises);

    reply.json(res.success({ urls }, 'Imágenes subidas correctamente.'));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
