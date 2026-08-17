# CK3 风格装备与物品系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The user has explicitly declined subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a data-driven item system with unique instances, authoritative custody, grouped equipment, real D20 and narrative effects, queued world actions, CK3-style UI, and locally stored Wiki imagery.

**Architecture:** Immutable `ItemDefinition` records live in a validated catalog; mutable `ItemInstance` records and a single `placements` map live in `LordProfile.items`. Focused services own custody, equipment compatibility, effects, and queued actions, while React panels consume pure view models instead of editing arrays directly.

**Tech Stack:** TypeScript 5.7, React 18, Zustand 5, Dexie 4, Vite 6, Tailwind CSS 3, Node test runner, esbuild-based TypeScript test bundles.

**Spec:** `docs/superpowers/specs/2026-08-17-equipment-item-system-design.md`

## Global Constraints

- The project is still a test build: do not preserve old save compatibility, old item fields, old cloak slots, or old equipment commands in the final tree.
- A save with an unsupported item schema version must be rejected with an explicit reset message; never guess a migration.
- The normal equipment view exposes exactly six groups: `head`, `torso`, `mainhand`, `offhand`, `feet`, and `accessories`.
- Torso layers are `garment`, `armor`, and `outerwear`; there is no independent cloak group or shoulder position.
- The accessories group contains exactly three flexible positions.
- Mainhand and offhand remain visually symmetric; a two-handed item occupies both logically.
- Item cards expand when clicked; no independent button or action labeled `检视` may remain.
- World-changing item actions take effect only after the next successful dialogue response; a failed response leaves the queue and state unchanged.
- D20-off mode must not invent hidden percentages; item advantages become deterministic rules and narrative constraints.
- Use existing CK3/AGOT icons first, local Wiki images second, and high-quality icon-library fallbacks last. Do not use Emoji.
- Do not read local vanilla or AGOT Mod files to generate the new item catalog.
- Preserve unrelated uncommitted visual work; execute this plan in an isolated worktree or after those changes have been committed.

---

## File and Module Map

### New domain modules

- `src/features/items/types.ts`: all item definition, instance, placement, container, equipment-position, effect, history, and action contracts.
- `src/features/items/catalog.ts`: catalog validation and definition lookup.
- `src/features/items/state.ts`: empty state creation, instance creation, cloning, stack splitting, and invariant validation.
- `src/features/items/custody.ts`: accessibility, capacity, placement queries, and atomic transfers.
- `src/features/items/equipment.ts`: six-group compatibility, torso layers, accessory indices, and two-handed reservations.
- `src/features/items/effects.ts`: equipped-effect aggregation, D20 modifiers, protection, burden, heat, and narrative directives.
- `src/features/items/actions.ts`: validation and atomic application of all world-changing item actions.
- `src/features/items/itemActionQueue.ts`: queue replacement, cancellation, prompt formatting, and command merging.
- `src/features/items/viewModel.ts`: stable UI models for equipment groups, cards, details, filters, and custody tabs.

### New data and UI modules

- `src/data/itemDefinitions.ts`: common, regional, cultural, and unique item definitions.
- `src/data/itemPresetState.ts`: deterministic item-system factories for each preset and the ruler designer.
- `src/components/items/ItemImage.tsx`: game-icon, Wiki-image, and icon-library fallback renderer.
- `src/components/items/ItemCard.tsx`: expandable item card without an inspect button.
- `src/components/items/ItemDetail.tsx`: effects, provenance, durability, history, and contextual actions.
- `src/components/items/EquipmentPanel.tsx`: six grouped equipment cards and aggregate status.
- `src/components/items/ItemManagementPanel.tsx`: carried, current-site, vehicle, and remote-storage management.

### New asset support

- `public/assets/item-images/source-manifest.json`: local file, source page, source image, attribution, license note, and retrieval date.
- `scripts/fetch-item-images.mjs`: deterministic Wiki image downloader with content hash verification.
- `scripts/check-item-images.mjs`: manifest, local file, attribution, and no-hotlink validation.

### Existing integration points

- `src/types/game.ts`: replace legacy gear and inventory contracts with `ItemSystemState`; update `StateCommand` and `D20Check`.
- `src/data/presets.ts`: use deterministic item preset factories.
- `src/components/CharacterCreator.tsx`: build a fresh item system for custom rulers.
- `src/services/db.ts`: enforce the new save format version and remove item migration calls.
- `src/services/stateReducer.ts`: delegate item commands, injury mitigation, durability, and consumption to item services.
- `src/services/diceEngine.ts`: replace mainhand-quality heuristics with item effect resolution.
- `src/services/promptBuilder.ts`: expose relevant item state and queued actions without teaching legacy commands.
- `src/services/api.ts`: update offline item acquisition/equipment behavior to definition and instance IDs.
- `src/store/useGameStore.ts`: replace the equipment-only queue with a generic item-action queue.
- `src/components/ActionDock.tsx`: display all queued item actions.
- `src/components/CharacterSheet.tsx`: embed `EquipmentPanel` and remove storage/item duplication.
- `src/components/Ck3CharacterWindow.tsx`: embed `ItemManagementPanel` in the carried-items tab.
- `src/components/GameIcon.tsx`: support item image references without weakening typed game-icon lookup.
- `scripts/check-current-equipment.mjs`: replace legacy source markers with new invariants.
- `scripts/check-ck3-character-window.mjs`: assert grouped equipment and item-management UI rules.
- `package.json`: register all new tests and checks in `verify`.

---

### Task 1: Define and validate the item domain contract

**Files:**
- Create: `src/features/items/types.ts`
- Create: `src/features/items/catalog.ts`
- Create: `scripts/test-item-catalog.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `ItemDefinition`, `ItemInstance`, `ItemSystemState`, `ItemPlacement`, `EquipmentPosition`, `ItemEffect`, `ItemAction`, `createItemCatalog()`, and `getItemDefinition()`.
- Consumes: `TraitCheckDomain` from `src/services/traitEffectEngine.ts` as a type-only import; item body zones are declared locally to avoid a cycle with `src/types/game.ts`.

- [ ] **Step 1: Write the failing catalog test**

Create an esbuild-bundled Node test that asserts duplicate definitions fail, unique items cannot be stackable, torso layers and accessory indices are accepted, and unknown IDs fail closed:

```js
const sword = definition({ id: 'weapon.castle_sword', category: 'weapon', stackable: false });
assert.throws(() => createItemCatalog([sword, sword]), /重复物品定义/);
assert.throws(() => createItemCatalog([definition({ id: 'artifact.ice', unique: true, stackable: true })]), /唯一物品不能堆叠/);
const catalog = createItemCatalog([sword]);
assert.equal(getItemDefinition(catalog, 'weapon.castle_sword').name, '城堡精钢长剑');
assert.throws(() => getItemDefinition(catalog, 'missing'), /未知物品定义/);
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `node scripts/test-item-catalog.mjs`

