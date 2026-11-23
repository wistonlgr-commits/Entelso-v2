const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const env = require('../../config/environment');

function isLocalUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  } catch (_) {
    return false;
  }
}

const isTestOrIsolated = env.NODE_ENV === 'test' || process.env.DISABLE_PROD_EXTERNAL === 'true';
let supabase = null;
let blockedProdStorage = false;

if (process.env.LOCAL_STORAGE_MOCK !== 'true' && env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
  if (isTestOrIsolated && !isLocalUrl(env.SUPABASE_URL)) {
    blockedProdStorage = true;
    console.warn('⚠️ External object storage client disabled in test/isolated mode.');
  } else {
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  }
}

/**
 * Sube un buffer de imagen al almacenamiento de objetos y retorna la URL pública.
 * @param {Buffer} fileBuffer 
 * @param {string} originalName 
 * @param {string} mimeType 
 * @returns {Promise<string>} public URL
 */
const uploadImage = async (fileBuffer, originalName, mimeType) => {
  const rawExt = path.extname(originalName || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const extension = rawExt || 'jpg';
  const filename = `${crypto.randomUUID()}.${extension}`;

  if (process.env.LOCAL_STORAGE_MOCK === 'true') {
    return `http://127.0.0.1:${env.PORT}/mock-storage/${filename}`;
  }

  if (blockedProdStorage) {
    throw new Error('External object storage is disabled in isolated/test mode.');
  }

  if (!supabase) {
    throw new Error('Almacenamiento de objetos no configurado (faltan credenciales de almacenamiento).');
  }

  const bucketName = 'entelso-media';

  const { data, error } = await supabase
    .storage
    .from(bucketName)
    .upload(filename, fileBuffer, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error('Error subiendo imagen al almacenamiento:', error);
    throw new Error('Error al subir la imagen al almacenamiento en la nube.');
  }

  const { data: publicUrlData } = supabase
    .storage
    .from(bucketName)
    .getPublicUrl(filename);

  return publicUrlData.publicUrl;
};

module.exports = {
  uploadImage
};
