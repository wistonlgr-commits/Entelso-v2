import re

with open('dashboard/script.js', 'r', encoding='utf-8') as f:
    js = f.read()

newJs = '''
  document.getElementById('confirmBulkCategoryBtn')?.addEventListener('click', async () => {
    const item_id = document.getElementById('bulkCategorySelect').value;
    if(!item_id) return;
    try {
      await apiFetch('/api/activos/bulk/category', { method: 'PATCH', body: JSON.stringify({ ids: selectedIdsForMove, item_id }) });
      window.customAlert('Equipos movidos exitosamente.');
      document.getElementById('bulkCategoryModal').style.display = 'none';
      await cargarActivos();
      document.getElementById('selectAllCheckbox').checked = false;
      window.updateBulkActionsState();
    } catch (err) { window.customAlert('Error: ' + err.message); }
  });

  document.getElementById('bulkSetStatusBtn')?.addEventListener('click', () => {
    document.getElementById('bulkActionsMenu').style.display = 'none';
    document.getElementById('bulkStatusModal').style.display = 'flex';
  });
  document.getElementById('closeBulkStatusModal')?.addEventListener('click', () => document.getElementById('bulkStatusModal').style.display = 'none');
  document.getElementById('cancelBulkStatusBtn')?.addEventListener('click', () => document.getElementById('bulkStatusModal').style.display = 'none');
  document.getElementById('confirmBulkStatusBtn')?.addEventListener('click', async () => {
    const status = document.getElementById('bulkStatusSelect').value;
    if(!status) return;
    try {
      await apiFetch('/api/activos/bulk/status', { method: 'PATCH', body: JSON.stringify({ ids: selectedIdsForMove, status }) });
      window.customAlert('Estado actualizado exitosamente.');
      document.getElementById('bulkStatusModal').style.display = 'none';
      await cargarActivos();
      document.getElementById('selectAllCheckbox').checked = false;
      window.updateBulkActionsState();
    } catch (err) { window.customAlert('Error: ' + err.message); }
  });

  document.getElementById('bulkSetZonaBtn')?.addEventListener('click', () => {
    document.getElementById('bulkActionsMenu').style.display = 'none';
    const select = document.getElementById('bulkZonaSelect');
    select.innerHTML = '<option value="" data-i18n="usuarios.sin_team">No Zone</option>' + (window.systemZonas || []).map(z => `<option value="${z.id}">${z.nombre_ubicacion}</option>`).join('');
    window.i18n.applyTranslations();
    document.getElementById('bulkZonaModal').style.display = 'flex';
  });
  document.getElementById('closeBulkZonaModal')?.addEventListener('click', () => document.getElementById('bulkZonaModal').style.display = 'none');
  document.getElementById('cancelBulkZonaBtn')?.addEventListener('click', () => document.getElementById('bulkZonaModal').style.display = 'none');
  document.getElementById('confirmBulkZonaBtn')?.addEventListener('click', async () => {
    const zona_id = document.getElementById('bulkZonaSelect').value;
    try {
      await apiFetch('/api/activos/bulk/zona', { method: 'PATCH', body: JSON.stringify({ ids: selectedIdsForMove, zona_id: zona_id || null }) });
      window.customAlert('Zona actualizada exitosamente.');
      document.getElementById('bulkZonaModal').style.display = 'none';
      await cargarActivos();
      document.getElementById('selectAllCheckbox').checked = false;
      window.updateBulkActionsState();
    } catch (err) { window.customAlert('Error: ' + err.message); }
  });

  document.getElementById('bulkSetTeamBtn')?.addEventListener('click', () => {
    document.getElementById('bulkActionsMenu').style.display = 'none';
    const select = document.getElementById('bulkTeamSelect');
    select.innerHTML = '<option value="" data-i18n="usuarios.sin_team">No Team</option>' + (window.systemTeams || []).map(t => `<option value="${t.id}">${t.nombre}</option>`).join('');
    window.i18n.applyTranslations();
    document.getElementById('bulkTeamModal').style.display = 'flex';
  });
  document.getElementById('closeBulkTeamModal')?.addEventListener('click', () => document.getElementById('bulkTeamModal').style.display = 'none');
  document.getElementById('cancelBulkTeamBtn')?.addEventListener('click', () => document.getElementById('bulkTeamModal').style.display = 'none');
  document.getElementById('confirmBulkTeamBtn')?.addEventListener('click', async () => {
    const team_id = document.getElementById('bulkTeamSelect').value;
    try {
      await apiFetch('/api/activos/bulk/team', { method: 'PATCH', body: JSON.stringify({ ids: selectedIdsForMove, team_id: team_id || null }) });
      window.customAlert('Equipo actualizado exitosamente.');
      document.getElementById('bulkTeamModal').style.display = 'none';
      await cargarActivos();
      document.getElementById('selectAllCheckbox').checked = false;
      window.updateBulkActionsState();
    } catch (err) { window.customAlert('Error: ' + err.message); }
  });
'''

js = re.sub(r'  document\.getElementById\(\'confirmBulkCategoryBtn\'\)\?\.addEventListener\(\'click\', async \(\) => \{.*?\n  \}\);', newJs.strip(), js, flags=re.DOTALL)

with open('dashboard/script.js', 'w', encoding='utf-8') as f:
    f.write(js)