Expected: FAIL because `src/features/items/catalog.ts` does not exist.

- [ ] **Step 3: Add the exact domain unions**

Define these public unions in `types.ts`:

```ts
export type ItemCategory = 'weapon' | 'armor' | 'clothing' | 'jewelry' | 'tool' | 'document' | 'medicine' | 'poison' | 'supply' | 'keepsake';
export type ItemBulk = 'tiny' | 'small' | 'medium' | 'large';
export type CraftQuality = 'rough' | 'common' | 'fine' | 'masterwork' | 'legendary';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'illustrious' | 'unique';
export type EquipmentGroup = 'head' | 'torso' | 'mainhand' | 'offhand' | 'feet' | 'accessories';
export type TorsoLayer = 'garment' | 'armor' | 'outerwear';
export type AccessoryIndex = 0 | 1 | 2;
export type EquipmentPosition =
  | { group: 'head' | 'mainhand' | 'offhand' | 'feet' }
  | { group: 'torso'; layer: TorsoLayer }
  | { group: 'accessories'; index: AccessoryIndex };
export type ItemPlacement =
  | { type: 'carried' }
  | { type: 'site'; siteId: string }
  | { type: 'vehicle'; vehicleId: string }
  | { type: 'equipped'; position: EquipmentPosition }
  | { type: 'character'; characterId: string }
  | { type: 'lost'; reason: string };
```

Define the remaining public contracts exactly once in the same file:

```ts
export type ItemBodyZone = 'head' | 'torso' | 'arms' | 'legs';
export type ItemImageRef =
  | { type: 'game'; icon: string }
  | { type: 'wiki'; path: string; fallbackIcon: string }
  | { type: 'library'; iconName: string };
export interface ItemEffectCondition {
  actionPatterns?: string[];
  requiredSceneTags?: string[];
  forbiddenSceneTags?: string[];
  requiredItemTags?: string[];
}
export type ItemEffect =
  | { kind: 'check_modifier'; domain: TraitCheckDomain; value: number; stackGroup: string; cap?: number; condition?: ItemEffectCondition; label: string }
  | { kind: 'action_unlock'; actionId: string; label: string; condition?: ItemEffectCondition }
  | { kind: 'protection'; zones: ItemBodyZone[]; damageTags: string[]; value: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'social'; contextTags: string[]; value: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'burden'; value: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'fatigue'; contextTags: string[]; value: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'heat'; contextTags: string[]; value: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'resource'; target: 'goldGain' | 'prestigeGain' | 'dreadGain' | 'recoverySpeed'; value: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'capacity'; categories: ItemCategory[]; units: number; stackGroup: string; cap?: number; label: string }
  | { kind: 'narrative'; directive: string; condition?: ItemEffectCondition };
export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  roleplayText: string;
  category: ItemCategory;
  subcategory: string;
  tags: string[];
  image: ItemImageRef;
  material: string;
  baseQuality: CraftQuality;
  rarity: ItemRarity;
  bulk: ItemBulk;
  stackable: boolean;
  maxStack: number;
  unique: boolean;
  equippable: boolean;
  allowedPositions: EquipmentPosition[];
  handedness?: 'one' | 'two';
  baseValue: number;
  effects: ItemEffect[];
  provenance?: { maker?: string; origin?: string; createdAt?: string; boundHouse?: string };
}
export interface ItemHistoryEntry {
  id: string;
  type: 'created' | 'acquired' | 'gifted' | 'inherited' | 'stolen' | 'lost' | 'recovered' | 'repaired' | 'heirloom';
  date: string;
  summary: string;
  actorId?: string;
  targetId?: string;
}
export interface ItemInstance {
  instanceId: string;
  definitionId: string;
  quantity: number;
  charges?: number;
  durability: number;
  quality: CraftQuality;
  customName?: string;
  lawfulControllerId?: string;
  renown: number;
  isHeirloom: boolean;
  history: ItemHistoryEntry[];
}
export interface ItemStorageSite { id: string; name: string; type: 'armory' | 'wardrobe' | 'room' | 'warehouse' | 'stable' | 'camp' | 'other'; location: string; description: string; capacity?: number }
export interface ItemTransport { id: string; name: string; type: 'packhorse' | 'wagon' | 'ship' | 'other'; location: string; capacity: number; description: string }
export interface ItemSystemState {
  schemaVersion: 1;
  instances: Record<string, ItemInstance>;
  placements: Record<string, ItemPlacement>;
  sites: Record<string, ItemStorageSite>;
  vehicles: Record<string, ItemTransport>;
}
export type ItemCatalog = ReadonlyMap<string, ItemDefinition>;
export type ItemAction =
  | { kind: 'acquire'; instance: ItemInstance; placement: ItemPlacement; historyType: 'acquired' | 'inherited' | 'stolen' | 'recovered' }
  | { kind: 'equip'; instanceId: string; position: EquipmentPosition; displacedTo: ItemPlacement }
  | { kind: 'unequip'; instanceId: string; to: ItemPlacement }
  | { kind: 'use'; instanceId: string; quantity?: number }
  | { kind: 'transfer'; instanceId: string; to: ItemPlacement; quantity?: number; newInstanceId?: string }
  | { kind: 'gift'; instanceId: string; recipientId: string; quantity?: number; newInstanceId?: string }
  | { kind: 'discard'; instanceId: string; quantity?: number; newInstanceId?: string }
  | { kind: 'repair'; instanceId: string; amount: number }
  | { kind: 'damage'; instanceId: string; amount: number; reason: string }
  | { kind: 'split'; instanceId: string; quantity: number; newInstanceId: string; to: ItemPlacement }
  | { kind: 'merge'; sourceInstanceId: string; targetInstanceId: string }
  | { kind: 'mark_heirloom'; instanceId: string; houseId: string };
export type ItemStateCommand =
  | { type: 'ITEM_CREATE'; instance: ItemInstance; placement: ItemPlacement; historyType: 'acquired' | 'inherited' | 'stolen' | 'recovered' }
  | { type: 'ITEM_EQUIP'; instanceId: string; position: EquipmentPosition; displacedTo: ItemPlacement }
  | { type: 'ITEM_UNEQUIP'; instanceId: string; to: ItemPlacement }
  | { type: 'ITEM_USE'; instanceId: string; quantity?: number }
  | { type: 'ITEM_TRANSFER'; instanceId: string; to: ItemPlacement; quantity?: number; newInstanceId?: string }
  | { type: 'ITEM_GIFT'; instanceId: string; recipientId: string; quantity?: number; newInstanceId?: string }
  | { type: 'ITEM_DISCARD'; instanceId: string; quantity?: number; newInstanceId?: string }
  | { type: 'ITEM_REPAIR'; instanceId: string; amount: number }
  | { type: 'ITEM_DAMAGE'; instanceId: string; amount: number; reason: string }
  | { type: 'ITEM_SPLIT'; instanceId: string; quantity: number; newInstanceId: string; to: ItemPlacement }
  | { type: 'ITEM_MERGE'; sourceInstanceId: string; targetInstanceId: string }
  | { type: 'ITEM_MARK_HEIRLOOM'; instanceId: string; houseId: string };
```

