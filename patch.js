const fs = require('fs');
let content = fs.readFileSync('dashboard/script.js', 'utf8');

const targetStr = `  document.getElementById('confirmEditAssetBtn').onclick = async () => {`;
const injectionStr = `
  let currentFotos = Array.isArray(item.fotos) ? [...item.fotos] : [];

  const fotoInput = document.getElementById('editAssetFotoInput');
  const fotoStatus = document.getElementById('editAssetFotoStatus');
  const fotoGallery = document.getElementById('editAssetFotosGallery');

  if (fotoInput) {
    fotoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const btn = fotoInput.nextElementSibling;
      btn.disabled = true;
      const originalText = btn.querySelector('span').textContent;
      btn.querySelector('span').textContent = window.i18n.t('modal.subiendo_foto') || 'Subiendo...';
      fotoStatus.textContent = '';

      const formData = new FormData();
      formData.append('foto', file);
      
      try {
        const uploadRes = await fetch(API_BASE + '/api/upload', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + window.session.getToken() },
          body: formData
        });
        
        if (uploadRes.ok) {
          const uploadJson = await uploadRes.json();
          if (uploadJson.success && uploadJson.data.url) {
            currentFotos.push(uploadJson.data.url);
            fotoGallery.innerHTML += \`<img src="\${uploadJson.data.url}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;">\`;
            fotoStatus.textContent = '';
          }
        } else {
          fotoStatus.textContent = 'Error subiendo foto';
        }
      } catch (err) {
        fotoStatus.textContent = 'Error de red';
      }

      btn.disabled = false;
      btn.querySelector('span').textContent = originalText;
    });
  }

  document.getElementById('confirmEditAssetBtn').onclick = async () => {`;

content = content.replace(targetStr, injectionStr);

const targetHtmlStr = `</div>
        <div class="modal-footer">
          <button class="btn-ghost" onclick="document.getElementById('editAssetModal').remove()">\${window.i18n.t('modal.cancelar') || 'Cancelar'}</button>`;
const injectionHtmlStr = `<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
            <label>\${window.i18n.t('modal.fotos') || 'Photos'}</label>
            <div id="editAssetFotosGallery" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; min-height: 50px;">
                \${(item.fotos || []).map(foto => \`<img src="\${foto}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;">\`).join('')}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="file" id="editAssetFotoInput" accept="image/*" style="display: none;">
                <button type="button" class="btn-ghost" onclick="document.getElementById('editAssetFotoInput').click()" style="font-size: 13px; padding: 6px 12px;">
                    <i class="fa-solid fa-camera"></i> <span>\${window.i18n.t('modal.subir_foto') || 'Upload Photo'}</span>
                </button>
                <span id="editAssetFotoStatus" style="font-size: 12px; color: var(--text-2);"></span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" onclick="document.getElementById('editAssetModal').remove()">\${window.i18n.t('modal.cancelar') || 'Cancelar'}</button>`;

// replace only the occurrence matching targetHtmlStr
content = content.replace(targetHtmlStr, injectionHtmlStr);

// add fotos to payload
const payloadTarget = `fecha_prox_tag:      document.getElementById('editAssetProxTag').value || null,`;
const payloadReplacement = `fecha_prox_tag:      document.getElementById('editAssetProxTag').value || null,
      fotos:               currentFotos`;
content = content.replace(payloadTarget, payloadReplacement);

fs.writeFileSync('dashboard/script.js', content);
console.log('Script patched successfully');
