with open('dashboard/i18n.js', 'r', encoding='utf-8') as f:
    text = f.read()

en_add = '''
      'col.nombre': 'Name',
      'col.email': 'Email',
'''

es_add = '''
      'col.nombre': 'Nombre',
      'col.email': 'Correo',
'''

text = text.replace("'col.equipo':       'Equipment',", "'col.equipo':       'Equipment'," + en_add)
text = text.replace("'col.equipo':       'Equipo',", "'col.equipo':       'Equipo'," + es_add)

with open('dashboard/i18n.js', 'w', encoding='utf-8') as f:
    f.write(text)