- [ ] **Step 4: Implement strict catalog validation**

`createItemCatalog(definitions)` returns `ReadonlyMap<string, ItemDefinition>` and rejects empty IDs, duplicate IDs, `unique && stackable`, invalid maximum stacks, equippable items with no allowed positions, and non-equippable definitions that declare equipment positions.

- [ ] **Step 5: Register and run the test**

Add `test:item-catalog` to `package.json` and run:

```bash
npm run test:item-catalog
npm run build
```

Expected: PASS; TypeScript accepts all new contracts without changing existing item consumers yet.

- [ ] **Step 6: Commit**

```bash
git add src/features/items/types.ts src/features/items/catalog.ts scripts/test-item-catalog.mjs package.json
git commit -m "feat: define item domain and catalog"
```

---

### Task 2: Implement instances, placements, capacity, and custody

**Files:**
- Create: `src/features/items/state.ts`
- Create: `src/features/items/custody.ts`
- Create: `scripts/test-item-custody.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ItemSystemState`, `ItemInstance`, `ItemPlacement`, and `ItemCatalog` from Task 1.
- Produces: `createEmptyItemSystem()`, `createItemInstance()`, `validateItemSystem()`, `listItemsAt()`, `getCarryUnits()`, `getStorageUnits()`, `getUsedCarryUnits()`, `canTransferItem()`, and `transferItem()`.

- [ ] **Step 1: Write failing invariant and capacity tests**

Test these exact cases:

```js
assert.equal(getCarryUnits('tiny'), 0.25);
assert.equal(getCarryUnits('small'), 1);
assert.equal(getCarryUnits('medium'), 2);
assert.equal(getCarryUnits('large'), Number.POSITIVE_INFINITY);
assert.equal(getStorageUnits('large'), 4);
assert.equal(getUsedCarryUnits(state, catalog), 2.5);
assert.deepEqual(transferItem(state, 'inst_rope', { type: 'site', siteId: 'winterfell_armory' }).placements.inst_rope, { type: 'site', siteId: 'winterfell_armory' });
assert.throws(() => transferItem(fullState, 'inst_rope', { type: 'carried' }), /随身容量不足/);
assert.throws(() => validateItemSystem(duplicatePlacementFixture, catalog), /位置记录与实例不一致/);
```

Also assert a carried specialized `medicine_pouch` grants two extra units only to `medicine` and `poison`, not weapons; a large item is rejected from `carried` but consumes four units in a vehicle or capacity-limited site.

- [ ] **Step 2: Run the test and verify failure**

Run: `node scripts/test-item-custody.mjs`

Expected: FAIL because custody functions are missing.

- [ ] **Step 3: Implement the authoritative state shape**

Use one placement map and metadata-only containers:

```ts
export interface ItemSystemState {
  schemaVersion: 1;
  instances: Record<string, ItemInstance>;
  placements: Record<string, ItemPlacement>;
  sites: Record<string, ItemStorageSite>;
  vehicles: Record<string, ItemTransport>;
}
```

`validateItemSystem()` requires an exact key match between `instances` and `placements`, valid definition IDs, unique-artifact uniqueness by `definitionId`, positive stack quantities, existing site/vehicle references, and no over-capacity carried state.

- [ ] **Step 4: Implement atomic transfers**

`transferItem()` must reject `{ type: 'equipped' }` targets so only `equipItem()` can occupy equipment positions. It clones state, validates source accessibility and target capacity, splits a stack only when `quantity` is smaller than the current quantity, generate a stable child ID from the caller-provided `newInstanceId`, and return the untouched original state on validation failure.

- [ ] **Step 5: Run custody tests and build**

```bash
npm run test:item-custody
npm run test:item-catalog
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/items/state.ts src/features/items/custody.ts scripts/test-item-custody.mjs package.json
git commit -m "feat: add authoritative item custody"
```

---

### Task 3: Implement six-group equipment compatibility

**Files:**
- Create: `src/features/items/equipment.ts`
- Create: `scripts/test-item-equipment.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: catalog and custody services from Tasks 1-2.
- Produces: `getEquippedInstance()`, `getEquipmentGroups()`, `canEquipItem()`, `equipItem()`, `unequipItem()`, and `getReservedPositions()`.

- [ ] **Step 1: Write failing equipment tests**

Cover all six groups and exact hidden positions:

```js
assert.deepEqual(EQUIPMENT_GROUPS, ['head', 'torso', 'mainhand', 'offhand', 'feet', 'accessories']);
assert.equal(TORSO_LAYERS.join(','), 'garment,armor,outerwear');
assert.equal(ACCESSORY_INDICES.length, 3);
assert.equal(EQUIPMENT_GROUPS.includes('cloak'), false);
assert.equal(EQUIPMENT_GROUPS.includes('shoulder'), false);
```

Add behavior tests: armor and outerwear coexist in torso, a fourth accessory is rejected, equipping a two-handed sword clears/reserves offhand, and equipping a shield while a two-handed sword is active is rejected.

- [ ] **Step 2: Run the test and verify failure**

Run: `node scripts/test-item-equipment.mjs`

Expected: FAIL because the equipment module is missing.

- [ ] **Step 3: Implement compatibility from definition data**

Do not infer positions from Chinese item names. `canEquipItem()` reads `definition.allowedPositions`, `definition.handedness`, instance durability, and current placements. Broken items with durability `0` cannot be equipped.

- [ ] **Step 4: Implement atomic equip and unequip**

`equipItem()` moves displaced items to a caller-provided accessible destination, or fails without changes. `unequipItem()` uses custody capacity checks. Two-handed items use a mainhand placement plus a derived offhand reservation; they do not duplicate the instance ID.

- [ ] **Step 5: Run tests and build**

```bash
npm run test:item-equipment
npm run test:item-custody
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/items/equipment.ts scripts/test-item-equipment.mjs package.json
git commit -m "feat: add grouped equipment rules"
```

---

### Task 4: Implement structured item effects

**Files:**
- Create: `src/features/items/effects.ts`
- Create: `scripts/test-item-effects.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: equipped instances, catalog definitions, `TraitCheckDomain`, and `ItemBodyZone`.
- Produces: `aggregateEquippedItemEffects()`, `getItemCheckModifier()`, `getZoneProtection()`, `mitigateWoundLevel()`, `getEquipmentBurden()`, and `formatItemNarrativeDirectives()`.

- [ ] **Step 1: Write failing effect tests**

Test conditional and capped behavior:

