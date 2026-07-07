with open('dashboard/i18n.js', 'r', encoding='utf-8') as f:
    text = f.read()

en_add = '''
      'usuarios.email': 'Email Address',
      'usuarios.phone': 'Phone (WhatsApp)',
      'usuarios.team': 'Team',
      'usuarios.role_supervisor': 'Supervisor',
      'usuarios.role_almacen': 'Warehouse',
'''

es_add = '''
      'usuarios.email': 'Correo Electrónico',
      'usuarios.phone': 'Teléfono (WhatsApp)',
      'usuarios.team': 'Equipo',
      'usuarios.role_supervisor': 'Supervisor',
      'usuarios.role_almacen': 'Almacén',
'''

text = text.replace("'usuarios.role_admin': 'Administrator',", "'usuarios.role_admin': 'Administrator'," + en_add)
text = text.replace("'usuarios.role_admin': 'Administrador',", "'usuarios.role_admin': 'Administrador'," + es_add)

with open('dashboard/i18n.js', 'w', encoding='utf-8') as f:
    f.write(text)
