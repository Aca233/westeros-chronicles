const MANIFEST_KEYS = new Set([
  'schemaVersion', 'worldId', 'startDate', 'characterDataset', 'mapDataset', 'artifactDataset',
]);
const LOCATION_TYPES = new Set(['region', 'castle', 'city', 'town', 'village', 'port', 'ruin', 'landmark']);
const CHARACTER_ACTIVITIES = new Set(['idle', 'travelling', 'imprisoned', 'missing']);
const START_CHARACTER_KEYS = new Set(['characterId', 'location', 'currentActivity', 'aliveOverride', 'wounds']);
const START_CHARACTER_LOCATION_KEYS = new Set(['locationId', 'sceneLocation']);
const ASSET_INSTANCE_KEYS = new Set([
  'instanceId', 'definitionId', 'kind', 'lawfulOwner', 'controller', 'custodian', 'placement', 'equippedPosition', 'status', 'overrides',
]);
const ASSET_STATUS_VALUES = new Set(['normal', 'stolen', 'contested', 'inheritance_pending']);
const ASSET_OVERRIDE_KEYS = new Set(['customName', 'charges', 'renown', 'isHeirloom']);
const SITE_TYPES = new Set(['armory', 'wardrobe', 'room', 'warehouse', 'stable', 'camp', 'other']);
const VEHICLE_TYPES = new Set(['packhorse', 'wagon', 'ship', 'other']);
const SITE_KEYS = new Set(['id', 'name', 'type', 'location', 'locationLabel', 'description', 'capacity']);
const VEHICLE_KEYS = new Set(['id', 'name', 'type', 'location', 'locationLabel', 'capacity', 'description']);

function validateExactKeys(value, allowedKeys, label) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw new Error(`${label}含未知字段：${key}`);
  }
}

function validateAssetLocation(value, label) {
  const location = record(value, label);
  validateExactKeys(location, START_CHARACTER_LOCATION_KEYS, label);
  if (typeof location.locationId !== 'string' || !location.locationId.trim()) throw new Error(`${label} locationId 无效`);
  if ('sceneLocation' in location && (typeof location.sceneLocation !== 'string' || !location.sceneLocation.trim())) {
    throw new Error(`${label} sceneLocation 无效`);
  }
  return location;
}

function validateEquipmentPosition(value, label) {
  const position = record(value, label);
  const keys = Object.keys(position);
  if (keys.includes('group') && ['head', 'mainhand', 'offhand'].includes(position.group) && keys.length === 1) return position;
  if (position.group === 'torso' && ['garment', 'armor', 'outerwear'].includes(position.layer) && keys.length === 2) return position;
  if (position.group === 'legs' && ['legwear', 'footwear'].includes(position.layer) && keys.length === 2) return position;
  if (position.group === 'accessories' && [0, 1, 2].includes(position.index) && keys.length === 2) return position;
  throw new Error(`${label}无效`);
}

function validatePrincipal(value, label) {
  const principal = record(value, label);
  if (principal.type === 'character' && typeof principal.characterId === 'string' && principal.characterId.trim()) return principal;
  if (principal.type === 'dynasty' && typeof principal.dynastyId === 'string' && principal.dynastyId.trim()) return principal;
  if (principal.type === 'title' && typeof principal.titleId === 'string' && principal.titleId.trim()) return principal;
  if (principal.type === 'asset' && typeof principal.assetId === 'string' && principal.assetId.trim()) return principal;
  if (principal.type === 'location') {
    validateAssetLocation(principal.location, `${label}.location`);
    return principal;
  }
  throw new Error(`${label}无效`);
}