```js
assert.equal(getItemCheckModifier(effects, { domain: 'duel', actionText: '持剑近身决斗', sceneTags: ['melee'] }), 3);
assert.equal(getItemCheckModifier(effects, { domain: 'diplomacy', actionText: '宫廷谈判', sceneTags: ['court'] }), -1);
assert.equal(getZoneProtection(effects, 'torso', ['slashing']), 3);
assert.equal(mitigateWoundLevel('critical', 3), 'heavy');
assert.equal(mitigateWoundLevel('minor', 0), 'minor');
assert.ok(formatItemNarrativeDirectives(effects).some((line) => line.includes('重甲')));
```

Add a stacking test proving three effects in `duel.weapon` cannot exceed the group cap of `+5`.

- [ ] **Step 2: Run the test and verify failure**

Run: `node scripts/test-item-effects.mjs`

Expected: FAIL because `effects.ts` is missing.

- [ ] **Step 3: Implement effect filtering and caps**

Filter by domain, action patterns, scene tags, body zone, and damage tags. Aggregate each `stackGroup` before applying the declared cap. Ignore effects from zero-durability instances.

- [ ] **Step 4: Implement deterministic narrative-mode outputs**

Return signed check modifiers for D20 mode, but return plain-language directives, action unlock IDs, protection, burden, heat, and fatigue for narrative mode. Do not return percentages.

- [ ] **Step 5: Run tests and build**

```bash
npm run test:item-effects
npm run test:trait-effects
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/items/effects.ts scripts/test-item-effects.mjs package.json
git commit -m "feat: add contextual item effects"
```

---

### Task 5: Implement item actions and the generic queue

**Files:**
- Create: `src/features/items/actions.ts`
- Create: `src/features/items/itemActionQueue.ts`
- Create: `scripts/test-item-actions.mjs`
- Create: `scripts/test-item-action-queue.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: custody and equipment services.
- Produces: `validateItemAction()`, `applyItemActions()`, `createPendingItemAction()`, `enqueueItemAction()`, `cancelItemAction()`, `mergePendingItemCommands()`, `removeSubmittedItemActions()`, and `formatPendingItemPrompt()`.

Use these exact action-layer contracts:

```ts
export interface ItemActionContext {
  actorId: string;
  actorLocation: string;
  gameDate: string;
  accessibleSiteIds: ReadonlySet<string>;
  accessibleVehicleIds: ReadonlySet<string>;
}
export type ItemActionResult =
  | { ok: true; state: ItemSystemState; log: string[] }
  | { ok: false; state: ItemSystemState; error: string };
export interface PendingItemAction {
  id: string;
  action: ItemAction;
  instanceId?: string;
  itemName: string;
  image: ItemImageRef;
  label: string;
  conflictKey: string;
}
export function applyItemActions(state: ItemSystemState, actions: readonly ItemAction[], context: ItemActionContext, catalog: ItemCatalog): ItemActionResult;
export function createPendingItemAction(action: ItemAction, model: { itemName: string; image: ItemImageRef; label: string }): PendingItemAction;
export function mergePendingItemCommands(queue: readonly PendingItemAction[], modelCommands: readonly ItemStateCommand[]): ItemStateCommand[];
```

- [ ] **Step 1: Write failing action tests**

Cover `equip`, `unequip`, `use`, `transfer`, `gift`, `discard`, `repair`, `split`, `merge`, and `mark_heirloom`. Assert a batch is atomic:

```js
const result = applyItemActions(state, [validTransfer, invalidGift], context);
assert.equal(result.ok, false);
assert.deepEqual(result.state, state);
```

Assert repair caps at `100`, use decrements charges before quantity, unique items cannot merge, and key history entries are appended for gift, theft, loss, recovery, repair, and heirloom designation.

- [ ] **Step 2: Write failing queue tests**

Assert the last queued equip action for the same position wins, unrelated actions remain, cancellation is ID-specific, and successful submission removes only the submitted snapshot:

```js
assert.deepEqual(enqueueItemAction([oldSword, queuedGift], newSword), [queuedGift, newSword]);
assert.deepEqual(removeSubmittedItemActions([oldSword, laterRepair], [oldSword]), [laterRepair]);
```

- [ ] **Step 3: Run both tests and verify failure**

```bash
node scripts/test-item-actions.mjs
node scripts/test-item-action-queue.mjs
```

Expected: FAIL because the modules are missing.

- [ ] **Step 4: Implement atomic action application**

Validate the complete batch against a cloned state, apply in sequence to the clone, validate final invariants, and return `{ ok: true, state, log }`. On any error return `{ ok: false, state: originalState, error }`.

- [ ] **Step 5: Implement queue conflict keys and prompt text**

Conflict keys are `equip:<position>`, `item:<instanceId>:use`, `item:<instanceId>:repair`, and `item:<instanceId>:move`. Prompt text states that the frontend applies the action only after a successful response and forbids duplicate model commands.

- [ ] **Step 6: Run tests and build**

```bash
npm run test:item-actions
npm run test:item-action-queue
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/items/actions.ts src/features/items/itemActionQueue.ts scripts/test-item-actions.mjs scripts/test-item-action-queue.mjs package.json
git commit -m "feat: add atomic item actions and queue"
```

---

### Task 6: Add the initial data-driven item catalog and preset factories

**Files:**
- Create: `src/data/itemDefinitions.ts`
- Create: `src/data/itemPresetState.ts`
- Create: `scripts/test-item-definitions.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: catalog/state contracts.
- Produces: `ITEM_DEFINITIONS`, `ITEM_CATALOG`, `createNedItemState()`, `createJonItemState()`, `createDaenerysItemState()`, and `createCustomRulerItemState()`.

- [ ] **Step 1: Write the failing definition coverage test**

Require these exact initial definition IDs before cutover:

```text
clothing.northern_wool_tunic
clothing.nights_watch_uniform
clothing.grey_wolf_cloak
clothing.black_winter_cloak
armor.stark_wolf_helm
armor.castle_chainmail
armor.nights_watch_leathers
artifact.ice
weapon.castle_bastard_sword
medicine.maester_staunching_herbs
medicine.milk_of_the_poppy
supply.nights_watch_spirits
keepsake.house_seal
jewelry.simple_silver_ring
```

Assert `artifact.ice` is unique, legendary, two-handed, non-stackable, has provenance text, and cannot appear more than once in a preset state.

- [ ] **Step 2: Run the test and verify failure**

Run: `node scripts/test-item-definitions.mjs`

Expected: FAIL because item definitions are missing.

- [ ] **Step 3: Author the initial definitions with structured effects**

Use existing typed game icon IDs. Give `artifact.ice` melee/duel effects and a two-handed position; give cloaks the torso `outerwear` position; give armor zone protection and burden; give medicine charges and treatment unlocks.

- [ ] **Step 4: Build deterministic preset states**

Use fixed instance IDs such as `ned.ice`, `ned.wool_tunic`, `jon.castle_sword`, and fixed placements. Do not parse old `GearItem` or `InventoryItem` objects and do not add a migration helper.

