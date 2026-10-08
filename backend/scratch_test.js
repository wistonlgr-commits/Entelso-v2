const axios = require('axios');
const heicConvert = require('heic-convert');

async function downloadImage(url) {
  console.log('Downloading', url);
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    let buf = Buffer.from(response.data);
    console.log('Downloaded', buf.length, 'bytes');
    if (url.toLowerCase().endsWith('.heic') || (buf.length > 8 && buf.slice(4, 8).toString() === 'ftyp')) {
      console.log('Converting HEIC...');
      try {
        buf = await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.88 });
      } catch (convErr) {
        console.warn('HEIC conversion failed for url:', url, convErr.message);
      }
    }
    return buf;
  } catch (err) {
    console.error('Error downloading:', err.message);
    return null;
  }
}

async function run() {
  const buf = await downloadImage('https://github.com/favicon.ico');
  console.log('Final length:', buf ? buf.length : 'null');
}
run();
