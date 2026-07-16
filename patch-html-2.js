const fs = require('fs');
let content = fs.readFileSync('dashboard/script.js', 'utf8');

const targetHtmlStr = `          <div class="form-row">
            <div class="form-group"><label>\${window.i18n.t('col.ulti_cal') || 'Last Test/tag'}</label><input type="date" id="editAssetUltiCal" class="form-input" value="\${item.ultima_calibracion?item.ultima_calibracion.substring(0,10):''}"></div>
            <div class="form-group"><label>\${window.i18n.t('col.prox_cal') || 'Next Test/tag'}</label><input type="date" id="editAssetProxCal" class="form-input" value="\${item.calibracion?item.calibracion.substring(0,10):''}"></div>
          </div>
          \`}
        </div>
        <div class="modal-footer">`;

const injectionHtmlStr = `          <div class="form-row">
            <div class="form-group"><label>\${window.i18n.t('col.ulti_cal') || 'Last Test/tag'}</label><input type="date" id="editAssetUltiCal" class="form-input" value="\${item.ultima_calibracion?item.ultima_calibracion.substring(0,10):''}"></div>
            <div class="form-group"><label>\${window.i18n.t('col.prox_cal') || 'Next Test/tag'}</label><input type="date" id="editAssetProxCal" class="form-input" value="\${item.calibracion?item.calibracion.substring(0,10):''}"></div>
          </div>
          \`}
          
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
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
        <div class="modal-footer">`;

content = content.replace(targetHtmlStr, injectionHtmlStr);
fs.writeFileSync('dashboard/script.js', content);
console.log('HTML Patched successfully');