- [ ] **Step 5: Run tests and build**

```bash
npm run test:item-definitions
npm run test:item-catalog
npm run test:item-custody
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/itemDefinitions.ts src/data/itemPresetState.ts scripts/test-item-definitions.mjs package.json
git commit -m "feat: add initial item catalog and presets"
```

---

### Task 7: Introduce the new save schema and reject old saves

**Files:**
- Modify: `src/types/game.ts:42-190`
- Modify: `src/services/db.ts:1-150`
- Modify: `src/data/presets.ts:1-260`
- Modify: `src/components/CharacterCreator.tsx` around the custom lord factory
- Modify: `src/components/SettingsModal.tsx` save import and reset controls
- Create: `src/features/items/saveVersion.ts`
- Create: `scripts/test-item-save-version.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ItemSystemState` and preset factories.
- Produces: required `GameState.saveFormatVersion`, required `LordProfile.items`, `ITEM_SAVE_FORMAT_VERSION = 4`, `assertSupportedGameState()`, `assertSupportedSaveEnvelope()`, and save envelopes with `version: 4`.

- [ ] **Step 1: Write the failing save-version test**

```js
assert.equal(ITEM_SAVE_FORMAT_VERSION, 4);
assert.throws(() => assertSupportedSaveEnvelope({ version: 3, snapshots: [] }), /测试版存档格式已更新.*重置/);
assert.doesNotThrow(() => assertSupportedSaveEnvelope({ version: 4, snapshots: [] }));
assert.throws(() => assertSupportedGameState({ saveFormatVersion: 3 }), /测试版存档格式已更新.*重置/);
assert.doesNotThrow(() => assertSupportedGameState({ saveFormatVersion: 4, lord: { items: { schemaVersion: 1 } } }));
```

Also source-check that `db.ts` no longer imports `ensureItemCustody`, and that `SettingsModal.tsx` renders an explicit `重置测试存档` action for unsupported versions.

- [ ] **Step 2: Run the test and verify failure**

Run: `node scripts/test-item-save-version.mjs`

Expected: FAIL because `saveVersion.ts` is missing.

- [ ] **Step 3: Add `LordProfile.items` and initialize every new game**

Add `saveFormatVersion: 4` to `GameState`, `formatVersion: 4` to every `GameSnapshot`, and `items: ItemSystemState` as a required `LordProfile` field. Map `ned_stark` to `createNedItemState()`, `jon_snow` to `createJonItemState()`, `daenerys_targaryen` to `createDaenerysItemState()`, and the ruler designer to `createCustomRulerItemState()`. During Tasks 7-12 only, keep legacy fields compiling so the existing UI remains green; mark this as temporary implementation scaffolding and do not read it into the new system.

- [ ] **Step 4: Enforce version 4 on import and export**

Export `{ version: 4, exportedAt: new Date().toISOString(), snapshots, worldRuns, characterEvents }`. Import must call `assertSupportedSaveEnvelope()` and validate every snapshot before opening a Dexie transaction. `saveTurnSnapshot()` and `commitTurnAtomically()` reject unsupported game states; `getRecentSnapshots()` and `rollbackLastTurn()` call `assertSupportedGameState()` before returning a snapshot. Remove all item custody migration calls. Version errors leave the existing database untouched, clear nothing automatically, and present a reset-required message. Add a `重置测试存档` button to `SettingsModal` that asks for confirmation, calls the existing `clearSaveData()`, and reloads only after the clear succeeds.

- [ ] **Step 5: Run schema tests and build**

```bash
npm run test:item-save-version
npm run test:item-definitions
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/game.ts src/services/db.ts src/data/presets.ts src/components/CharacterCreator.tsx src/components/SettingsModal.tsx src/features/items/saveVersion.ts scripts/test-item-save-version.mjs package.json
git commit -m "feat: introduce versioned item state"
```

---

### Task 8: Integrate item commands, reducer state, API, and prompts

**Files:**
- Modify: `src/types/game.ts` `StateCommand` union
- Modify: `src/services/stateReducer.ts:1-435`
- Modify: `src/services/promptBuilder.ts:12-260`
- Modify: `src/services/api.ts:1-230`
- Create: `scripts/test-item-state-commands.mjs`
- Modify: `scripts/test-state-reducer.mjs`
- Modify: `scripts/test-character-prompt.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `applyItemActions()`, `ITEM_CATALOG`, and `LordProfile.items`.
- Produces: state commands `ITEM_CREATE`, `ITEM_EQUIP`, `ITEM_UNEQUIP`, `ITEM_USE`, `ITEM_TRANSFER`, `ITEM_GIFT`, `ITEM_DISCARD`, `ITEM_REPAIR`, `ITEM_DAMAGE`, `ITEM_SPLIT`, `ITEM_MERGE`, and `ITEM_MARK_HEIRLOOM`.

- [ ] **Step 1: Write failing command tests**

Assert `ITEM_CREATE` requires a known definition ID, `ITEM_EQUIP` requires an existing accessible instance, `ITEM_TRANSFER` cannot overfill carried capacity, and a mixed batch with one invalid item command leaves `lord.items` unchanged.

- [ ] **Step 2: Write failing prompt boundary tests**

Require the state slice to contain current equipped instance names, accessible item summaries, burden/heat directives, and definition/instance IDs. Assert it does not contain raw remote inventories or the legacy strings `EQUIP_GEAR`, `EQUIP_FROM_INVENTORY`, `ADD_INVENTORY_ITEM`, or `USE_POUCH_ITEM`.

- [ ] **Step 3: Run tests and verify failure**

```bash
node scripts/test-item-state-commands.mjs
npm run test:character-prompt
```

Expected: FAIL on missing commands and old prompt text.

- [ ] **Step 4: Delegate item commands from the reducer**

Translate each item state command into one `ItemAction`, apply the item batch atomically, and merge its log into `changesLog`. Keep body, time, trait, and character commands unchanged.

- [ ] **Step 5: Update online and offline AI contracts**

Teach only the new command JSON shapes. Offline narration must look up catalog definitions and accessible placements; it cannot construct ad hoc gear objects. Pending UI actions remain frontend-owned and are not duplicated by model commands.

- [ ] **Step 6: Run focused tests and build**

```bash
npm run test:item-state-commands
npm run test:state-reducer
npm run test:character-prompt
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/game.ts src/services/stateReducer.ts src/services/promptBuilder.ts src/services/api.ts scripts/test-item-state-commands.mjs scripts/test-state-reducer.mjs scripts/test-character-prompt.mjs package.json
git commit -m "feat: integrate item state commands"
```

---

### Task 9: Replace the equipment-only queue with the generic item queue

**Files:**
- Modify: `src/store/useGameStore.ts:1-420`
- Modify: `src/components/ActionDock.tsx:1-130`
- Modify: `src/components/CharacterSheet.tsx` existing queue call sites
- Modify: `src/components/Ck3CharacterWindow.tsx` existing player item queue call sites
- Modify: `scripts/test-equipment-queue-store.mjs`
- Modify: `scripts/test-character-store.mjs`
- Delete after references are removed: `src/services/equipmentQueue.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `PendingItemAction` and queue functions from Task 5.
- Produces: `pendingItemActions`, `queueItemAction(action)`, `cancelItemAction(id)`, and dialogue-success submission semantics.

