const fs = require('fs');
let lines = fs.readFileSync('dashboard/script.js', 'utf8').split('\n');

const editActivoIdx = lines.findIndex(l => l.includes('window.editarActivo = async function(item) {'));
if (editActivoIdx === -1) process.exit(1);

let modalFooterIdx = -1;
for (let i = editActivoIdx; i < lines.length; i++) {
  if (lines[i].includes('</div>') && lines[i+1] && lines[i+1].includes('<div class="modal-footer">')) {
    modalFooterIdx = i;
    break;
  }
}

if (modalFooterIdx !== -1) {
    const htmlToInject = `          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
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
          </div>`;
    lines.splice(modalFooterIdx, 0, htmlToInject);
}

const confirmBtnIdx = lines.findIndex(l => l.includes("document.getElementById('confirmEditAssetBtn').onclick = async () => {"));
if (confirmBtnIdx !== -1) {
    const jsToInject = `
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
`;
    lines.splice(confirmBtnIdx, 0, jsToInject);
}

let payloadIdx = lines.findIndex((l, idx) => idx > confirmBtnIdx && l.includes('fecha_prox_tag:'));
if (payloadIdx !== -1) {
    lines[payloadIdx] = lines[payloadIdx] + ",\n      fotos:               currentFotos";
}

fs.writeFileSync('dashboard/script.js', lines.join('\n'));
console.log('Success');
