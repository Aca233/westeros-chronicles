import { LordProfile, createDefaultBody } from '../types/game';
import { calculateFinalAttributes, migrateLordIdentityData } from './characterTraits';
import { createDaenerysItemState, createJonItemState, createNedItemState } from './itemPresetState';

export interface PresetScenario {
  id: string;
  title: string;
  subtitle: string;
  characterName: string;
  houseName: string;
  tagline: string;
  initialLocation: string;
  avatarIcon: string;
  difficulty: '普通' | '困难' | '史诗';
  backgroundStory: string;
  initialLord: LordProfile;
  initialOpening: {
    think: string;
    narrate: string;
    branches: string[];
  };
}

function createPresetLord(lord: LordProfile): LordProfile {
  const identifiedLord = migrateLordIdentityData(lord);
  const baseAttributes = { ...identifiedLord.attributes };
  return {
    ...identifiedLord,
    baseAttributes,
    attributes: calculateFinalAttributes(baseAttributes, identifiedLord.traitIds ?? []),
  };
}

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: 'ned_stark',
    title: '北境之狼 · 凛冬风暴',
    subtitle: '征服历 298 AC · 临冬城',
    characterName: '艾德·史塔克 (Eddard Stark)',
    houseName: '史塔克家族 (House Stark)',
    tagline: '“在雪花飘落、狂风怒号之夜，独行狼死，群聚狼生。”',
    initialLocation: '临冬城 · 神木林',
    avatarIcon: 'house-stark',
    difficulty: '普通',
    backgroundStory: '前首相琼恩·艾林暴毙，国王劳勃·拜拉席恩率领庞大御驾亲临北境。平静的临冬城即将被卷入君临的政治风暴与暗杀漩涡。',
    initialLord: createPresetLord({
      items: createNedItemState(),
      name: '艾德·史塔克',
      house: '史塔克家族',
      houseWords: '凛冬将至 (Winter is Coming)',
      houseSigil: 'house-stark',
      title: '临冬城公爵 · 北境守护',
      age: 35,
      gender: '男',
      location: '临冬城 · 神木林',
      body: {
        ...createDefaultBody(),
        arms: { key: 'arms', name: '双臂与双手', level: 'intact', wounds: ['左臂旧箭痕'], isFatalZone: false }
      },
      overallStatus: '强健',
      goldDragons: 450,
      silverStags: 80,
      prestige: 88,
      dread: 12,
      attributes: {
        diplomacy: 12,
        martial: 17,
        stewardship: 13,
        intrigue: 7,
        learning: 11,
        prowess: 18,
      },
      traits: ['诚实', '公正', '勇敢', '优秀战术家', '威严'],
      traitIds: ['honest', 'just', 'brave', 'education_martial_3', 'authoritative'],
      gear: {
        torso: {
          id: 'g_ned_tunic',
          name: '北境深灰羊毛外衣',
          slot: 'torso',
          slotName: '日常外衣',
          quality: '精良',
          condition: '完好坚固',
          bonusText: '厚实御寒',
          description: '临冬城领主日常穿着的深灰羊毛外衣，朴素、厚实而便于行动。',
          icon: 'gear-cloak',
        },
        mainhand: {
          id: 'g_ice',
          name: '寒冰 (Ice)',
          slot: 'mainhand',
          slotName: '主手巨剑',
          quality: '瓦雷利亚古钢',
          condition: '完好坚固',
          bonusText: '削铁如泥 · 破甲极高',
          description: '史塔克家族传承四百年的双手巨剑。艾德此刻正在神木林中擦拭剑身。',
          icon: 'gear-sword',
        },
        cloak: {
          id: 'g_ned_cloak',
          name: '厚灰狼皮御寒大氅',
          slot: 'cloak',
          slotName: '肩背斗篷',
          quality: '大师精铸',
          condition: '完好坚固',
          bonusText: '北境御寒 · 领主威仪',
          description: '精选北境灰狼毛皮精裁而成，银锁扣闭合，抵御极北严寒。',
          icon: 'gear-cloak',
        },
        legs: {
          id: 'g_ned_daily_boots',
          name: '北境熟皮长靴',
          slot: 'legs',
          slotName: '日常长靴',
          quality: '精良',
          condition: '完好坚固',
          bonusText: '防寒稳健',
          description: '内衬软羊皮的高筒长靴，适合在临冬城的雪地与石道上行走。',
          icon: 'gear-chainmail',
        },
      },
      carriedItems: [
        { id: 'p_herb_1', name: '鲁温学士止血药草', category: '药草', quantity: 2, size: 'tiny', description: '捣碎的心树根与马兰草，可快速包扎轻度撕裂创口。' },
        { id: 'p_milk_poppy', name: '罂粟花奶 (镇痛剂)', category: '药草', quantity: 1, size: 'tiny', description: '重伤时服下可镇痛安神，但会轻微降低心智警觉。' },
      ],
      storageSites: [
        {
          id: 'winterfell_armory', name: '临冬城军械库', type: 'armory', location: '临冬城',
          description: '由军械官和侍从看守的领主武备库。',
          items: [
            { id: 'g_ned_helm', name: '史塔克狼首战盔', category: '防具', quantity: 1, size: 'large', description: '雕刻冰原狼浮雕的精钢盔。', icon: 'gear-helmet', slot: 'head', gearData: { id: 'g_ned_helm', name: '史塔克狼首战盔', slot: 'head', slotName: '头部战盔', quality: '精良', condition: '完好坚固', bonusText: '要害护头 · 减震', description: '雕刻有冰原狼浮雕的北境半覆面精钢盔。', icon: 'gear-helmet' } },
            { id: 'g_ned_armor', name: '临冬城公爵重板甲', category: '防具', quantity: 1, size: 'large', description: '领主出征时穿着的全套重甲。', icon: 'gear-armor', slot: 'torso', gearData: { id: 'g_ned_armor', name: '临冬城公爵重板甲', slot: 'torso', slotName: '躯干重铠', quality: '大师精铸', condition: '完好坚固', bonusText: '重型躯干防御', description: '内衬熟牛皮与锁子甲，能抵挡绝大多数刀剑劈砍。', icon: 'gear-armor' } },
            { id: 'g_ned_shield', name: '灰狼纹章鸢形大盾', category: '防具', quantity: 1, size: 'large', description: '漆绘临冬城奔狼纹章的木芯包铁盾。', icon: 'gear-armor', slot: 'offhand', gearData: { id: 'g_ned_shield', name: '灰狼纹章鸢形大盾', slot: 'offhand', slotName: '副手大盾', quality: '精良', condition: '完好坚固', bonusText: '格挡偏斜', description: '表面漆绘有临冬城奔狼图案的坚固木芯包铁盾。', icon: 'gear-armor' } },
            { id: 'g_ned_war_boots', name: '精钢护胫熟皮战靴', category: '防具', quantity: 1, size: 'large', description: '外覆精钢护胫的高筒战靴。', icon: 'gear-chainmail', slot: 'legs', gearData: { id: 'g_ned_war_boots', name: '精钢护胫熟皮战靴', slot: 'legs', slotName: '下肢战靴', quality: '精良', condition: '完好坚固', bonusText: '下肢防护 · 稳健', description: '内衬软羊皮的高筒马靴，外覆小腿精钢护胫。', icon: 'gear-chainmail' } },
          ],
        },
        {
          id: 'winterfell_stable', name: '临冬城马厩', type: 'stable', location: '临冬城',
          description: '城堡内饲养领主坐骑和驮畜的石木马厩。',
          items: [{ id: 'ned_warhorse', name: '战马 · 灰风之影', category: '坐骑', quantity: 1, size: 'large', description: '体魄雄健的北境重装战马。' }],
        },
      ],
      transports: [],
    }),
    initialOpening: {
      think: '国王劳勃·拜拉席恩的庞大御驾即将抵达临冬城。前首相琼恩·艾林在君临神秘暴毙，莱莎·艾林的密信暗示兰尼斯特家族参与了谋杀。此时必须在君王面前维持尊严，同时暗中保护家族。',
      narrate: `神木林中一片死寂，唯有残雪从古老鱼梁木猩红叶片上滑落的轻微沙沙声。\n\n艾德·史塔克公爵独自坐在冰冷的黑石池畔，手中握着【瓦雷利亚钢巨剑 · 寒冰】。他用浸透油脂的厚麻布沿着剑锋上如烟波般流淌的暗黑纹理缓缓擦拭。池水中倒映着鱼梁木上那张由远古先民雕凿的苍白面孔，树皮上渗出的猩红树汁如同干涸的血泪，冷冷俯瞰着这片统治了数千年的极北冻土。\n\n急促的脚步声踏碎了林间的积雪。凯特琳·徒利夫人裹着厚重的灰松鼠皮斗篷穿过林径，她的眼眶微红，手中紧紧攥着一卷用蓝丝线系紧的密信。\n\n“奈德，”凯特琳的声音在寒风中微微发颤，带着三叉戟河家族特有的警觉与忧虑，“罗德利克教头刚刚派人来报，国王的先锋骑兵已越过避冬市镇，距离主堡大门不足两里。劳勃陛下的宝冠雄鹿金旗遮蔽了风雪……但在那之后，跟着兰尼斯特家族整整三百名金甲侍卫与瑟曦王后的车驾。”\n\n她走上前，将那卷密信递到艾德面前：“还有这个……鲁温学士刚刚在渡鸦塔截获了莱莎从鹰巢城发来的密卷。她用我们幼时的暗语写就——前首相琼恩·艾林并非死于突发热病，而是死于毒杀。下毒之人，就在君临红堡的王后身边。”\n\n艾德停下了手中的动作。他缓缓将长达六英尺的巨剑收回沉重的灰狼皮剑鞘中，剑镡上的精钢锁扣发出咔哒一声脆响。\n\n“劳勃是我的挚友，与我情同手足。”艾德低沉地说道，呼出的热气在极寒的空气中凝结成浓重的白雾，“但他如今是统治七大王国的君王，而君临从来不是北境。传令下去，让罗柏带领所有侍卫在主堡内院列队，全城封臣随我前往主门迎候御驾。”`,
      branches: [
        '收剑入鞘，率领史塔克全族子嗣与北境诸侯前往主堡大门，恭敬迎候国王御驾',
        '在神木林心树前向古神祈祷，随后私下召集鲁温学士商讨如何密查琼恩·艾林死因',
        '令罗德利克教头暗中加强城堡戒备与地牢看守，防止兰尼斯特随从在城中生事'
      ]
    }
  },
  {
    id: 'jon_snow',
    title: '守夜人新兵 · 绝壁守望',
    subtitle: '征服历 298 AC · 绝境长城',
    characterName: '琼恩·雪诺 (Jon Snow)',
    houseName: '守夜人军团 / 史塔克私生子',
    tagline: '“长夜将至，我从今开始守望，至死方休。”',
    initialLocation: '黑城堡 · 绝境长城',
    avatarIcon: 'house-stark',
    difficulty: '困难',
    backgroundStory: '作为临冬城的私生子，琼恩告别了家人，跟随叔叔班扬·史塔克北上绝境长城，穿上黑衣成为守夜人誓言兄弟。长城之外的塞外正悄然发生着可怕的异变。',
    initialLord: createPresetLord({
      items: createJonItemState(),
      name: '琼恩·雪诺',
      house: '雪诺 (史塔克私生子)',
      houseWords: '守夜人誓约 (Night gathers, and now my watch begins)',
      houseSigil: 'house-stark',
      title: '临冬城私生子 · 守夜人新兵',
      age: 14,
      gender: '男',
      location: '黑城堡 · 绝境长城',
      body: createDefaultBody(),
      overallStatus: '强健',
      goldDragons: 15,
      silverStags: 120,
      prestige: 25,
      dread: 5,
      attributes: {
        diplomacy: 8,
        martial: 11,
        stewardship: 7,
        intrigue: 8,
        learning: 10,
        prowess: 16,
      },
      traits: ['私生子', '守夜人', '勇敢', '固执', '坚强的战士'],
      traitIds: ['bastard', 'nightswatch', 'brave', 'stubborn', 'education_martial_2'],
      gear: {
        torso: {
          id: 'g_jon_uniform',
          name: '守夜人黑羊毛制服',
          slot: 'torso',
          slotName: '日常黑衣',
          quality: '精良',
          condition: '完好坚固',
          bonusText: '厚实御寒',
          description: '守夜人日常值勤所穿的黑羊毛上衣，外罩轻便熟皮背心。',
          icon: 'gear-cloak',
        },
        mainhand: {
          id: 'g_jon_sword',
          name: '城堡精锻手半剑',
          slot: 'mainhand',
          slotName: '主手佩剑',
          quality: '精良',
          condition: '完好坚固',
          bonusText: '平衡极佳',
          description: '罗德利克教头赠予的精钢利剑。',
          icon: 'gear-sword',
        },
        cloak: {
          id: 'g_jon_cloak',
          name: '黑衣守夜人风雪斗篷',
          slot: 'cloak',
          slotName: '肩背斗篷',
          quality: '精良',
          condition: '完好坚固',
          bonusText: '黑夜隐匿 · 风雪御寒',
          description: '厚重严密的纯黑御寒斗篷。',
          icon: 'gear-cloak',
        },
        companion: {
          name: '白灵 (Ghost)',
          type: '白化冰原狼',
          bonus: '无声潜行 +15',
          description: '赤红眼眸、通体雪白的通灵巨狼。',
        },
      },
      carriedItems: [
        { id: 'p_firewater', name: '守夜人烈酒囊', category: '药草', quantity: 2, size: 'small', description: '驱寒活血的极北烈酒。' },
      ],
      storageSites: [{
        id: 'castle_black_quarters', name: '黑城堡住处木箱', type: 'room', location: '黑城堡',
        description: '琼恩床铺旁用于收存换洗衣物和巡逻装备的木箱。',
        items: [{ id: 'g_jon_leathers', name: '守夜人加厚熟皮甲', category: '防具', quantity: 1, size: 'large', description: '巡逻与战斗时穿着的加厚熟皮甲。', icon: 'gear-armor', slot: 'torso', gearData: { id: 'g_jon_leathers', name: '守夜人加厚熟皮甲', slot: 'torso', slotName: '躯干皮甲', quality: '精良', condition: '完好坚固', bonusText: '御寒轻甲防护', description: '长城巡逻与战斗时使用的标准黑衣御寒厚皮甲。', icon: 'gear-armor' } }],
      }],
      transports: [],
    }),
    initialOpening: {
      think: '守夜人军团已衰落百年，塞外野人异动频频。作为私生子，黑衣誓言是救赎亦是枷锁。',
      narrate: `绝境长城的寒风如同无数柄呼啸的冰刀，狂暴地掠过七百英尺高的湛蓝冰壁。\n\n黑城堡泥泞的演武场上，火把在风雪中摇曳明灭，空气中充斥着马粪、劣质麦酒与潮湿羊毛的刺鼻气味。年轻的琼恩·雪诺紧了紧身上那件沉重的纯黑斗篷，蹲伏在他脚边的白灵没有发出半点声响，那双如红宝石般澄澈的血眸警惕地凝视着北方无边无际的鬼影森林。\n\n“男孩，别傻站着吹风。”莫尔蒙总司令披着厚实的熊皮大氅大步走来，他那只毛发稀疏的老渡鸦正停在肩头，喉咙里发出沙哑的低叫：“玉米！玉米！死人！死人！”\n\n莫尔蒙在冰结的栏杆前停下脚步，粗糙厚实的大手重重按在琼恩肩头。老司令注视着眼前这个拥有史塔克式灰眸的私生子，目光深沉如海：“班扬带队出巡已经二十天了，塞外三个野人村落全部空无一人，连牲畜的骨头都没留下一根。长城之外有些沉睡了八千年的阴暗东西正在苏醒……七国的贵族们还在君临争权夺利，但守夜人的誓言，是为了守卫生者的国度。”\n\n不远处的木阶上，双目失明的伊蒙学士在事务官的搀扶下缓缓走来，老人的声音虚弱却如同清泉击石：“凛冬将至，雪诺大人。每一只黑衣乌鸦都必须在长夜中找到属于自己的火种。”`,
      branches: [
        '追随莫尔蒙总司令巡视长城顶端哨塔与弩炮防务',
        '前往演武场与艾里沙·索恩爵士的新兵进行实战剑术对练',
        '前往渡鸦塔向伊蒙学士请教绝境长城筑城的古老魔法与先民传说'
      ],
    },
  },
  {
    id: 'daenerys_targaryen',
    title: '龙之母 · 烈火燎原',
    subtitle: '征服历 298 AC · 厄索斯大陆',
    characterName: '丹妮莉丝·坦格利安 (Daenerys Targaryen)',
    houseName: '坦格利安家族 (House Targaryen)',
    tagline: '“若我回头，我便迷失。”',
    initialLocation: '潘托斯 · 伊利里欧宅邸',
    avatarIcon: 'house-targaryen',
    difficulty: '史诗',
    backgroundStory: '坦格利安王室覆灭，风暴降生的丹妮莉丝在厄索斯大陆流亡。哥哥韦赛里斯将其作为筹码许配给多斯拉克的卓戈卡奥，以换取夺回铁王座的军队。',
    initialLord: createPresetLord({
      items: createDaenerysItemState(),
      name: '丹妮莉丝·坦格利安',
      house: '坦格利安家族',
      houseWords: '血与火 (Fire and Blood)',
      houseSigil: 'house-targaryen',
      title: '坦格利安末裔 · 龙之母',
      age: 14,
      gender: '女',
      location: '潘托斯 · 伊利里欧宅邸',
      body: createDefaultBody(),
      overallStatus: '强健',
      goldDragons: 200,
      silverStags: 50,
      prestige: 50,
      dread: 0,
      attributes: {
        diplomacy: 16,
        martial: 8,
        stewardship: 10,
        intrigue: 11,
        learning: 14,
        prowess: 6,
      },
      traits: ['倾国倾城', '龙梦', '勇敢', '野心勃勃'],
      traitIds: ['beauty_good_3', 'dragon_dreams', 'brave', 'ambitious'],
      gear: {
        torso: {
          id: 'g_dany_silk',
          name: '自由城邦淡紫丝绸长裙',
          slot: 'torso',
          slotName: '华贵裙袍',
          quality: '精良',
          condition: '完好坚固',
          bonusText: '魅力与异域仪态',
          description: '潘托斯总督伊利里欧赠予的昂贵丝袍，轻盈柔顺。',
          icon: 'gear-cloak',
        },
        mainhand: {
          id: 'g_bare_fist',
          name: '徒手空拳',
          slot: 'mainhand',
          slotName: '空手',
          quality: '粗制',
          condition: '完好坚固',
          bonusText: '无武器加成',
          description: '当前没有持握武器；丹妮莉丝正双手捧着石化龙蛋。',
          icon: 'gear-sword',
        },
        cloak: {
          id: 'g_dany_veil',
          name: '厄索斯金丝面纱',
          slot: 'cloak',
          slotName: '金丝面纱',
          quality: '精良',
          condition: '完好坚固',
          bonusText: '神秘高贵',
          description: '点缀细碎珍珠的华美薄纱。',
          icon: 'gear-cloak',
        },
      },
      carriedItems: [
        { id: 'p_dragon_egg', name: '石化龙蛋 (黑红斑纹)', category: '信物', quantity: 1, size: 'medium', description: '来自阴影之地的古老石化龙蛋；此刻正被丹妮莉丝捧在手中。' },
        { id: 'p_scent', name: '潘托斯香脂', category: '药草', quantity: 2, size: 'tiny', description: '舒缓心神的异域香料。' },
      ],
      storageSites: [{
        id: 'illyrio_guest_room', name: '伊利里欧宅邸客房', type: 'room', location: '潘托斯',
        description: '丹妮莉丝暂居客房中的衣箱与梳妆柜。',
        items: [{ id: 'g_dany_dagger', name: '瓦雷利亚镂金雕花短匕', category: '武器', quantity: 1, size: 'small', description: '镶嵌紫晶的精巧防身匕首，目前收在衣箱中。', icon: 'gear-sword', slot: 'mainhand', gearData: { id: 'g_dany_dagger', name: '瓦雷利亚镂金雕花短匕', slot: 'mainhand', slotName: '防身短刃', quality: '精良', condition: '完好坚固', bonusText: '隐蔽防身', description: '镶嵌紫晶的精巧匕首。', icon: 'gear-sword' } }],
      }],
      transports: [],
    }),
    initialOpening: {
      think: '多斯拉克人崇尚力量与烈马，韦赛里斯残暴而愚蠢。必须在这个残酷的游牧世界中建立自己的权威。',
      narrate: `潘托斯黄昏的余晖洒在狭海平静的海面上，伊利里欧总督高耸的宅邸花园里弥漫着苦橙花与甜没药的浓郁异香。\n\n十四岁的丹妮莉丝·坦格利安独自坐在大理石柱廊下，双手捧着那枚沉甸甸的石化龙蛋。龙蛋表面布满了黑红交织的坚硬鳞纹，在夕阳下泛着暗哑的玉石光泽。尽管它已经在亚夏以东的阴影之地风化沉睡了数百年，但当丹妮莉丝的指尖滑过那些粗糙的纹理时，胸膛深处却隐隐能感受到石壳下传来的一阵阵若有若无的温热搏动。\n\n“看着我，丹妮！”韦赛里斯粗暴的声音打碎了宁静。流亡的乞丐王一把扯住妹妹的银金色长发，那双浅紫色的眼眸中闪烁着近乎病态的狂怒与贪婪，“今晚卓戈卡奥就会带着他的四万咆哮骑兵入城！你必须穿上那件薄如蝉翼的丝袍，用你所有的美貌去取悦他！只要他肯把军队借给我渡过狭海夺回铁王座，哪怕让他手下的四万个马王全上你，我也绝不在乎！”\n\n丹妮莉丝强忍着头皮被扯紧的剧痛，没有流出一滴眼泪。她静静地凝视着哥哥扭曲的面孔，紫眸中掠过一丝连她自己都未曾察觉的冷冽。\n\n大厅外，大地隐隐传来阵阵雷鸣般的马蹄震动——多斯拉克的卡拉萨大军，已经兵临潘托斯城下。`,
      branches: [
        '紧抱龙蛋，在伊利里欧总督的引荐下以真龙血脉的高贵仪态直面卓戈卡奥',
        '向总督侍女打探多斯拉克人的禁忌习俗，寻找在这场蛮族联姻中自保与掌控权力的契机',
        '暗中联络流亡骑士乔拉·莫尔蒙爵士，探听维斯特洛君临城针对坦格利安末裔的刺客动向'
      ],
    },
  },
];