- [ ] **Step 1: Rewrite the store test before implementation**

Test one equip, one transfer, and one use action queued together. A successful response applies all three and clears only the submitted actions. A rejected API call leaves both `gameState.lord.items` and `pendingItemActions` unchanged.

- [ ] **Step 2: Run tests and verify failure**

Run: `node scripts/test-equipment-queue-store.mjs`

Expected: FAIL because the store still exposes `pendingEquipmentActions`.

- [ ] **Step 3: Replace Zustand queue state and send flow**

Snapshot `pendingItemActions` before sending, format them into the prompt, merge their commands before model commands, commit the updated game state and character events atomically, then remove only the submitted snapshot. Do not clear the queue in the catch branch.

- [ ] **Step 4: Generalize the Action Dock and update existing callers**

Rename the section marker to `data-item-action-queue`, heading to `待执行物品动作`, and render action-specific natural labels: `穿上`, `卸下`, `使用`, `转移`, `赠送`, `丢弃`, and `修理`. Keep the explanation `下一次对话生成成功后生效`. In the still-temporary legacy card call sites, resolve the matching new instance ID from `lord.items`, construct an `ItemAction`, and call `queueItemAction()`; do not mutate or regenerate item state from a legacy card object.

- [ ] **Step 5: Remove the old queue module and run tests**

```bash
npm run test:item-action-queue
npm run test:equipment-queue-store
npm run test:character-store
npm run build
```

Expected: PASS and no import of `services/equipmentQueue.ts` remains.

- [ ] **Step 6: Commit**

```bash
git add src/store/useGameStore.ts src/components/ActionDock.tsx src/components/CharacterSheet.tsx src/components/Ck3CharacterWindow.tsx scripts/test-equipment-queue-store.mjs scripts/test-character-store.mjs package.json
git rm src/services/equipmentQueue.ts
git commit -m "feat: queue all item world actions"
```

---

### Task 10: Connect item effects to dice, wounds, and narrative context

**Files:**
- Modify: `src/services/diceEngine.ts:1-100`
- Modify: `src/store/useGameStore.ts` D20 call site
- Modify: `src/services/stateReducer.ts` `INJURE_ZONE` and item durability handling
- Modify: `src/services/promptBuilder.ts` D20 and narrative state slices
- Modify: `src/types/game.ts` `D20Check`
- Create: `scripts/test-item-dice-integration.mjs`
- Modify: `scripts/test-dice-policy.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `aggregateEquippedItemEffects()`, `getItemCheckModifier()`, and `mitigateWoundLevel()`.
- Produces: `D20Check.equipmentModifierBreakdown` and deterministic armor mitigation logs.

- [ ] **Step 1: Write failing dice integration tests**

Inject a fixed roll and assert a sword gives `+3` to a matching duel, gives `0` to diplomacy, heavy court armor gives `-1` to a court diplomacy action, and unrelated accessories do not contribute.

- [ ] **Step 2: Write failing wound tests**

Assert torso armor reduces a matching `critical` slashing wound to `heavy`, does not protect an uncovered head, and loses durability only when the armor actually mitigates damage.

- [ ] **Step 3: Run tests and verify failure**

```bash
node scripts/test-item-dice-integration.mjs
npm run test:state-reducer
```

Expected: FAIL because dice still reads `LordGearSlots` quality.

- [ ] **Step 4: Replace the legacy equipment bonus**

Change `performD20Check()` to receive `ItemSystemState`, `ItemCatalog`, and optional scene tags. Populate a breakdown with definition ID, name, value, and reason. Keep attribute and trait math unchanged.

- [ ] **Step 5: Apply deterministic protection and narrative directives**

Apply item protection before trait resistance. Log each reduction separately. In narrative mode, include action unlocks, burdens, heat, noise, court reactions, and current item facts without hidden percentages.

- [ ] **Step 6: Run focused tests and build**

```bash
npm run test:item-dice-integration
npm run test:item-effects
npm run test:dice-policy
npm run test:state-reducer
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/diceEngine.ts src/store/useGameStore.ts src/services/stateReducer.ts src/services/promptBuilder.ts src/types/game.ts scripts/test-item-dice-integration.mjs scripts/test-dice-policy.mjs package.json
git commit -m "feat: apply item effects to checks and injuries"
```

---

### Task 11: Build pure item view models and shared expandable cards

**Files:**
- Create: `src/features/items/viewModel.ts`
- Create: `src/components/items/ItemImage.tsx`
- Create: `src/components/items/ItemCard.tsx`
- Create: `src/components/items/ItemDetail.tsx`
- Create: `scripts/test-item-view-model.mjs`
- Modify: `src/components/GameIcon.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: item state, catalog, effects, and queued actions.
- Produces: `buildItemCardModels()`, `buildEquipmentGroupModels()`, `ItemCardModel`, `EquipmentGroupModel`, and shared expandable card components.

Use these exact public model shapes:

```ts
export type CustodyTab = 'carried' | 'current-site' | 'vehicle' | 'remote-site';
export interface ItemCardModel {
  key: string;
  instanceId: string;
  name: string;
  image: ItemImageRef;
  category: ItemCategory;
  quality: CraftQuality;
  rarity: ItemRarity;
  quantityLabel: string;
  durabilityLabel: string;
  bulkLabel: string;
  locationLabel: string;
  primaryEffects: string[];
  description: string;
  roleplayText: string;
  provenanceLines: string[];
  history: ItemHistoryEntry[];
  actions: Array<{ kind: ItemAction['kind']; label: string; disabledReason?: string }>;
}
export interface EquipmentGroupModel {
  group: EquipmentGroup;
  label: string;
  summary: string;
  items: ItemCardModel[];
  positions: Array<{ key: string; label: string; item?: ItemCardModel }>;
  reservedByTwoHandedItem: boolean;
}
export function buildItemCardModels(input: { state: ItemSystemState; catalog: ItemCatalog; currentLocation: string; pendingActions: readonly PendingItemAction[]; tab: CustodyTab }): ItemCardModel[];
export function buildEquipmentGroupModels(input: { state: ItemSystemState; catalog: ItemCatalog; pendingActions: readonly PendingItemAction[] }): EquipmentGroupModel[];
```

- [ ] **Step 1: Write failing view-model tests**

Assert the same instance appears in exactly one custody tab, remote sites are separated from current sites, group order is fixed, torso summary aggregates three layers, accessories summarize up to three items, and cards expose at most three primary effect labels.

- [ ] **Step 2: Run the test and verify failure**

