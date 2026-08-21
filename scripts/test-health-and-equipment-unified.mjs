import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

async function bundleModule(entryPoint) {
  const bundle = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}

const { ITEM_CATALOG, ITEM_DEFINITIONS, preloadItemCatalog } = await bundleModule('src/data/itemDefinitions.ts');
await preloadItemCatalog();
const { NPC_LOADOUT_TEMPLATES } = await bundleModule('src/data/npcLoadoutTemplates.ts');
const { NPC_LOADOUT_OVERRIDES } = await bundleModule('src/data/npcLoadoutOverrides.ts');
const { expandBaselineLoadout } = await bundleModule('src/features/characters/characterItems.ts');
const { resolveCharacterTraits } = await bundleModule('src/data/characterTraits.ts');
const { CHARACTER_DOSSIER_SUPPLEMENTS } = await bundleModule('src/data/generated/characterDossierSupplements.ts');

test('1. 物品目录完备性与中文命名（无 Emoji）', () => {
  assert.ok(ITEM_DEFINITIONS.length >= 600, `物品总数应丰富，当前为 ${ITEM_DEFINITIONS.length}`);
  assert.equal(ITEM_CATALOG.size, ITEM_DEFINITIONS.length);
  for (const item of ITEM_DEFINITIONS) {
    assert.ok(item.name && item.name.trim().length > 0, `物品 ${item.id} 缺少名称`);
    assert.ok(item.description && item.description.trim().length > 0, `物品 ${item.id} 缺少描述`);
    // 确保没有 Emoji
    assert.doesNotMatch(item.name, /\p{Extended_Pictographic}/u, `物品名称不得含有 Emoji: ${item.name}`);
    assert.doesNotMatch(item.description, /\p{Extended_Pictographic}/u, `物品描述不得含有 Emoji: ${item.description}`);
  }
});

test('2. 装备槽位规范：披风属于 torso.outerwear，双腿包含 legwear 与 footwear', () => {
  for (const item of ITEM_DEFINITIONS) {
    for (const pos of item.allowedPositions) {
      if (pos.group === 'torso') {
        assert.ok(['garment', 'armor', 'outerwear'].includes(pos.layer), `${item.id} 躯干层级不合法: ${pos.layer}`);
      } else if (pos.group === 'legs') {
        assert.ok(['legwear', 'footwear'].includes(pos.layer), `${item.id} 腿部层级不合法: ${pos.layer}`);
      } else if (pos.group === 'accessories') {
        assert.ok([0, 1, 2].includes(pos.index), `${item.id} 佩饰索引不合法: ${pos.index}`);
      } else {
        assert.ok(['head', 'mainhand', 'offhand'].includes(pos.group), `${item.id} 槽位组不合法: ${pos.group}`);
      }
    }
  }
});

test('3. 日常模板数量与全九大地区/身份覆盖度', () => {
  const templateCount = Object.keys(NPC_LOADOUT_TEMPLATES).length;
  assert.ok(templateCount >= 30, `模板数量应 >= 30，当前为 ${templateCount}`);

  const requiredRegions = [
    'northern', 'riverlands', 'vale', 'westerlands',
    'reach', 'stormlands', 'crownlands', 'dornish', 'ironborn',
  ];
  for (const region of requiredRegions) {
    const matched = Object.keys(NPC_LOADOUT_TEMPLATES).some((id) => id.includes(region));
    assert.ok(matched, `缺少地区日常模板：${region}`);
  }

  const requiredSpecial = [
    'infant', 'child_noble', 'child_common', 'nights_watch_ranger',
    'beyond_the_wall_freefolk', 'maester', 'septon', 'silent_sister',
    'kingsguard_duty', 'city_watch_duty', 'merchant_wealthy',
  ];
  for (const special of requiredSpecial) {
    assert.ok(NPC_LOADOUT_TEMPLATES[special], `缺少特殊身份/年龄模板：${special}`);
  }
});

