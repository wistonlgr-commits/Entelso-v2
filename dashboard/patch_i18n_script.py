import re

with open("c:\\Users\\Leor\\Desktop\\Entelso\\dashboard\\script.js", "r", encoding="utf-8") as f:
    code = f.read()

# Replace hardcoded strings in maintenance scheduling
code = code.replace(
    "msgEl.textContent = 'Por favor complete el equipo y la fecha.';", 
    "msgEl.textContent = window.i18n.t('maint.err_campos') || 'Por favor complete el equipo y la fecha.';"
)
code = code.replace(
    "btn.innerHTML = '<i class=\"fa-solid fa-spinner fa-spin\"></i> Agendando...';", 
    "btn.innerHTML = '<i class=\"fa-solid fa-spinner fa-spin\"></i> ' + (window.i18n.t('maint.registrando') || 'Agendando...');"
)
code = code.replace(
    "msgEl.textContent = `✓ Mantenimiento agendado para ${activo.id}.`;",
    "msgEl.textContent = `✓ ${window.i18n.t('maint.agendado_ok')} ${activo.id}.`;"
)
code = code.replace(
    "btn.textContent = 'Agendar Mantenimiento';",
    "btn.textContent = window.i18n.t('maint.btn_agendar') || 'Agendar Mantenimiento';"
)
code = code.replace(
    "msgEl.textContent = 'Error al agendar mantenimiento.';",
    "msgEl.textContent = window.i18n.t('maint.err_agendar') || 'Error al agendar mantenimiento.';"
)
code = code.replace(
    "msgEl.textContent = 'Equipo no encontrado en el inventario. Verifique el ID o nombre.';",
    "msgEl.textContent = window.i18n.t('maint.err_no_encontrado') || 'Equipo no encontrado en el inventario. Verifique el ID o nombre.';"
)

# Replace hardcoded strings in equipment registration
code = code.replace(
    "msgEl.textContent  = 'El número de inventario y la descripción son obligatorios.';",
    "msgEl.textContent = window.i18n.t('modal.err_requerido') || 'El número de inventario y la descripción son obligatorios.';"
)
code = code.replace(
    "btn.querySelector('span').textContent = 'Registrando...';",
    "btn.querySelector('span').textContent = window.i18n.t('modal.registrando') || 'Registrando...';"
)
code = code.replace(
    "msgEl.textContent   = `✓ Equipo ${numSerie} registrado correctamente.`;",
    "msgEl.textContent = `✓ ` + (window.i18n.t('modal.registrado_ok')?.replace('{0}', numSerie) || `Equipo ${numSerie} registrado correctamente.`);"
)
code = code.replace(
    "msgEl.textContent   = data.message || 'Error al registrar el equipo.';",
    "msgEl.textContent = data.message || window.i18n.t('modal.err_registrar') || 'Error al registrar el equipo.';"
)
code = code.replace(
    "msgEl.textContent   = 'Error de conexión al servidor.';",
    "msgEl.textContent = window.i18n.t('modal.err_conexion') || 'Error de conexión al servidor.';"
)

# Replace hardcoded strings in Drawer Timeline
code = code.replace(
    "timelineEl.innerHTML = `<div class=\"timeline-item\"><div class=\"timeline-body\">Cargando historial...</div></div>`;",
    "timelineEl.innerHTML = `<div class=\"timeline-item\"><div class=\"timeline-body\">${window.i18n.t('drawer.cargando_hist') || 'Cargando historial...'}</div></div>`;"
)
code = code.replace(
    "timelineEl.innerHTML = `<div class=\"timeline-item\"><div class=\"timeline-body\">No hay historial registrado.</div></div>`;",
    "timelineEl.innerHTML = `<div class=\"timeline-item\"><div class=\"timeline-body\">${window.i18n.t('drawer.sin_historial') || 'No hay historial registrado.'}</div></div>`;"
)
code = code.replace(
    "timelineEl.innerHTML = `<div class=\"timeline-item\"><div class=\"timeline-body\">Error al cargar historial.</div></div>`;",
    "timelineEl.innerHTML = `<div class=\"timeline-item\"><div class=\"timeline-body\">${window.i18n.t('drawer.err_historial') || 'Error al cargar historial.'}</div></div>`;"
)

# Replace hardcoded strings in Change Password
code = code.replace(
    "if (!actual || !nueva || !conf) return alert(\"Llena todos los campos.\");",
    "if (!actual || !nueva || !conf) return alert(window.i18n.t('seg.err_campos') || \"Llena todos los campos.\");"
)
code = code.replace(
    "if (nueva !== conf) return alert(\"Las contraseñas nuevas no coinciden.\");",
    "if (nueva !== conf) return alert(window.i18n.t('seg.err_no_coinciden') || \"Las contraseñas nuevas no coinciden.\");"
)
code = code.replace(
    "btnCambiarPass.textContent = \"Actualizando...\";",
    "btnCambiarPass.textContent = window.i18n.t('seg.actualizando') || \"Actualizando...\";"
)
code = code.replace(
    "alert(\"Contraseña actualizada exitosamente.\");",
    "alert(window.i18n.t('seg.pass_ok') || \"Contraseña actualizada exitosamente.\");"
)
code = code.replace(
    "alert(\"Error de red\");",
    "alert(window.i18n.t('seg.err_red') || \"Error de red\");"
)
code = code.replace(
    "btnCambiarPass.textContent = \"Actualizar Contraseña\";",
    "btnCambiarPass.textContent = window.i18n.t('seg.btn_actualizar') || \"Actualizar Contraseña\";"
)

with open("c:\\Users\\Leor\\Desktop\\Entelso\\dashboard\\script.js", "w", encoding="utf-8") as f:
    f.write(code)

print("Patched successfully")