Run: `node scripts/test-item-view-model.mjs`

Expected: FAIL because `viewModel.ts` is missing.

- [ ] **Step 3: Implement pure selectors and models**

Do not read Zustand inside the view-model module. Accept `{ state, catalog, currentLocation, pendingActions }` and return immutable models with stable keys, action availability, formatted durability, bulk, source, history, and D20/narrative effect descriptions.

- [ ] **Step 4: Implement shared images and card expansion**

`ItemImage` accepts a typed image reference `{ type: 'game'; icon } | { type: 'wiki'; path; fallbackIcon } | { type: 'library'; iconName }`. `ItemCard` toggles detail on card-header click and uses `aria-expanded`; it must not render a button with text or title `检视`.

- [ ] **Step 5: Run tests, no-Emoji check, and build**

```bash
npm run test:item-view-model
npm run check:no-emoji
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/items/viewModel.ts src/components/items src/components/GameIcon.tsx scripts/test-item-view-model.mjs package.json
git commit -m "feat: add expandable item cards"
```

---

### Task 12: Build the six-group equipment panel

**Files:**
- Create: `src/components/items/EquipmentPanel.tsx`
- Create: `scripts/check-item-equipment-ui.mjs`
- Modify: `src/components/CharacterSheet.tsx`
- Modify: `src/index.css`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildEquipmentGroupModels()`, queue store actions, and current body state.
- Produces: `EquipmentPanel` embedded in the health/equipment tab.

- [ ] **Step 1: Write the failing structural UI check**

Require `data-equipment-group` values in this order: `head`, `torso`, `mainhand`, `offhand`, `feet`, `accessories`. Reject `data-equipment-group="cloak"`, shoulder labels, and independent cloak cards. Require `data-hand-pair` around mainhand/offhand.

- [ ] **Step 2: Run the check and verify failure**

Run: `node scripts/check-item-equipment-ui.mjs`

Expected: FAIL because the new panel is missing.

- [ ] **Step 3: Implement the normal six-group view**

Render large item images, restrained numbers, quality frames, durability state, and aggregate labels. Keep torso and accessories collapsed by default. Expanding torso shows `服装`, `护甲`, and `外披`; expanding accessories shows exactly three positions.

- [ ] **Step 4: Add aggregate status and contextual actions**

Show protection, burden, heat, intimidation, and active restrictions above the groups. Empty groups offer `更换`; equipped cards offer applicable `卸下`, `修理`, or `更换`. All actions call `queueItemAction()` and do not mutate state immediately.

- [ ] **Step 5: Replace the old equipment section in `CharacterSheet`**

Keep health/body highlighting intact. Remove duplicated carried, site, vehicle, and remote-storage lists from this tab. Delete old `LinkedGearCard`, `SlotInspectionDetails`, and `CustodySection` only after no references remain.

- [ ] **Step 6: Run UI checks and build**

```bash
npm run check:item-equipment-ui
npm run check:body-highlights
npm run test:item-view-model
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/items/EquipmentPanel.tsx src/components/CharacterSheet.tsx src/index.css scripts/check-item-equipment-ui.mjs package.json
git commit -m "feat: add grouped equipment panel"
```

---

### Task 13: Build centralized item management and remove legacy item code

**Files:**
- Create: `src/components/items/ItemManagementPanel.tsx`
- Modify: `src/components/Ck3CharacterWindow.tsx` `PlayerInventoryTab`
- Modify: `src/types/game.ts`
- Modify: `src/services/stateReducer.ts`
- Modify: `src/services/promptBuilder.ts`
- Modify: `src/services/api.ts`
- Modify: `src/services/db.ts`
- Modify: `src/data/presets.ts`
- Modify: `src/components/CharacterCreator.tsx`
- Delete: `src/services/itemCustody.ts`
- Delete: `src/services/equipmentRules.ts`
- Modify: `scripts/check-current-equipment.mjs`
- Modify: `scripts/check-ck3-character-window.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: view models and generic queued actions.
- Produces: one item-management panel with `carried`, `current-site`, `vehicle`, and `remote-site` tabs and a final tree with no legacy item model.

- [ ] **Step 1: Rewrite static checks before implementation**

Require the four custody view markers, category filters, search, sorting, card expansion, and queue actions. Reject source occurrences of `InventoryItem`, `GearItem`, `LordGearSlots`, `carriedItems`, `gear.inventory`, `gear.pouch`, `PendingEquipmentAction`, `EQUIP_GEAR`, `EQUIP_FROM_INVENTORY`, `ADD_INVENTORY_ITEM`, `USE_INVENTORY_ITEM`, `ADD_POUCH_ITEM`, and an action/button labeled `检视`.

- [ ] **Step 2: Run checks and verify failure**

```bash
npm run check:current-equipment
npm run check:ck3-character-window
```

Expected: FAIL because legacy types and UI remain.

- [ ] **Step 3: Implement the four item-management views**

Use one panel and filtered view models. Current-site includes accessible sites only; vehicle includes accessible vehicles only; remote-site is strictly read-only and exposes no wear, transfer, gift, repair, split, merge, or use action. Search matches name, category, material, maker, and provenance. Sort options are `当前位置`, `类别`, `品质`, `耐久`, and `名称`.

- [ ] **Step 4: Wire real actions without an inspect action**

Card-header click expands detail. Available buttons are limited to `穿戴`, `卸下`, `使用`, `转移`, `赠送`, `丢弃`, `修理`, `设为传家宝`, `拆分`, and `合并`. Local category/search/sort preferences remain immediate UI state and are not item actions. Disabled actions show their rule reason. No `检视` action or button exists.

- [ ] **Step 5: Remove the legacy model completely**

Delete old interfaces, compatibility aliases, old commands, old reducer branches, old migration calls, old prompt examples, and old service files. `LordProfile.items` becomes the only player item state. Rewrite all preset and creator data to use Task 6 factories only.

- [ ] **Step 6: Run all item tests and build**

```bash
npm run test:item-catalog
npm run test:item-custody
npm run test:item-equipment
npm run test:item-effects
npm run test:item-actions
npm run test:item-action-queue
npm run test:item-definitions
npm run test:item-save-version
npm run test:item-state-commands
npm run test:item-dice-integration
npm run test:item-view-model
npm run check:item-equipment-ui
npm run check:current-equipment
npm run check:ck3-character-window
npm run build
```

Expected: PASS and `rg "InventoryItem|GearItem|PendingEquipmentAction|EQUIP_FROM_INVENTORY|USE_POUCH_ITEM" src` returns no matches.

- [ ] **Step 7: Commit**

```bash
git add src/components/items/ItemManagementPanel.tsx src/components/Ck3CharacterWindow.tsx src/types/game.ts src/services src/data/presets.ts src/components/CharacterCreator.tsx scripts package.json
git commit -m "refactor: replace legacy inventory with item instances"
```

---

