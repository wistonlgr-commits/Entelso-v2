const { createClient } = require('@supabase/supabase-js');
const env = require('../../config/environment');


let supabase = null;

if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
  supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
}

/**
 * Sube un buffer de imagen a Supabase Storage y retorna la URL pública.
 * @param {Buffer} fileBuffer 
 * @param {string} originalName 
 * @param {string} mimeType 
 * @returns {Promise<string>} public URL
 */
const uploadImage = async (fileBuffer, originalName, mimeType) => {
  if (!supabase) {
    throw new Error('Supabase Storage no está configurado (Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY)');
  }

  // Si no hay uuid, npm install uuid --save, let's just use crypto or math if uuid isn't there
  // Fallback if uuidv4 is not installed
  let uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  const extension = originalName.includes('.') ? originalName.split('.').pop() : 'jpg';
  const filename = `${uniqueId}.${extension}`;
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
    console.error('Error subiendo imagen a Supabase:', error);
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
