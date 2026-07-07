import re
with open('backend/src/modules/activos/activos.service.js', 'r', encoding='utf-8') as f:
    text = f.read()

newSvc = '''
exports.bulkUpdateCategory = async (ids, item_id) => {
  const result = await Activo.updateMany(
    { _id: { $in: ids } },
    { $set: { item_id } }
  );
  return result.modifiedCount;
};

exports.bulkUpdateStatus = async (ids, status) => {
  const result = await Activo.updateMany(
    { _id: { $in: ids } },
    { $set: { status } }
  );
  return result.modifiedCount;
};

exports.bulkUpdateZona = async (ids, zona_id) => {
  const result = await Activo.updateMany(
    { _id: { $in: ids } },
    { $set: { zona_id: zona_id || null } }
  );
  return result.modifiedCount;
};

exports.bulkUpdateTeam = async (ids, team_id) => {
  const result = await Activo.updateMany(
    { _id: { $in: ids } },
    { $set: { team_id: team_id || null } }
  );
  return result.modifiedCount;
};
'''

text = re.sub(r'exports\.bulkUpdateCategory = async.*?};', newSvc.strip(), text, flags=re.DOTALL)

with open('backend/src/modules/activos/activos.service.js', 'w', encoding='utf-8') as f:
    f.write(text)