### Task 14: Expand the catalog and localize Wiki images

**Files:**
- Modify: `src/data/itemDefinitions.ts`
- Create: `public/assets/item-images/source-manifest.json`
- Create: `scripts/fetch-item-images.mjs`
- Create: `scripts/check-item-images.mjs`
- Modify: `src/components/items/ItemImage.tsx`
- Modify: `package.json`
- Add generated image files under: `public/assets/item-images/`

**Interfaces:**
- Consumes: catalog and item image reference types.
- Produces: at least 48 definitions across all ten categories and local Wiki imagery for selected unique artifacts.

- [ ] **Step 1: Write the failing content and asset check**

Require at least four definitions in each of `weapon`, `armor`, `clothing`, `jewelry`, `tool`, `document`, `medicine`, `poison`, `supply`, and `keepsake`. Require unique definitions for `artifact.ice`, `artifact.longclaw`, `artifact.dawn`, and `artifact.blackfyre`.

For every Wiki image, require the keys `itemId`, `localPath`, `sourcePage`, `sourceImage`, `retrievedAt`, `attribution`, `licenseNote`, and `sha256`. Seed these exact source pages:

```text
artifact.ice       https://awoiaf.westeros.org/index.php/Ice
artifact.longclaw  https://awoiaf.westeros.org/index.php/Longclaw
artifact.dawn      https://awoiaf.westeros.org/index.php/Dawn
artifact.blackfyre https://awoiaf.westeros.org/index.php/Blackfyre
```

The fetch script's `--discover` mode reads each page's canonical `og:image`, writes that complete URL back to `sourceImage`, downloads the source bytes, normalizes them to WebP, computes SHA-256 over the final local bytes, and writes the 64-character lowercase digest back to `sha256`. `localPath` is respectively `/assets/item-images/artifact-ice.webp`, `/assets/item-images/artifact-longclaw.webp`, `/assets/item-images/artifact-dawn.webp`, and `/assets/item-images/artifact-blackfyre.webp`. Reject `http://` or `https://` in runtime `image.path` values.

- [ ] **Step 2: Run checks and verify failure**

Run: `node scripts/check-item-images.mjs`

Expected: FAIL because the manifest and files are missing.

- [ ] **Step 3: Expand common and regional definitions**

Add exactly these content families: castle-forged swords, daggers, axes, spears, bows, shields; cloth, leather, mail, plate, helms, travel clothes, court clothes, northern outerwear; rings, necklaces, seals, relics; rope, torch, lock tools, healer tools; letters, ledgers, maps, books; bandages, staunching herbs, milk of the poppy, antidote; nightshade, tears of Lys, strangler, basilisk venom; rations, waterskins, lamp oil, arrows; family keepsakes and religious tokens.

Give regional variants to the North, Riverlands, Vale, Iron Islands, Dorne, Reach, and Crownlands through tags, descriptions, compatible environments, and limited structured effects rather than random affixes.

- [ ] **Step 4: Add deterministic image fetching**

Install the exact dev dependency with `npm install --save-dev sharp@0.34.3`. `fetch-item-images.mjs --discover` reads only the four explicit `sourcePage` URLs, extracts canonical `og:image`, downloads those HTTPS URLs with a descriptive user agent, uses Sharp to fit the image inside 512 by 512 pixels and encode WebP at quality 88, computes the final SHA-256, atomically replaces the local target, and updates `sourceImage` and `sha256`. Plain `fetch-item-images.mjs` uses the committed `sourceImage` and fails if the normalized output hash differs from the committed `sha256`. It must never inspect local game or mod directories.

- [ ] **Step 5: Download and verify selected unique images**

Use public Wiki source pages for Ice, Longclaw, Dawn, and Blackfyre. Keep existing game icons as `fallbackIcon`. Run:

```bash
node scripts/fetch-item-images.mjs --discover
node scripts/fetch-item-images.mjs
npm run check:item-images
npm run check:no-emoji
npm run build
```

Expected: PASS with no external runtime image URL.

- [ ] **Step 6: Commit**

```bash
git add src/data/itemDefinitions.ts src/components/items/ItemImage.tsx public/assets/item-images scripts/fetch-item-images.mjs scripts/check-item-images.mjs package.json
git commit -m "feat: expand item catalog and add wiki art"
```

---

### Task 15: Full regression, visual QA, and documentation cleanup

**Files:**
- Modify: `package.json`
- Modify as failures require: only files already touched by Tasks 1-14
- Update: `docs/superpowers/specs/2026-08-17-equipment-item-system-design.md` only if implementation names differ after approved technical corrections

**Interfaces:**
- Consumes: every previous task.
- Produces: one verified, buildable branch with no legacy item path and screenshots covering desktop and narrow character dossiers.

- [ ] **Step 1: Put every new command into `npm run verify`**

The item portion must run in this order: catalog, custody, equipment, effects, actions, queue, definitions, save version, state commands, dice integration, view model, equipment UI, item images, current-equipment static check, then the existing suite and production build.

- [ ] **Step 2: Run the complete automated suite**

Run: `npm run verify`

Expected: exit code `0`; no failed tests; TypeScript and Vite production build succeed. The existing large-chunk warning is non-blocking unless a new item-image bundle is imported into JavaScript.

- [ ] **Step 3: Run forbidden-pattern scans**

```bash
rg -n "InventoryItem|GearItem|LordGearSlots|PendingEquipmentAction|EQUIP_GEAR|EQUIP_FROM_INVENTORY|USE_POUCH_ITEM|data-equipment-group=\"cloak\"|>检视<" src scripts
rg -n "https?://" src/data/itemDefinitions.ts public/assets/item-images/source-manifest.json
```

Expected: the first command returns no matches. The second returns URLs only inside `source-manifest.json`.

- [ ] **Step 4: Perform desktop visual QA**

Open the player dossier at desktop width. Capture and inspect:

1. Health/equipment default: exactly six groups, no shoulder or independent cloak, main/offhand symmetric.
2. Torso expanded: garment, armor, and outerwear visible inside one group.
3. Accessories expanded: exactly three positions.
4. Aggregate effects: protection, burden, heat, intimidation, and restrictions readable without oversized numbers.

- [ ] **Step 5: Perform narrow-width visual QA**

At the mobile/narrow dossier breakpoint, verify no horizontal overflow, item icons remain legible, expanded detail stays within the panel, and queued action labels remain cancellable.

- [ ] **Step 6: Perform interaction QA**

Queue equip, transfer, use, gift, and repair actions. Confirm state does not change before dialogue, successful dialogue applies all submitted actions, and simulated API failure leaves queue and item state unchanged. Confirm clicking a card expands it and no inspect button exists.

- [ ] **Step 7: Commit final integration fixes**

```bash
git add package.json src scripts docs/superpowers/specs/2026-08-17-equipment-item-system-design.md
git commit -m "test: verify item system integration"
```

Do not create an empty commit if no final fixes were necessary.
