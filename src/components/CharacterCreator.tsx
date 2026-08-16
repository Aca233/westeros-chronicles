import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Crown,
  Landmark,
  MapPin,
  Minus,
  Palette,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Swords,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { PRESET_SCENARIOS, PresetScenario } from '../data/presets';
import { HOUSES } from '../data/houses';
import { LordAttributes, LordProfile, createDefaultBody } from '../types/game';
import { GameIcon, getHouseIconId } from './GameIcon';
import { CoatOfArms } from './CoatOfArms';
import { stripEmoji } from '../services/textSanitizer';
import { CK3_SKILLS, getCk3SkillRank } from '../data/ck3Skills';
import {
  CHARACTER_TRAITS,
  DESIGN_POINT_LIMIT,
  MAX_PERSONALITY_TRAITS,
  TRAIT_CATEGORY_LABELS,
  TraitCategory,
  calculateDesignPointUsage,
  calculateFinalAttributes,
  orderCharacterTraitsForDisplay,
  formatTraitDescription,
  formatTraitModifiers,
  formatTraitRuleEffects,
  getHouseIdentity,
} from '../data/characterTraits';
import {
  CoatOfArmsDesign,
  DEFAULT_COAT_OF_ARMS,
  HERALDRY_COLORS,
  HERALDRY_EMBLEMS,
  HERALDRY_PATTERNS,
  HERALDRY_SHIELDS,
} from '../data/heraldry';

const TRAIT_CATEGORY_ORDER: readonly TraitCategory[] = ['personality', 'education', 'lifestyle', 'congenital', 'health', 'fame'];

const getConflictingTraitIds = (trait: (typeof CHARACTER_TRAITS)[number]): Set<string> => {
  const conflicts = new Set(trait.incompatibleTraitIds ?? []);
  for (const entry of CHARACTER_TRAITS) {
    if (trait.exclusiveGroup && entry.exclusiveGroup === trait.exclusiveGroup) conflicts.add(entry.id);
    if (entry.incompatibleTraitIds?.includes(trait.id)) conflicts.add(entry.id);
  }
  conflicts.delete(trait.id);
  return conflicts;
};
const CUSTOM_HOUSE_BASE_ATTRIBUTES: LordAttributes = {
  diplomacy: 10,
  martial: 10,
  stewardship: 10,
  intrigue: 10,
  learning: 10,
  prowess: 10,
};