test('4. 成人日常模板必含服装、长裤与鞋履', () => {
  for (const template of Object.values(NPC_LOADOUT_TEMPLATES).filter((t) => t.ageGroup === 'adult')) {
    const slots = template.slots.map((s) => s.position.group === 'legs' ? `legs:${s.position.layer}` : s.position.group === 'torso' ? `torso:${s.position.layer}` : s.position.group);
    assert.ok(slots.includes('torso:garment'), `成人模板 ${template.id} 缺少 garment 服装`);
    assert.ok(slots.includes('legs:legwear'), `成人模板 ${template.id} 缺少 legwear 裤装`);
    assert.ok(slots.includes('legs:footwear'), `成人模板 ${template.id} 缺少 footwear 鞋履`);
  }
});

test('5. 婴儿与儿童规则：无不合理成人武器与护甲', () => {
  for (const template of Object.values(NPC_LOADOUT_TEMPLATES).filter((t) => t.ageGroup === 'infant' || t.ageGroup === 'child')) {
    for (const slot of template.slots) {
      const def = ITEM_CATALOG.get(slot.definitionId);
      assert.notEqual(def.category, 'weapon', `儿童/婴儿模板 ${template.id} 不得包含常规武器`);
      assert.notEqual(def.category, 'armor', `儿童/婴儿模板 ${template.id} 不得包含成人护甲`);
    }
  }
});

test('6. 重点人物人工覆盖在 expandBaselineLoadout 中的逐槽位真实解析', () => {
  const nedRecord = {
    id: 'agot:Stark_3',
    rawId: 'Stark_3',
    name: '艾德·史塔克',
    born: true,
    alive: true,
    birthDate: '8263.1.1',
    cultureId: 'northman',
    traits: ['honest', 'just'],
  };
  const profile = { characterId: 'agot:Stark_3', templateId: 'northern_noble', overrideId: 'eddard_stark_daily' };

  const items = expandBaselineLoadout(nedRecord, profile);
  assert.ok(items.length >= 4, '奈德日常装束应展开服装、裤装、鞋履和外披');

  const positions = items.map((i) => i.equippedPosition);
  assert.ok(positions.some((p) => p.group === 'torso' && p.layer === 'garment'), '奈德包含躯干服装');
  assert.ok(positions.some((p) => p.group === 'torso' && p.layer === 'outerwear'), '奈德包含毛皮斗篷');
  assert.equal(positions.some((p) => p.group === 'mainhand' || p.group === 'offhand'), false, '奈德静态日常装束不应默认持有武器');

  // 验证所有物品在 ITEM_CATALOG 中合法存在
  for (const item of items) {
    const def = ITEM_CATALOG.get(item.definitionId);
    assert.ok(def, `奈德物品 ${item.definitionId} 在目录中存在`);
    assert.equal(item.ownerId, 'agot:Stark_3');
    assert.equal(item.custody.characterId, 'agot:Stark_3');
  }
});

test('7. 重点人物名录覆盖验证（包含多恩、铁群岛、长城、君临等首领）', () => {
  const checkList = [
    { id: 'agot:Stark_3', name: '奈德·史塔克', expectedGarment: 'clothing.northern_wool_tunic' },
    { id: 'agot:Baratheon_2', name: '劳勃·拜拉席恩', expectedGarment: 'clothing.stormlands_leather_vest_tunic' },
    { id: 'agot:Lannister_1', name: '泰温·兰尼斯特', expectedGarment: 'clothing.westerlands_crimson_doublet' },
    { id: 'agot:Lannister_7', name: '詹姆·兰尼斯特', expectedOuterwear: 'clothing.kingsguard_white_cloak' },
    { id: 'agot:Lannister_8', name: '提利昂·兰尼斯特', expectedAccessory: 'jewelry.tyrion_golden_ring' },
    { id: 'agot:Targaryen_9', name: '丹妮莉丝·坦格利安', expectedGarment: 'clothing.pentos_silk_robe' },
    { id: 'agot:Martell_4', name: '道朗·马泰尔', expectedGarment: 'clothing.dornish_flowing_silk_robe' },
    { id: 'agot:Greyjoy_5', name: '巴隆·葛雷乔伊', expectedGarment: 'clothing.ironborn_seal_skin_coat' },
    { id: 'agot:Mormont_2', name: '杰奥·莫尔蒙', expectedOuterwear: 'clothing.black_winter_cloak' },
    { id: 'agot:Targaryen_120', name: '伊蒙学士', expectedAccessory: 'jewelry.maester_metal_collar' },
    { id: 'agot:Arryn_3', name: '琼恩·艾林', expectedAccessory: 'jewelry.hand_of_the_king_badge' },
    { id: 'agot:Baelish_2', name: '培提尔·贝里席', expectedAccessory: 'jewelry.baelish_silver_mockingbird' },
  ];

  for (const target of checkList) {
    const override = NPC_LOADOUT_OVERRIDES[target.id];
    assert.ok(override, `${target.name} (${target.id}) 应具有显式覆盖定义`);
    const mockRecord = { id: target.id, rawId: target.id.replace('agot:', ''), name: target.name, born: true, alive: true };
    const items = expandBaselineLoadout(mockRecord, { characterId: target.id, templateId: override.templateId || 'generic', overrideId: override.id });
    assert.ok(items.length > 0, `${target.name} 展开装备不应为空`);

    assert.equal(items.some((i) => ['weapon', 'armor'].includes(ITEM_CATALOG.get(i.definitionId)?.category)), false, `${target.name} 的静态日常装束不得包含武器或护甲`);
    if (target.expectedAccessory) {
      assert.ok(items.some((i) => i.definitionId === target.expectedAccessory), `${target.name} 应佩戴 ${target.expectedAccessory}`);
    }
    if (target.expectedGarment) {
      assert.ok(items.some((i) => i.definitionId === target.expectedGarment), `${target.name} 应穿戴服装 ${target.expectedGarment}`);
    }
    if (target.expectedOuterwear) {
      assert.ok(items.some((i) => i.definitionId === target.expectedOuterwear), `${target.name} 应穿戴外披 ${target.expectedOuterwear}`);
    }
  }
});

