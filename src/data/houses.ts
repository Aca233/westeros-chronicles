export interface HouseInfo {
  id: string;
  name: string;
  englishName: string;
  sigil: string;
  words: string;
  seat: string;
  region: string;
  description: string;
  defaultAttributes: {
    diplomacy: number;
    martial: number;
    stewardship: number;
    intrigue: number;
    learning: number;
    prowess: number;
  };
  ancestralWeapon?: string;
}

export const HOUSES: HouseInfo[] = [
  {
    id: 'stark',
    name: '史塔克家族',
    englishName: 'House Stark',
    sigil: 'house-stark',
    words: '凛冬将至 (Winter is Coming)',
    seat: '临冬城',
    region: '北境',
    description: '先民血统的古老家族，统治北境数千年。以正直、刚毅与荣誉著称。',
    defaultAttributes: {
      diplomacy: 9,
      martial: 14,
      stewardship: 12,
      intrigue: 7,
      learning: 10,
      prowess: 14,
    },
    ancestralWeapon: '瓦雷利亚钢巨剑 · 寒冰 (Ice)',
  },
  {
    id: 'lannister',
    name: '兰尼斯特家族',
    englishName: 'House Lannister',
    sigil: 'house-lannister',
    words: '听我怒吼！(Hear Me Roar!)',
    seat: '凯岩城',
    region: '西境',
    description: '安达尔人血统，七国中最富有的家族。俗语“有债必偿”，权谋深重。',
    defaultAttributes: {
      diplomacy: 12,
      martial: 11,
      stewardship: 15,
      intrigue: 16,
      learning: 12,
      prowess: 10,
    },
    ancestralWeapon: '瓦雷利亚钢剑 · 光啸 (Brightroar / 已失落)',
  },
  {
    id: 'targaryen',
    name: '坦格利安家族',
    englishName: 'House Targaryen',
    sigil: 'house-targaryen',
    words: '血火同源 (Fire and Blood)',
    seat: '龙石岛 / 君临',
    region: '王领',
    description: '古瓦雷利亚自由堡垒的龙王血脉，拥有银金发色与紫眸，驭龙征服者。',
    defaultAttributes: {
      diplomacy: 14,
      martial: 13,
      stewardship: 10,
      intrigue: 12,
      learning: 14,
      prowess: 12,
    },
    ancestralWeapon: '瓦雷利亚钢剑 · 黑火 / 暗黑姐妹',
  },
  {
    id: 'baratheon',
    name: '拜拉席恩家族',
    englishName: 'House Baratheon',
    sigil: 'house-baratheon',
    words: '怒火熄灭 (Ours is the Fury)',
    seat: '风息堡 / 君临',
    region: '风暴地',
    description: '勇武粗犷的战士家族，推翻疯王统治建立新王朝。力量与暴怒的化身。',
    defaultAttributes: {
      diplomacy: 11,
      martial: 15,
      stewardship: 8,
      intrigue: 7,
      learning: 7,
      prowess: 16,
    },
  },
  {
    id: 'tyrell',
    name: '提利尔家族',
    englishName: 'House Tyrell',
    sigil: 'house-tyrell',
    words: '生生不息 (Growing Strong)',
    seat: '高庭',
    region: '河湾地',
    description: '统治维斯特洛最富饶土地的家族，粮食与军队极其雄厚，擅长贵族外交。',
    defaultAttributes: {
      diplomacy: 15,
      martial: 10,
      stewardship: 15,
      intrigue: 13,
      learning: 11,
      prowess: 9,
    },
  },
  {
    id: 'martell',
    name: '马泰尔家族',
    englishName: 'House Martell',
    sigil: 'house-martell',
    words: '不屈不挠 (Unbowed, Unbent, Unbroken)',
    seat: '阳戟城',
    region: '多恩',
    description: '洛伊拿人血统，多恩亲王统治者。民风彪悍，誓不屈服于外来征服者。',
    defaultAttributes: {
      diplomacy: 12,
      martial: 13,
      stewardship: 10,
      intrigue: 14,
      learning: 12,
      prowess: 13,
    },
  },
  {
    id: 'arryn',
    name: '艾林家族',
    englishName: 'House Arryn',
    sigil: 'house-arryn',
    words: '高如荣耀 (As High as Honor)',
    seat: '鹰巢城',
    region: '谷地',
    description: '安达尔纯正贵族血统，居于天险要塞鹰巢城。以崇高荣誉与山谷骑士闻名。',
    defaultAttributes: {
      diplomacy: 14,
      martial: 12,
      stewardship: 12,
      intrigue: 9,
      learning: 13,
      prowess: 11,
    },
  },
  {
    id: 'greyjoy',
    name: '葛雷乔伊家族',
    englishName: 'House Greyjoy',
    sigil: 'house-greyjoy',
    words: '强取胜于苦耕 (We Do Not Sow)',
    seat: '派克堡',
    region: '铁群岛',
    description: '信仰淹神的铁种掠夺者，擅长海战与劫掠。“付铁钱而非金钱”。',
    defaultAttributes: {
      diplomacy: 7,
      martial: 14,
      stewardship: 7,
      intrigue: 11,
      learning: 8,
      prowess: 15,
    },
  },
  {
    id: 'tully',
    name: '徒利家族',
    englishName: 'House Tully',
    sigil: 'house-tully',
    words: '家族·责任·荣誉 (Family, Duty, Honor)',
    seat: '奔流城',
    region: '河间地',
    description: '统治三叉戟河流域的古老家族，重视家庭纽带与封建封臣责任。',
    defaultAttributes: {
      diplomacy: 14,
      martial: 11,
      stewardship: 13,
      intrigue: 9,
      learning: 11,
      prowess: 10,
    },
  },
];
