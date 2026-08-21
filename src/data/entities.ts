import type { CharacterId } from '../features/characters/types';
import type { WorldLocationRef } from '../features/map/types';

export interface EntityInfo {
  keywords: string[];
  name: string;
  category: 'character' | 'weapon' | 'location' | 'faction' | 'relic';
  icon: string;
  tag: string;
  description: string;
  extraStats?: string;
  characterId?: CharacterId;
  location?: WorldLocationRef;
}

export const WESTEROS_ENTITIES: EntityInfo[] = [
  // 神兵利器
  {
    keywords: ['寒冰', 'Ice', '瓦雷利亚钢巨剑 · 寒冰', '寒冰剑'],
    name: '寒冰 (Ice)',
    category: 'weapon',
    icon: 'gear-sword',
    tag: '瓦雷利亚钢巨剑',
    description: '史塔克家族传承四百年的双手巨剑。比常钢更宽，刃如暗烟，永不生锈，锋利无匹。',
    extraStats: '攻击力 +25 · 领主威仪 +15 · 破甲特性'
  },
  {
    keywords: ['长爪', 'Longclaw', '瓦雷利亚钢剑 · 长爪'],
    name: '长爪 (Longclaw)',
    category: 'weapon',
    icon: 'gear-sword',
    tag: '瓦雷利亚钢手半剑',
    description: '莫尔蒙家族传承数百年的宝剑，剑柄后由杰奥·莫尔蒙改制为白石狼头。',
    extraStats: '攻击力 +22 · 攻击速度 +10'
  },
  {
    keywords: ['龙晶', '黑曜石', '龙晶匕首', '黑曜石短刃'],
    name: '龙晶 (Dragonglass)',
    category: 'relic',
    icon: 'artifact-dragonglass',
    tag: '远古黑曜石',
    description: '瓦雷利亚语称之为“冰冻火”。古老传说中唯一能彻底斩杀异鬼与尸鬼的圣物。',
    extraStats: '对异鬼/死者伤害 +500%'
  },
  {
    keywords: ['石化龙蛋', '龙蛋', '化石龙蛋'],
    name: '三枚石化龙蛋',
    category: 'relic',
    icon: 'artifact-dragon-egg',
    tag: '古瓦雷利亚圣遗物',
    description: '产自亚夏阴影之地的巨大恐龙化石蛋。在烈火与鲜血中蕴藏着重燃魔力的真龙胚胎。',
    extraStats: '全魔法亲和 +20 · 统治威仪 +30'
  },
  
  // 关键人物
  {
    keywords: ['劳勃·拜拉席恩', '劳勃国王', '劳勃'],
    name: '劳勃·拜拉席恩 (Robert I)',
    category: 'character',
    characterId: 'agot:Baratheon_2',
    icon: 'artifact-crown',
    tag: '七国之王 · 铁王座之主',
    description: '篡夺者战争的发起者，曾以重锤击碎雷加王子胸膛的传奇战士，如今沉溺于醇酒与狩猎。',
    extraStats: '关系: 挚友 (好感 90) · 勇武 24'
  },
  {
    keywords: ['瑟曦·兰尼斯特', '瑟曦王后', '瑟曦'],
    name: '瑟曦·兰尼斯特 (Cersei Lannister)',
    category: 'character',
    characterId: 'agot:Lannister_6',
    icon: 'artifact-crown',
    tag: '七国王后 · 凯岩城金狮',
    description: '泰温·兰尼斯特公爵的掌上明珠。容貌倾国倾城，性格骄纵狠辣，深陷宫廷密谋。',
    extraStats: '关系: 猜忌/敌对 (好感 25) · 谋略 88'
  },
  {
    keywords: ['詹姆·兰尼斯特', '弑君者', '詹姆'],
    name: '詹姆·兰尼斯特 (Jaime Lannister)',
    category: 'character',
    characterId: 'agot:Lannister_7',
    icon: 'gear-sword',
    tag: '御林铁卫 · 御前第一剑士',
    description: '亲手刺杀疯王的“弑君者”。七国剑术无双的金色骑士，蔑视世俗荣誉。',
    extraStats: '勇武 28 · 剑术专精'
  },
  {
    keywords: ['提利昂·兰尼斯特', '小恶魔', '提利昂'],
    name: '提利昂·兰尼斯特 (Tyrion Lannister)',
    category: 'character',
    characterId: 'agot:Lannister_8',
    icon: 'artifact-goblet',
    tag: '兰尼斯特次子 · 智囊侏儒',
    description: '生为侏儒却拥有整个维斯特洛最敏锐深邃的头脑与口才，善于洞察人性阴暗。',
    extraStats: '谋略 95 · 学识 92 · 外交 90'
  },
  {
    keywords: ['凯特琳·徒利', '凯特琳夫人', '凯特琳'],
    name: '凯特琳·徒利 (Catelyn Stark)',
    category: 'character',
    characterId: 'agot:Tully_4',
    icon: 'artifact-winter-rose',
    tag: '临冬城公爵夫人 · 奔流城之女',
    description: '艾德·史塔克的爱妻，徒利家族“家族、责任、荣誉”箴言的坚定践行者。',
    extraStats: '关系: 伴侣 (好感 100) · 家族管理 85'
  },
  {
    keywords: ['琼恩·艾林', '前首相'],
    name: '琼恩·艾林 (Jon Arryn)',
    category: 'character',
    characterId: 'agot:Arryn_3',
    icon: 'house-arryn',
    tag: '前御前首相 · 鹰巢城公爵 (已故)',
    description: '养育劳勃与艾德如亲子的长者。近期在君临红堡离奇暴毙，死因疑点重重。',
    extraStats: '遗言: “种子很强……”'
  },

  // 关键地点
  {
    keywords: ['临冬城', 'Winterfell', '神木林'],
    name: '临冬城 (Winterfell)',
    category: 'location',
    location: { locationId: 'b_winterfell' },
    icon: 'location-winterfell',
    tag: '北境首府 · 史塔克家族祖墟',
    description: '依古老温泉而建的坚固城堡，城墙由两道巨大的花岗岩构成，神木林中古老心树守护了八千年。',
    extraStats: '防御等级: 极高 · 温泉供暖'
  },
  {
    keywords: ['绝境长城', '黑城堡', '长城'],
    name: '绝境长城 (The Wall)',
    category: 'location',
    location: { locationId: 'b_castle_black' },
    icon: 'location-hightower',
    tag: '北境极北冰墙 · 守夜人军团驻地',
    description: '由筑城者巴布用巨冰、碎石与古老魔咒筑成，高七百尺，绵延三百哩，阻隔塞外永冬之地。',
    extraStats: '驻防: 守夜人军团'
  },
  {
    keywords: ['君临', '红堡', 'King\'s Landing'],
    name: '君临 · 红堡 (King\'s Landing)',
    category: 'location',
    location: { locationId: 'b_the_red_keep' },
    icon: 'artifact-crown',
    tag: '七国国都 · 铁王座所在地',
    description: '黑水河畔的庞大王都。红堡矗立于高崖之上，铁王座下埋葬着数不尽的宫廷血腥暗战。',
    extraStats: '危险度: 极高 (间谍密布)'
  },
];
