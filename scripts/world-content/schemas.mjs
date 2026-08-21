const MANIFEST_KEYS = new Set([
  'schemaVersion', 'worldId', 'startDate', 'characterDataset', 'mapDataset', 'artifactDataset',
]);
const LOCATION_TYPES = new Set(['region', 'castle', 'city', 'town', 'village', 'port', 'ruin', 'landmark']);

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}必须是对象`);
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组`);
  return value;
}

function assertNoDuplicateIds(values, key, label) {
  const ids = new Set();
  for (const value of values) {
    const id = value?.[key];
    if (typeof id !== 'string' || !id.trim()) throw new Error(`${label}${key}无效`);
    if (ids.has(id)) throw new Error(`${label} ID 重复：${id}`);
    ids.add(id);
  }
}

export function validateWorldManifest(value) {
  const manifest = record(value, '世界清单');
  for (const key of Object.keys(manifest)) if (!MANIFEST_KEYS.has(key)) throw new Error(`世界清单含未知字段：${key}`);
  if (manifest.schemaVersion !== 1) throw new Error('世界清单版本必须为 1');
  if (manifest.worldId !== 'agot-298') throw new Error('产品只允许世界 agot-298');
  const date = record(manifest.startDate, '世界开始日期');
  if (date.year !== 298 || date.month !== 5 || date.day !== 10 || Object.keys(date).length !== 3) {
    throw new Error('产品开始日期必须为 298-05-10');
  }
  for (const key of ['characterDataset', 'mapDataset', 'artifactDataset']) {
    const id = manifest[key];
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`${key}必须是数据集 ID，不能是路径`);
  }
  return manifest;
}

export function validateWorldSource(source) {
  validateWorldManifest(source.manifest);
  const playable = array(source.playableCharacters, '可玩人物');
  const characters = array(source.startCharacters, '人物起点');
  const titles = array(source.startTitles, '头衔起点');
  assertNoDuplicateIds(playable, 'characterId', '可玩人物');
  assertNoDuplicateIds(characters, 'characterId', '人物起点');
  assertNoDuplicateIds(titles, 'titleId', '头衔起点');

  const assets = record(source.startAssets, '资产起点');
  if (assets.schemaVersion !== 1) throw new Error('资产起点版本必须为 1');
  for (const key of ['instances', 'sites', 'vehicles']) array(assets[key], `资产起点.${key}`);
  assertNoDuplicateIds(assets.instances, 'instanceId', '资产实例');
  assertNoDuplicateIds(assets.sites, 'id', '保管站点');
  assertNoDuplicateIds(assets.vehicles, 'id', '载具');

  const gameplay = record(source.gameplayLocations, '游戏地点配置');
  if (gameplay.schemaVersion !== 1) throw new Error('游戏地点配置版本必须为 1');
  for (const key of ['include', 'exclude']) {
    array(gameplay[key], `游戏地点.${key}`);
    if (new Set(gameplay[key]).size !== gameplay[key].length) throw new Error(`游戏地点.${key}含重复 ID`);
  }
  const rules = record(gameplay.rules, '游戏地点规则');
  if (!Number.isFinite(rules.minimumImportance)) throw new Error('游戏地点重要度无效');
  if (!array(rules.types, '游戏地点类型').every((type) => LOCATION_TYPES.has(type))) throw new Error('游戏地点类型无效');

  for (const [name, terms] of Object.entries(source.terminology)) {
    const dictionary = record(terms, `${name}术语`);
    if (dictionary.schemaVersion !== 1) throw new Error(`${name}术语版本必须为 1`);
    record(dictionary.labels, `${name}术语标签`);
  }
  for (const [name, collectionKey] of [['ordinaryItems', 'items'], ['loadoutTemplates', 'templates'], ['loadoutOverrides', 'overrides']]) {
    const document = record(source[name], name);
    if (document.schemaVersion !== 1) throw new Error(`${name}版本必须为 1`);
    array(document[collectionKey], `${name}.${collectionKey}`);
  }
  return source;
}