export function validateStartAssets(value) {
  const assets = record(value, '资产起点');
  if (assets.schemaVersion !== 1) throw new Error('资产起点版本必须为 1');
  const instances = array(assets.instances, '资产起点.instances');
  for (const entry of instances) {
    const instance = record(entry, '资产实例');
    validateExactKeys(instance, ASSET_INSTANCE_KEYS, '资产实例');
    for (const key of ASSET_INSTANCE_KEYS) {
      if (key !== 'overrides' && !(key in instance)) throw new Error(`资产实例缺少字段：${key}`);
    }
    if (instance.kind !== 'item') throw new Error(`资产实例 kind 无效：${instance.kind}`);
    for (const field of ['lawfulOwner', 'controller', 'custodian', 'placement']) {
      if (instance[field] !== null) validatePrincipal(instance[field], `资产实例 ${instance.instanceId} ${field}`);
    }
    if (instance.equippedPosition !== null) validateEquipmentPosition(instance.equippedPosition, `资产实例 ${instance.instanceId} equippedPosition`);
    if (!ASSET_STATUS_VALUES.has(instance.status)) throw new Error(`资产实例 status 无效：${instance.status}`);
    if (instance.equippedPosition !== null && instance.placement?.type !== 'character') {
      throw new Error(`资产实例装备位置要求人物保管：${instance.instanceId}`);
    }
    if ('overrides' in instance) {
      const overrides = record(instance.overrides, '资产实例覆盖');
      validateExactKeys(overrides, ASSET_OVERRIDE_KEYS, '资产实例覆盖');
      if ('charges' in overrides && (!Number.isInteger(overrides.charges) || overrides.charges < 0)) throw new Error('资产实例覆盖 charges 无效');
      if ('renown' in overrides && (!Number.isFinite(overrides.renown) || overrides.renown < 0)) throw new Error('资产实例覆盖 renown 无效');
      if ('isHeirloom' in overrides && typeof overrides.isHeirloom !== 'boolean') throw new Error('资产实例覆盖 isHeirloom 无效');
      if ('customName' in overrides && (typeof overrides.customName !== 'string' || !overrides.customName.trim())) throw new Error('资产实例覆盖 customName 无效');
    }
  }
  const sites = array(assets.sites, '资产起点.sites');
  for (const entry of sites) {
    const site = record(entry, '保管站点');
    validateExactKeys(site, SITE_KEYS, '保管站点');
    if (!SITE_TYPES.has(site.type)) throw new Error(`保管站点类型无效：${site.type}`);
    validateAssetLocation(site.location, `保管站点 ${site.id} location`);
    if ('capacity' in site && (!Number.isInteger(site.capacity) || site.capacity < 0)) throw new Error('保管站点容量无效');
  }
  const vehicles = array(assets.vehicles, '资产起点.vehicles');
  for (const entry of vehicles) {
    const vehicle = record(entry, '载具');
    validateExactKeys(vehicle, VEHICLE_KEYS, '载具');
    if (!VEHICLE_TYPES.has(vehicle.type)) throw new Error(`载具类型无效：${vehicle.type}`);
    validateAssetLocation(vehicle.location, `载具 ${vehicle.id} location`);
    if (!Number.isInteger(vehicle.capacity) || vehicle.capacity < 0) throw new Error('载具容量无效');
  }
  return assets;
}

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

export function validateStartCharacters(value) {
  const characters = array(value, '人物起点');
  for (const entry of characters) {
    const character = record(entry, '人物起点记录');
    for (const key of Object.keys(character)) {
      if (!START_CHARACTER_KEYS.has(key)) throw new Error(`人物起点记录含未知字段：${key}`);
    }
    for (const key of ['characterId', 'location', 'currentActivity']) {
      if (!(key in character)) throw new Error(`人物起点记录缺少字段：${key}`);
    }
    const location = record(character.location, '人物起点位置');
    for (const key of Object.keys(location)) {
      if (!START_CHARACTER_LOCATION_KEYS.has(key)) throw new Error(`人物起点位置含未知字段：${key}`);
    }
    if (typeof location.locationId !== 'string' || !location.locationId.trim()) throw new Error('人物起点位置 locationId 无效');
    if ('sceneLocation' in location && (typeof location.sceneLocation !== 'string' || !location.sceneLocation.trim())) {
      throw new Error('人物起点位置 sceneLocation 无效');
    }
    if (!CHARACTER_ACTIVITIES.has(character.currentActivity)) throw new Error(`人物起点活动值无效：${character.currentActivity}`);
    if ('aliveOverride' in character && typeof character.aliveOverride !== 'boolean') throw new Error('人物起点 aliveOverride 必须是布尔值');
    if ('wounds' in character) {
      const wounds = array(character.wounds, '人物起点伤势');
      if (wounds.some((wound) => typeof wound !== 'string' || !wound.trim())) throw new Error('人物起点伤势必须是非空字符串');
    }
  }
  return characters;
}

export function validateWorldSource(source) {
  validateWorldManifest(source.manifest);
  const playable = array(source.playableCharacters, '可玩人物');
  const characters = validateStartCharacters(source.startCharacters);
  const titles = array(source.startTitles, '头衔起点');
  assertNoDuplicateIds(playable, 'characterId', '可玩人物');
  assertNoDuplicateIds(characters, 'characterId', '人物起点');
  assertNoDuplicateIds(titles, 'titleId', '头衔起点');

  const assets = validateStartAssets(source.startAssets);
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
