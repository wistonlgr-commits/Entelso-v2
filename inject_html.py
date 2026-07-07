import re
with open('dashboard/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

newDropdownItems = '''
                            <div class=\"dropdown-item\" id=\"bulkMoveCategoryBtn\" style=\"cursor:pointer; padding:10px 12px; display:flex; align-items:center; gap:8px; border-top: 1px solid var(--border);\">
                                <i class=\"fa-solid fa-folder-tree\"></i> <span data-i18n=\"bulk.mover_cat\">Move Category</span>
                            </div>
                            <div class=\"dropdown-item\" id=\"bulkSetStatusBtn\" style=\"cursor:pointer; padding:10px 12px; display:flex; align-items:center; gap:8px;\">
                                <i class=\"fa-solid fa-signal\"></i> <span data-i18n=\"bulk.mover_estado\">Change Status</span>
                            </div>
                            <div class=\"dropdown-item\" id=\"bulkSetZonaBtn\" style=\"cursor:pointer; padding:10px 12px; display:flex; align-items:center; gap:8px;\">
                                <i class=\"fa-solid fa-map-location-dot\"></i> <span data-i18n=\"bulk.mover_zona\">Change Zone</span>
                            </div>
                            <div class=\"dropdown-item\" id=\"bulkSetTeamBtn\" style=\"cursor:pointer; padding:10px 12px; display:flex; align-items:center; gap:8px;\">
                                <i class=\"fa-solid fa-users\"></i> <span data-i18n=\"bulk.mover_team\">Change Team</span>
                            </div>
'''

html = re.sub(r'<div class=\"dropdown-item\" id=\"bulkMoveCategoryBtn\"[^>]*>.*?</div>', newDropdownItems.strip(), html, flags=re.DOTALL)

newModals = '''<!-- Modal: Bulk Move to Category -->
<div class=\"modal-overlay\" id=\"bulkCategoryModal\">
    <div class=\"modal\" style=\"max-width: 400px;\">
        <div class=\"modal-header\">
            <h3 data-i18n=\"bulk.mover_cat\">Move Category</h3>
            <button class=\"close-btn\" id=\"closeBulkCategoryModal\"><i class=\"fa-solid fa-xmark\"></i></button>
        </div>
        <div class=\"modal-body\">
            <div class=\"form-group\">
                <label data-i18n=\"cat.seleccionar\">Select Destination Category</label>
                <select id=\"bulkCategorySelect\" class=\"form-input select\">
                    <!-- Filled dynamically -->
                </select>
            </div>
        </div>
        <div class=\"modal-footer\">
            <button class=\"btn-ghost\" id=\"cancelBulkCategoryBtn\" data-i18n=\"modal.cancelar\">Cancel</button>
            <button class=\"btn-primary\" id=\"confirmBulkCategoryBtn\"><i class=\"fa-solid fa-check\"></i> <span data-i18n=\"modal.ok\">OK</span></button>
        </div>
    </div>
</div>

<!-- Modal: Bulk Set Status -->
<div class=\"modal-overlay\" id=\"bulkStatusModal\">
    <div class=\"modal\" style=\"max-width: 400px;\">
        <div class=\"modal-header\">
            <h3 data-i18n=\"bulk.mover_estado\">Change Status</h3>
            <button class=\"close-btn\" id=\"closeBulkStatusModal\"><i class=\"fa-solid fa-xmark\"></i></button>
        </div>
        <div class=\"modal-body\">
            <div class=\"form-group\">
                <label data-i18n=\"bulk.seleccionar_estado\">Select Status</label>
                <select id=\"bulkStatusSelect\" class=\"form-input select\">
                    <option value=\"disponible\" data-i18n=\"estado.disponible\">Disponible</option>
                    <option value=\"en_uso\" data-i18n=\"estado.en_uso\">En Uso</option>
                    <option value=\"en_mantenimiento\" data-i18n=\"estado.en_mantenimiento\">Under Maintenance</option>
                    <option value=\"calibracion_pendiente\" data-i18n=\"estado.calibracion_pendiente\">Calibration Pending</option>
                    <option value=\"fuera_de_servicio\" data-i18n=\"estado.fuera_de_servicio\">Fuera de Servicio</option>
                    <option value=\"calibrado\" data-i18n=\"estado.calibrado\">Calibrado</option>
                    <option value=\"danado\" data-i18n=\"estado.danado\">Dañado</option>
                </select>
            </div>
        </div>
        <div class=\"modal-footer\">
            <button class=\"btn-ghost\" id=\"cancelBulkStatusBtn\" data-i18n=\"modal.cancelar\">Cancel</button>
            <button class=\"btn-primary\" id=\"confirmBulkStatusBtn\"><i class=\"fa-solid fa-check\"></i> <span data-i18n=\"modal.ok\">OK</span></button>
        </div>
    </div>
</div>

<!-- Modal: Bulk Set Zone -->
<div class=\"modal-overlay\" id=\"bulkZonaModal\">
    <div class=\"modal\" style=\"max-width: 400px;\">
        <div class=\"modal-header\">
            <h3 data-i18n=\"bulk.mover_zona\">Change Zone</h3>
            <button class=\"close-btn\" id=\"closeBulkZonaModal\"><i class=\"fa-solid fa-xmark\"></i></button>
        </div>
        <div class=\"modal-body\">
            <div class=\"form-group\">
                <label data-i18n=\"bulk.seleccionar_zona\">Select Zone</label>
                <select id=\"bulkZonaSelect\" class=\"form-input select\">
                    <option value=\"\" data-i18n=\"usuarios.sin_team\">No Zone</option>
                    <!-- Filled dynamically -->
                </select>
            </div>
        </div>
        <div class=\"modal-footer\">
            <button class=\"btn-ghost\" id=\"cancelBulkZonaBtn\" data-i18n=\"modal.cancelar\">Cancel</button>
            <button class=\"btn-primary\" id=\"confirmBulkZonaBtn\"><i class=\"fa-solid fa-check\"></i> <span data-i18n=\"modal.ok\">OK</span></button>
        </div>
    </div>
</div>

<!-- Modal: Bulk Set Team -->
<div class=\"modal-overlay\" id=\"bulkTeamModal\">
    <div class=\"modal\" style=\"max-width: 400px;\">
        <div class=\"modal-header\">
            <h3 data-i18n=\"bulk.mover_team\">Change Team</h3>
            <button class=\"close-btn\" id=\"closeBulkTeamModal\"><i class=\"fa-solid fa-xmark\"></i></button>
        </div>
        <div class=\"modal-body\">
            <div class=\"form-group\">
                <label data-i18n=\"bulk.seleccionar_team\">Select Team</label>
                <select id=\"bulkTeamSelect\" class=\"form-input select\">
                    <option value=\"\" data-i18n=\"usuarios.sin_team\">No Team</option>
                    <!-- Filled dynamically -->
                </select>
            </div>
        </div>
        <div class=\"modal-footer\">
            <button class=\"btn-ghost\" id=\"cancelBulkTeamBtn\" data-i18n=\"modal.cancelar\">Cancel</button>
            <button class=\"btn-primary\" id=\"confirmBulkTeamBtn\"><i class=\"fa-solid fa-check\"></i> <span data-i18n=\"modal.ok\">OK</span></button>
        </div>
    </div>
</div>
'''

html = re.sub(r'<!-- Modal: Bulk Move to Category -->.*?</div>\s*</div>\s*</div>', newModals.strip(), html, flags=re.DOTALL)

with open('dashboard/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