test('8. 语义隔离：实际穿戴不混淆城堡储藏或传家宝', () => {
  const nedRecord = { id: 'agot:Stark_3', rawId: 'Stark_3', name: '艾德·史塔克', born: true, alive: true };
  const items = expandBaselineLoadout(nedRecord, { characterId: 'agot:Stark_3', templateId: 'northern_noble', overrideId: 'eddard_stark_daily' });
  const itemIds = items.map((i) => i.definitionId);
  // 寒冰与普通佩剑都不属于静态日常穿戴；需要剧情中的明确装备动作后才显示
  assert.equal(itemIds.includes('artifact.ice'), false, '奈德日常实际穿戴绝不应强行装备寒冰巨剑');
  assert.equal(items.some((item) => ITEM_CATALOG.get(item.definitionId)?.category === 'weapon'), false, '奈德日常状态不应默认持剑');
});

test('9. 长期健康特质（病残、疤痕、状态）解析与筛选机制', () => {
  const sampleTraitIds = ['brave', 'maimed', 'one_eyed', 'scarred', 'strong', 'gout_ridden'];
  const resolved = resolveCharacterTraits(sampleTraitIds);
  const healthTraits = resolved.filter((t) => t.category === 'health' || t.id.startsWith('maim') || t.id.startsWith('one_') || t.id.startsWith('scar'));

  assert.ok(healthTraits.length >= 3, `应识别出伤残健康特质，当前识别数: ${healthTraits.length}`);
  const names = healthTraits.map((t) => t.name);
  assert.ok(names.includes('残废') || names.includes('独眼') || names.includes('伤疤') || names.includes('痛风'));
});

test('10. 健康与资产界面只读取统一世界资产分组', () => {
  const healthPanel = readFileSync('src/components/items/HealthAndEquipmentPanel.tsx', 'utf8');
  const assetSections = readFileSync('src/components/items/WorldAssetSections.tsx', 'utf8');
  const characterWindow = [
    readFileSync('src/components/Ck3CharacterWindow.tsx', 'utf8'),
    readFileSync('src/components/character-window/CharacterAssetsTab.tsx', 'utf8'),
  ].join('\n');
  assert.match(healthPanel, /dossier\.assetGroups\.equipment/);
  assert.match(healthPanel, /asset\.definitionId/);
  assert.doesNotMatch(healthPanel, /projectNpcEquipment/);
  assert.doesNotMatch(healthPanel, /worldArtifacts/);
  assert.doesNotMatch(assetSections, /worldArtifacts/);
  for (const group of ['carried', 'custody', 'ownedElsewhere', 'controlled', 'sites', 'vehicles']) {
    assert.match(assetSections, new RegExp(`groups\\.${group}`));
  }
  assert.match(characterWindow, /<WorldAssetSections/);
});