export const CharacterCreator: React.FC = () => {
  const { isCreatorOpen, closeCreator, startNewGame } = useGameStore();
  const [tab, setTab] = useState<'preset' | 'custom'>('preset');
  const [houseMode, setHouseMode] = useState<'preset' | 'custom'>('preset');
  const [selectedHouseId, setSelectedHouseId] = useState(HOUSES[0].id);
  const [customName, setCustomName] = useState('维斯特洛新星');
  const [customTitle, setCustomTitle] = useState('年轻的封建领主');
  const [customAge, setCustomAge] = useState(24);
  const [customGender, setCustomGender] = useState('男');
  const [customAttributes, setCustomAttributes] = useState<LordAttributes>({ ...HOUSES[0].defaultAttributes });
  const [selectedTraitIds, setSelectedTraitIds] = useState<string[]>(['ambitious']);
  const [activeTraitCategory, setActiveTraitCategory] = useState<TraitCategory>('personality');
  const [traitSearch, setTraitSearch] = useState('');

  const [customHouseName, setCustomHouseName] = useState('鸦冠家族');
  const [customDynastyName, setCustomDynastyName] = useState('鸦冠宗族');
  const [customHouseWords, setCustomHouseWords] = useState('以铁与誓言');
  const [customSeat, setCustomSeat] = useState('暮鸦堡');
  const [customCulture, setCustomCulture] = useState('安达尔人');
  const [customFaith, setCustomFaith] = useState('七神信仰');
  const [customCoatOfArms, setCustomCoatOfArms] = useState<CoatOfArmsDesign>({ ...DEFAULT_COAT_OF_ARMS });

  const currentHouse = HOUSES.find((house) => house.id === selectedHouseId) || HOUSES[0];
  const presetIdentity = getHouseIdentity(currentHouse.id);
  const isCustomHouse = houseMode === 'custom';
  const effectiveHouseName = isCustomHouse ? stripEmoji(customHouseName).trim() : currentHouse.name;
  const effectiveDynastyName = isCustomHouse ? stripEmoji(customDynastyName).trim() : currentHouse.name;
  const effectiveHouseWords = isCustomHouse ? stripEmoji(customHouseWords).trim() : currentHouse.words;
  const effectiveSeat = isCustomHouse ? stripEmoji(customSeat).trim() : currentHouse.seat;
  const effectiveCulture = isCustomHouse ? stripEmoji(customCulture).trim() : presetIdentity.culture;
  const effectiveFaith = isCustomHouse ? stripEmoji(customFaith).trim() : presetIdentity.faith;
  const houseBaseAttributes = isCustomHouse ? CUSTOM_HOUSE_BASE_ATTRIBUTES : currentHouse.defaultAttributes;

  const selectedTraits = orderCharacterTraitsForDisplay(CHARACTER_TRAITS.filter((trait) => selectedTraitIds.includes(trait.id)));
  const visibleTraits = useMemo(() => {
    const query = traitSearch.trim().toLowerCase();
    return CHARACTER_TRAITS.filter((trait) => {
      if (!query) return trait.category === activeTraitCategory;
      return `${trait.name} ${trait.description} ${formatTraitModifiers(trait.modifiers)} ${formatTraitRuleEffects(trait.rules).join(' ')}`.toLowerCase().includes(query);
    });
  }, [activeTraitCategory, traitSearch]);
  const finalAttributes = useMemo(
    () => calculateFinalAttributes(customAttributes, selectedTraitIds),
    [customAttributes, selectedTraitIds]
  );
  const usedPoints = calculateDesignPointUsage(houseBaseAttributes, customAttributes, selectedTraitIds, customAge);
  const remainingPoints = DESIGN_POINT_LIMIT - usedPoints;
  const isOverBudget = usedPoints > DESIGN_POINT_LIMIT;
  const hasValidHouse = !isCustomHouse || Boolean(
    effectiveHouseName && effectiveDynastyName && effectiveHouseWords && effectiveSeat && effectiveCulture && effectiveFaith
  );
  const canComplete = !isOverBudget && hasValidHouse && customName.trim().length > 0 && customTitle.trim().length > 0;

  if (!isCreatorOpen) return null;

  const handleStatChange = (key: keyof LordAttributes, delta: number) => {
    const current = customAttributes[key];
    if (delta < 0 && current <= 0) return;
    if (delta > 0 && current >= 30) return;
    setCustomAttributes((attributes) => ({ ...attributes, [key]: attributes[key] + delta }));
  };

  const handleHouseSelect = (houseId: string) => {
    const house = HOUSES.find((entry) => entry.id === houseId) || HOUSES[0];
    setHouseMode('preset');
    setSelectedHouseId(house.id);
    setCustomAttributes({ ...house.defaultAttributes });
  };

  const handleCreateHouse = () => {
    if (!isCustomHouse) setCustomAttributes({ ...CUSTOM_HOUSE_BASE_ATTRIBUTES });
    setHouseMode('custom');
  };

  const updateCoatOfArms = <K extends keyof CoatOfArmsDesign>(key: K, value: CoatOfArmsDesign[K]) => {
    setCustomCoatOfArms((current) => ({ ...current, [key]: value }));
  };

  const resetCustomDesign = () => {
    setHouseMode('preset');
    setSelectedHouseId(HOUSES[0].id);
    setCustomName('维斯特洛新星');
    setCustomTitle('年轻的封建领主');
    setCustomAge(24);
    setCustomGender('男');
    setCustomAttributes({ ...HOUSES[0].defaultAttributes });
    setSelectedTraitIds(['ambitious']);
    setActiveTraitCategory('personality');
    setTraitSearch('');
    setCustomHouseName('鸦冠家族');
    setCustomDynastyName('鸦冠宗族');
    setCustomHouseWords('以铁与誓言');
    setCustomSeat('暮鸦堡');
    setCustomCulture('安达尔人');
    setCustomFaith('七神信仰');
    setCustomCoatOfArms({ ...DEFAULT_COAT_OF_ARMS });
  };

  const handleTraitToggle = (traitId: string) => {
    const trait = CHARACTER_TRAITS.find((entry) => entry.id === traitId);
    if (!trait) return;
    setSelectedTraitIds((current) => {
      if (current.includes(trait.id)) return current.filter((id) => id !== trait.id);
      const conflictingIds = getConflictingTraitIds(trait);
      const withoutConflicts = current.filter((id) => !conflictingIds.has(id));
      const personalityCount = CHARACTER_TRAITS.filter(
        (entry) => entry.category === 'personality' && withoutConflicts.includes(entry.id)
      ).length;
      if (trait.category === 'personality' && personalityCount >= MAX_PERSONALITY_TRAITS) return current;
      return [...withoutConflicts, trait.id];
    });
  };

  const isTraitDisabled = (traitId: string) => {
    const trait = CHARACTER_TRAITS.find((entry) => entry.id === traitId);
    if (!trait || trait.category !== 'personality' || selectedTraitIds.includes(trait.id)) return false;
    const conflictingIds = getConflictingTraitIds(trait);
    const willReplaceSelected = selectedTraitIds.some((id) => conflictingIds.has(id));
    const personalityCount = selectedTraits.filter((entry) => entry.category === 'personality').length;
    return personalityCount >= MAX_PERSONALITY_TRAITS && !willReplaceSelected;
  };

  const handleStartPreset = (preset: PresetScenario) => startNewGame(preset.initialLord, preset.initialOpening);

  const handleStartCustom = () => {
    if (!canComplete) return;
    const chosenTraitNames = selectedTraits.map((trait) => trait.name);
    const customLord: LordProfile = {
      name: stripEmoji(customName) || '维斯特洛新星',
      house: effectiveHouseName,
      dynastyName: effectiveDynastyName,
      houseWords: effectiveHouseWords,
      houseSigil: isCustomHouse ? 'custom-coat-of-arms' : currentHouse.sigil,
      coatOfArms: isCustomHouse ? customCoatOfArms : undefined,
      title: stripEmoji(customTitle) || '年轻的封建领主',
      age: customAge,
      gender: customGender,
      culture: effectiveCulture,
      faith: effectiveFaith,
      location: `${effectiveSeat} · 大厅`,
      body: createDefaultBody(),
      overallStatus: '强健',
      goldDragons: 300,
      silverStags: 100,
      prestige: 60,
      dread: 5,
      attributes: finalAttributes,
      baseAttributes: { ...customAttributes },
      traits: [...chosenTraitNames, `${effectiveDynastyName}血脉`],
      traitIds: [...selectedTraitIds],
      gear: {
        torso: {
          id: 'c_custom_court_attire', name: `${effectiveHouseName}纹章礼服`, slot: 'torso', slotName: '家族纹章礼服',
          quality: '精良', condition: '完好坚固', bonusText: '正式仪态', description: '以家族颜色与纹章装饰的领主日常礼服。', icon: 'gear-cloak',
        },
        mainhand: {
          id: 'c_custom_weapon', name: `${effectiveHouseName}传承精钢剑`, slot: 'mainhand', slotName: '腰间佩剑',
          quality: '精良', condition: '完好坚固', bonusText: '锋利平衡', description: '家族大师锻造的锋利长剑，平日悬挂在腰间。', icon: 'gear-sword',
        },
      },
      carriedItems: [
        { id: 'p_c1', name: '金创止血草药', category: '药草', quantity: 2, size: 'tiny', description: '随身止血急救药包。' },
      ],
      storageSites: [
        {
          id: 'custom_castle_armory', name: `${effectiveSeat}军械库`, type: 'armory', location: effectiveSeat,
          description: '由家族军械官看守的城堡武备库。',
          items: [{
            id: 'c_custom_armor', name: `${effectiveHouseName}精锻锁子重甲`, category: '防具', quantity: 1, size: 'large',
            description: '镌刻家族纹章的坚固战甲，平日收存在城堡军械库。', icon: 'gear-armor', slot: 'torso',
            gearData: { id: 'c_custom_armor', name: `${effectiveHouseName}精锻锁子重甲`, slot: 'torso', slotName: '躯干战甲', quality: '大师精铸', condition: '完好坚固', bonusText: '坚实防护', description: '镌刻有家族纹章的坚固防具。', icon: 'gear-armor' },
          }],
        },
        {
          id: 'custom_castle_stable', name: `${effectiveSeat}马厩`, type: 'stable', location: effectiveSeat,
          description: '城堡用于饲养坐骑与驮畜的马厩。', items: [],
        },
      ],
      transports: [],
    };
    const customOpening = {
      think: `自创领主开局: ${customLord.name} 刚刚在 ${effectiveSeat} 继任领主之位。维斯特洛七国风云变幻，国王劳勃的王权摇摇欲坠。`,
      narrate: `微风吹拂着【${effectiveSeat}】高耸的黑色城垛，绣有${effectiveHouseName}纹章的巨大旗帜在风中猎猎作响。\n\n你身着【${customLord.gear.torso.name}】，腰悬【${customLord.gear.mainhand.name}】，独自站在领主大厅的古老石椅前。高耸的穹顶下，壁炉中的柴火噼啪作响。家族箴言“${effectiveHouseWords}”深刻在壁炉石梁上，历经风雨仍然清晰。\n\n沉重的橡木大门被侍卫推开，城堡总管捧着密封羊皮卷走入内厅，躬身道：“大人，七国各地的使者已在厅外等候。君临的权斗愈发激烈，各方势力都在注视${effectiveDynastyName}的一举一动，请您定夺接下来的方略。”\n\n大厅内归于肃静，骑士与封臣的目光一同落在你的身上。`,
      branches: [
        '向封臣发表演说，确立新任领主的权威',
        '令学士分析各大家族的联姻与密谋动向',
        '巡视城堡粮仓与兵营，整顿领地防务',
      ],
    };
    startNewGame(customLord, customOpening);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-2 md:p-4 select-none">
      <div className="panel-iron relative w-full max-w-[1380px] h-[96vh] flex flex-col overflow-hidden scene-enter">
        <div className="ck3-ornament-line" />
        <header className="shrink-0 border-b border-hairline bg-gradient-to-r from-ink-2 via-ink-3 to-ink-2 px-4 md:px-6 pt-3 pb-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow hidden sm:block">Registrum Domini · 御前册封议事</p>
              <div className="flex items-center gap-2.5 mt-1 text-gold-bright font-serif font-bold text-base md:text-xl">
                <Crown className="w-5 h-5 text-gold" />
                <span>{tab === 'custom' ? '统治者设计器' : '开启维斯特洛新传奇'}</span>
              </div>
            </div>
            <button onClick={closeCreator} aria-label="关闭人物创建器" className="btn-ghost"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-1 mt-3 overflow-x-auto">
            <button onClick={() => setTab('preset')} className={`flex shrink-0 items-center gap-1.5 px-4 py-2 text-xs font-serif font-bold tracking-wider border-b transition-colors ${tab === 'preset' ? 'border-gold text-gold-bright' : 'border-transparent text-parchment-faint hover:text-parchment-dim'}`}><Swords className="w-3.5 h-3.5" />经典原著剧本</button>
            <button onClick={() => setTab('custom')} className={`flex shrink-0 items-center gap-1.5 px-4 py-2 text-xs font-serif font-bold tracking-wider border-b transition-colors ${tab === 'custom' ? 'border-gold text-gold-bright' : 'border-transparent text-parchment-faint hover:text-parchment-dim'}`}><UserPlus className="w-3.5 h-3.5" />自定义统治者</button>
          </div>
        </header>

        {tab === 'preset' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-ink">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PRESET_SCENARIOS.map((preset) => (
                <article key={preset.id} className="bg-ink-2 border border-hairline hover:border-gold-deep p-5 flex flex-col justify-between transition-colors group">
                  <div>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-14 h-14 shrink-0 border border-hairline-bright bg-ink p-1.5"><GameIcon icon={getHouseIconId(preset.avatarIcon)} className="w-full h-full" /></div>
                      <div className="min-w-0"><h3 className="text-gold font-serif font-bold text-base leading-tight group-hover:text-gold-bright transition-colors">{preset.title}</h3><p className="text-[10px] text-parchment-faint mt-1">{preset.subtitle}</p></div>
                    </div>
                    <div className="hairline mb-3" />
                    <p className="text-xs text-parchment font-bold">{preset.characterName}</p>
                    <p className="text-[10px] text-parchment-faint mt-1">{preset.houseName}</p>
                    <p className="text-[11px] text-parchment-dim leading-relaxed mt-3">{preset.backgroundStory}</p>
                    <p className="text-[10px] italic text-gold-deep mt-3">{preset.tagline}</p>
                  </div>
                  <button type="button" onClick={() => handleStartPreset(preset)} className="btn-ghost w-full justify-center mt-5 font-serif font-bold tracking-wider">选择此剧本</button>
                </article>
              ))}
            </div>
          </div>
        )}

        {tab === 'custom' && (
          <div className="flex-1 min-h-0 flex flex-col" data-creator-layout="ck3">
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-2 border-b border-hairline bg-ink-2">
              <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider">
                <span className="text-parchment-faint">已用设计点数 <strong className={`font-display text-base ${isOverBudget ? 'text-rubric-bright' : 'text-gold-bright'}`}>{usedPoints}</strong></span>
                <span className="text-parchment-faint">上限 <strong className="font-display text-parchment-dim">{DESIGN_POINT_LIMIT}</strong></span>
                <span className="text-parchment-faint">剩余 <strong className={`font-display ${remainingPoints < 0 ? 'text-rubric-bright' : 'text-gold'}`}>{remainingPoints}</strong></span>
              </div>
              <button type="button" onClick={resetCustomDesign} className="btn-ghost text-[10px]"><RotateCcw className="w-3 h-3" />重置设计</button>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)_330px] overflow-y-auto lg:overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-hairline">
              <aside className="bg-gradient-to-b from-ink-2 to-ink p-4 lg:overflow-y-auto">
                <div className="ck3-heraldry-frame min-h-[188px] bg-ink bg-[radial-gradient(circle_at_center,rgba(201,164,92,0.14),transparent_65%)] flex items-center justify-center relative overflow-hidden">
                  {isCustomHouse ? <CoatOfArms design={customCoatOfArms} className="h-36" /> : <GameIcon icon={getHouseIconId(currentHouse.sigil)} className="w-36 h-36 drop-shadow-[0_5px_6px_rgba(0,0,0,0.7)]" />}
                  <span className="absolute inset-x-0 bottom-0 bg-ink/85 py-1.5 text-center text-[10px] font-display text-gold-deep tracking-[0.3em]">{effectiveDynastyName || '未命名宗族'}</span>
                </div>
                <div className="text-center mt-4"><h2 className="font-serif text-xl font-bold text-gold-bright">{customName || '未命名角色'}</h2><p className="text-xs text-parchment-dim mt-1">{customTitle || '无头衔'}</p><p className="text-[10px] italic text-parchment-faint mt-2">“{effectiveHouseWords || '尚无箴言'}”</p></div>
                <div className="mt-5 border-y border-hairline py-3 space-y-2 text-[10px]">
                  <IdentityLine icon={<Users className="w-3.5 h-3.5" />} label="家族" value={effectiveHouseName || '未命名'} />
                  <IdentityLine icon={<Crown className="w-3.5 h-3.5" />} label="宗族" value={effectiveDynastyName || '未命名'} />
                  <IdentityLine icon={<BookOpen className="w-3.5 h-3.5" />} label="文化" value={effectiveCulture || '未指定'} />
                  <IdentityLine icon={<Landmark className="w-3.5 h-3.5" />} label="信仰" value={effectiveFaith || '未指定'} />
                  <IdentityLine icon={<MapPin className="w-3.5 h-3.5" />} label="领地" value={effectiveSeat || '未指定'} />
                </div>
                <div className="mt-5"><SectionTitle>已选特质</SectionTitle><div className="mt-3 grid grid-cols-4 gap-2">
                  {selectedTraits.length ? selectedTraits.map((trait) => (
                    <button key={trait.id} type="button" onClick={() => handleTraitToggle(trait.id)} title={`移除 ${trait.name}`} className="group relative aspect-square border border-hairline bg-ink/60 p-1 hover:border-rubric transition-colors"><GameIcon icon={trait.icon} className="w-full h-full" /><span className="absolute inset-x-0 bottom-0 bg-ink/90 text-[8px] text-parchment-dim truncate px-0.5">{trait.name}</span><X className="absolute -top-1 -right-1 hidden group-hover:block w-3 h-3 bg-ink text-rubric-bright" /></button>
                  )) : <p className="col-span-4 text-[10px] text-parchment-faint">尚未选择特质</p>}
                </div></div>
              </aside>

              <main className="bg-ink-2 p-4 md:p-5 lg:overflow-y-auto min-w-0">
                <SectionTitle>身份与年龄</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <Field label="姓名"><input value={customName} onChange={(event) => setCustomName(stripEmoji(event.target.value))} className="creator-input" maxLength={40} /></Field>
                  <Field label="头衔"><input value={customTitle} onChange={(event) => setCustomTitle(stripEmoji(event.target.value))} className="creator-input" maxLength={48} /></Field>
                  <Field label="性别"><div className="grid grid-cols-2 border border-hairline">{['男', '女'].map((gender) => <button key={gender} type="button" onClick={() => setCustomGender(gender)} className={`py-2 text-xs font-serif transition-colors ${customGender === gender ? 'bg-gold-deep/25 text-gold-bright' : 'bg-ink/40 text-parchment-faint hover:text-parchment-dim'}`}>{gender}</button>)}</div></Field>
                  <Field label="年龄"><div className="flex border border-hairline bg-ink/40"><button type="button" onClick={() => setCustomAge((age) => Math.max(16, age - 1))} className="creator-step-button"><Minus className="w-3.5 h-3.5" /></button><span className="flex-1 text-center py-2 text-sm font-mono text-parchment">{customAge}</span><button type="button" onClick={() => setCustomAge((age) => Math.min(100, age + 1))} className="creator-step-button"><Plus className="w-3.5 h-3.5" /></button></div></Field>
                </div>

                <div className="mt-5"><SectionTitle>选择或创建家族</SectionTitle><div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
                  {HOUSES.map((house) => <button key={house.id} type="button" onClick={() => handleHouseSelect(house.id)} title={`${house.name}：${house.description}`} className={`min-w-0 p-2 border flex items-center gap-2 text-left transition-colors ${!isCustomHouse && selectedHouseId === house.id ? 'border-gold bg-gold-deep/20 text-gold-bright' : 'border-hairline bg-ink/40 text-parchment-dim hover:border-hairline-bright'}`}><GameIcon icon={getHouseIconId(house.sigil)} className="w-9 h-9 shrink-0" /><span className="min-w-0"><span className="block text-[11px] font-bold truncate">{house.name.replace('家族', '')}</span><span className="block text-[9px] text-parchment-faint truncate">{house.region}</span></span></button>)}
                  <button type="button" onClick={handleCreateHouse} className={`min-w-0 p-2 border flex items-center gap-2 text-left transition-colors ${isCustomHouse ? 'border-gold bg-gold-deep/20 text-gold-bright' : 'border-gold-deep/50 bg-ink-3 text-gold hover:border-gold'}`}><Palette className="w-8 h-8 shrink-0" /><span><span className="block text-[11px] font-bold">创建新家族</span><span className="block text-[9px] text-parchment-faint">自定义纹章</span></span></button>
                </div></div>

                {isCustomHouse && (
                  <section className="creator-heraldry-panel mt-4 border border-gold-deep/40 bg-ink/50 p-3" aria-label="纹章编辑">
                    <div className="flex items-center gap-2 text-gold text-xs font-serif font-bold"><Palette className="w-4 h-4" />纹章编辑与家族资料</div>
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_190px] gap-4 mt-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="家族名称"><input value={customHouseName} onChange={(event) => setCustomHouseName(stripEmoji(event.target.value))} className="creator-input" maxLength={32} /></Field>
                        <Field label="宗族名称"><input value={customDynastyName} onChange={(event) => setCustomDynastyName(stripEmoji(event.target.value))} className="creator-input" maxLength={32} /></Field>
                        <Field label="家族箴言"><input value={customHouseWords} onChange={(event) => setCustomHouseWords(stripEmoji(event.target.value))} className="creator-input" maxLength={48} /></Field>
                        <Field label="根据地"><input value={customSeat} onChange={(event) => setCustomSeat(stripEmoji(event.target.value))} className="creator-input" maxLength={32} /></Field>
                        <Field label="文化"><input value={customCulture} onChange={(event) => setCustomCulture(stripEmoji(event.target.value))} className="creator-input" maxLength={24} /></Field>
                        <Field label="信仰"><input value={customFaith} onChange={(event) => setCustomFaith(stripEmoji(event.target.value))} className="creator-input" maxLength={24} /></Field>
                        <Field label="盾形"><select value={customCoatOfArms.shield} onChange={(event) => updateCoatOfArms('shield', event.target.value as CoatOfArmsDesign['shield'])} className="creator-input">{HERALDRY_SHIELDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
                        <Field label="底纹分区"><select value={customCoatOfArms.pattern} onChange={(event) => updateCoatOfArms('pattern', event.target.value as CoatOfArmsDesign['pattern'])} className="creator-input">{HERALDRY_PATTERNS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
                        <Field label="徽记"><select value={customCoatOfArms.emblem} onChange={(event) => updateCoatOfArms('emblem', event.target.value as CoatOfArmsDesign['emblem'])} className="creator-input">{HERALDRY_EMBLEMS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
                        <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <ColorPicker label="主色" value={customCoatOfArms.primaryColor} onChange={(value) => updateCoatOfArms('primaryColor', value)} />
                          <ColorPicker label="副色" value={customCoatOfArms.secondaryColor} onChange={(value) => updateCoatOfArms('secondaryColor', value)} />
                          <ColorPicker label="徽记色" value={customCoatOfArms.emblemColor} onChange={(value) => updateCoatOfArms('emblemColor', value)} />
                        </div>
                      </div>
                      <div className="flex flex-col items-center justify-center border border-hairline bg-ink p-3"><CoatOfArms design={customCoatOfArms} className="h-40" /><p className="mt-2 text-[10px] text-parchment-faint">{customHouseName || '未命名家族'}</p></div>
                    </div>
                  </section>
                )}

                <div className="mt-5"><SectionTitle>人物特质</SectionTitle>
                  <div className="relative mt-3"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-parchment-faint" /><input value={traitSearch} onChange={(event) => setTraitSearch(stripEmoji(event.target.value))} className="creator-input pl-8" placeholder={`搜索特质，共 ${CHARACTER_TRAITS.length} 项`} aria-label="搜索特质" />{traitSearch && <button type="button" onClick={() => setTraitSearch('')} aria-label="清除特质搜索" className="absolute right-2 top-1/2 -translate-y-1/2 text-parchment-faint hover:text-parchment transition-colors"><X className="w-3.5 h-3.5" /></button>}</div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 border border-hairline mt-2">
                    {TRAIT_CATEGORY_ORDER.map((category) => {
                      const selectedCount = selectedTraits.filter((trait) => trait.category === category).length;
                      const totalCount = CHARACTER_TRAITS.filter((trait) => trait.category === category).length;
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => { setActiveTraitCategory(category); setTraitSearch(''); }}
                          className={`py-2 px-1 text-[9px] font-serif border-r border-b border-hairline transition-colors ${activeTraitCategory === category && !traitSearch ? 'bg-gold-deep/25 text-gold-bright' : 'bg-ink/40 text-parchment-faint hover:bg-ink-3 hover:text-parchment-dim'}`}
                        >
                          <span className="block">{TRAIT_CATEGORY_LABELS[category]}</span>
                          <span className="text-[8px] font-display opacity-70">{selectedCount}/{totalCount}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="creator-trait-browser grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 max-h-[370px] overflow-y-auto pr-1">{visibleTraits.map((trait) => { const selected = selectedTraitIds.includes(trait.id); const disabled = isTraitDisabled(trait.id); return <button key={trait.id} type="button" onClick={() => handleTraitToggle(trait.id)} disabled={disabled} className={`relative p-2 border flex items-start gap-2 text-left transition-colors ${selected ? 'border-gold bg-gold-deep/15 shadow-[inset_0_0_14px_rgba(201,164,92,0.12)]' : 'border-hairline bg-ink/40 hover:border-hairline-bright'} disabled:opacity-35 disabled:cursor-not-allowed`}><GameIcon icon={trait.icon} className="w-12 h-12 shrink-0" /><span className="min-w-0 flex-1"><span className="flex justify-between gap-2 text-[11px] font-bold"><span className={selected ? 'text-gold-bright' : 'text-parchment'}>{trait.name}</span><span className={`font-display ${trait.cost < 0 ? 'text-parchment' : 'text-gold'}`}>{trait.cost >= 0 ? '+' : ''}{trait.cost}</span></span><span className="block text-[9px] text-parchment-dim mt-0.5">{formatTraitModifiers(trait.modifiers) || '无能力修正'}</span><span className="block text-[9px] text-parchment-faint leading-relaxed mt-1 line-clamp-2">{formatTraitDescription(trait.description, customName)}</span>{formatTraitRuleEffects(trait.rules).length > 0 && <span className="block text-[9px] text-gold-deep leading-relaxed mt-1 line-clamp-2">规则：{formatTraitRuleEffects(trait.rules).join(' · ')}</span>}<span className="block text-[9px] text-parchment-faint leading-relaxed mt-1 line-clamp-2">RP：{formatTraitDescription(trait.rules.roleplayDirectives?.[0] ?? trait.description, customName)}</span></span>{selected && <Check className="absolute top-1 right-1 w-3 h-3 text-gold-bright" />}</button>; })}{visibleTraits.length === 0 && <div className="sm:col-span-2 py-10 text-center text-xs text-parchment-faint">没有匹配的特质</div>}</div>
                  <p className="text-[9px] text-parchment-faint mt-2">性格特质最多选择 {MAX_PERSONALITY_TRAITS} 项；同组教育、先天等级和互斥性格会自动替换。</p>
                </div>
              </main>

              <aside className="bg-ink p-4 lg:overflow-y-auto"><SectionTitle>六项能力</SectionTitle><p className="text-[10px] text-parchment-faint mt-2">家族基础、手动分配和特质修正共同决定最终能力。</p><div className="space-y-2 mt-4">
                {CK3_SKILLS.map((skill) => { const allocatedValue = customAttributes[skill.key]; const finalValue = finalAttributes[skill.key]; const traitDelta = finalValue - allocatedValue; return <div key={skill.key} className="border border-hairline bg-ink-2/60 p-2.5 flex items-center gap-2"><GameIcon icon={skill.icon} className="w-12 h-12 shrink-0" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between"><span className="text-xs font-bold text-parchment">{skill.label}</span><span className="text-[9px] text-parchment-faint">{getCk3SkillRank(finalValue)}</span></div><div className="flex items-center gap-1.5 mt-1"><button type="button" onClick={() => handleStatChange(skill.key, -1)} disabled={allocatedValue <= 0} aria-label={`降低${skill.label}`} className="creator-stat-button"><Minus className="w-3 h-3" /></button><span className="w-8 text-center font-display text-base font-bold text-gold-bright">{finalValue}</span><button type="button" onClick={() => handleStatChange(skill.key, 1)} disabled={allocatedValue >= 30} aria-label={`提高${skill.label}`} className="creator-stat-button"><Plus className="w-3 h-3" /></button><span className="ml-auto text-[9px] text-parchment-faint">基础 {allocatedValue}</span>{traitDelta !== 0 && <span className={`text-[9px] font-display ${traitDelta > 0 ? 'text-gold' : 'text-rubric-bright'}`}>{traitDelta > 0 ? '+' : ''}{traitDelta}</span>}</div></div></div>; })}
              </div><div className="mt-4 border border-hairline bg-ink-2/60 p-3 text-[10px] text-parchment-faint space-y-2"><div className="flex justify-between"><span>家族</span><span className="text-gold truncate max-w-[180px]">{effectiveHouseName || '未命名'}</span></div><div className="flex justify-between"><span>年龄</span><span className="text-gold">{customAge} 岁</span></div><div className="flex justify-between"><span>特质目录</span><span className="text-gold">{CHARACTER_TRAITS.length} 项</span></div><div className="flex justify-between"><span>已选特质</span><span className="text-gold">{selectedTraits.length} 项</span></div><div className="pt-2 border-t border-hairline flex justify-between font-bold"><span>剩余设计点数</span><span className={`font-display ${remainingPoints < 0 ? 'text-rubric-bright' : 'text-gold-bright'}`}>{remainingPoints}</span></div></div></aside>
            </div>

            <footer className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 px-4 md:px-6 py-3 border-t border-hairline bg-ink"><div className={`flex items-center gap-2 text-[10px] ${isOverBudget || !hasValidHouse ? 'text-rubric-bright' : 'text-parchment-faint'}`}><ShieldCheck className="w-4 h-4" />{isOverBudget ? `设计点数超出限制 ${usedPoints - DESIGN_POINT_LIMIT} 点` : !hasValidHouse ? '请填写完整的家族与宗族资料' : '设计符合统治者创建规则'}</div><button type="button" onClick={handleStartCustom} disabled={!canComplete} className="btn-decree justify-center">完成统治者设计</button></footer>
          </div>
        )}
      </div>
    </div>
  );
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 pb-2 border-b border-hairline"><span className="w-1 h-4 bg-gold-deep" /><h3 className="text-xs font-serif font-bold uppercase tracking-[0.18em] text-gold">{children}</h3></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5 text-[10px] tracking-wider text-parchment-faint"><span>{label}</span>{children}</label>;
}

function IdentityLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-2"><span className="text-gold-deep">{icon}</span><span className="text-parchment-faint">{label}</span><span className="ml-auto text-parchment-dim truncate max-w-[140px]">{value}</span></div>;
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="text-[10px] text-parchment-faint"><span>{label}</span><div className="flex flex-wrap gap-1 mt-1.5">{HERALDRY_COLORS.map((color) => <button key={color} type="button" onClick={() => onChange(color)} aria-label={`${label} ${color}`} className={`w-5 h-5 border ${value === color ? 'border-gold-bright ring-1 ring-gold' : 'border-black/60'}`} style={{ backgroundColor: color }} />)}</div></div>;
}
