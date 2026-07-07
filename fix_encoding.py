import codecs

with open('dashboard/i18n.js', 'r', encoding='utf-8') as f:
    text = f.read()

REPL = '\ufffd'

repl = {
    f'Categor{REPL}as': 'Categorías',
    f'Categor{REPL}a': 'Categoría',
    f'Acci{REPL}n': 'Acción',
    f'Calibraci{REPL}n': 'Calibración',
    f'Inspecci{REPL}n': 'Inspección',
    f'Atenci{REPL}n': 'Atención',
    f'Eliminaci{REPL}n': 'Eliminación',
    f'Configuraci{REPL}n': 'Configuración',
    f'Autenticaci{REPL}n': 'Autenticación',
    f'Verificaci{REPL}n': 'Verificación',
    f'C{REPL}digo': 'Código',
    f'c{REPL}digo': 'código',
    f'Contrase{REPL}a': 'Contraseña',
    f'contrase{REPL}a': 'contraseña',
    f'Almac{REPL}n': 'Almacén',
    f'Tel{REPL}fono': 'Teléfono',
    f'M{REPL}n ': 'Mín ',
    f'f{REPL}sica': 'física',
    f'F{REPL}sica': 'Física',
    f'{REPL}xito': 'éxito',
    f'eliminar{REPL}': 'eliminará',
    f'Est{REPL}s': 'Estás',
    f'{REPL}Seguro': '¿Seguro',
    f'da{REPL}ado': 'dañado',
    f'Da{REPL}ado': 'Dañado',
    f'T{REPL}cnico': 'Técnico',
    f'TAccnico': 'Técnico', 
    f'd{REPL}gitos': 'dígitos',
    f'aqu{REPL}': 'aquí',
    f'a{REPL}n': 'aún',
    f'Rep{REPL}relo': 'Repárelo',
    f'A{REPL}adir': 'Añadir',
}

for k, v in repl.items():
    text = text.replace(k, v)

with open('dashboard/i18n.js', 'w', encoding='utf-8') as f:
    f.write(text)
