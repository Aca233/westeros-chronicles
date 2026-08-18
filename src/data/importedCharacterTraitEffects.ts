import type { TraitRuleSet } from '../services/traitEffectEngine';
const r = (rule: TraitRuleSet): TraitRuleSet => rule;
/**
 * 离线导入可见特质的显式游戏规则与情境 D20 骰子修正。
 * 六维属性已在特质定义中结算，此处仅表达当前系统会实际消费的情境检定修正、资源倍率、抗性与 RP 指令。
 */
export const IMPORTED_CHARACTER_TRAIT_RULES: Readonly<Record<string, TraitRuleSet>> = {
  // 童年特质（仅在未满 16 岁时生效与显示，修正上限 ±1）
  rowdy: r({
    checkModifiers: { duel: 1, stewardship: -1 },
    roleplayDirectives: ['精力充沛且喜欢肢体对抗与冒险，但缺乏耐心和自律。'],
  }),
  bossy: r({
    checkModifiers: { intimidation: 1, diplomacy: -1 },
    roleplayDirectives: ['习惯在同伴中争夺主导权并下达指令，但言辞容易显得粗暴霸道。'],
  }),
  charming: r({
    checkModifiers: { diplomacy: 1 },
    multipliers: { prestigeGain: 0.05 },
    roleplayDirectives: ['容易用笑容和举止赢得长辈与同伴的好感，但不代表所有人都会迁就其要求。'],
  }),
  pensive: r({
    checkModifiers: { learning: 1, duel: -1 },
    roleplayDirectives: ['习惯在安静中观察与思考，但在需要迅速做出身体反应时容易慢半拍。'],
  }),
  curious: r({
    checkModifiers: { intrigue: 1, resistFear: -1 },
    roleplayDirectives: ['对隐秘角落和未解之事抱有强烈探究欲，但容易忽视潜在的危险。'],
  }),
  // 身份与社会地位特质
  knight: r({
    checkModifiers: { duel: 2, resistFear: 1 },
    multipliers: { prestigeGain: 0.1 },
    roleplayDirectives: ['接受过骑士训练并受骑士荣誉约束，但身份本身不能保证决斗获胜或获得他人尊敬。'],
  }),
  maester_historical: r({
    checkModifiers: { learning: 3, medicine: 2 },
    roleplayDirectives: ['能够运用学城教育处理常见疾病、伤势、文书和历史问题，但诊断仍受资料、工具和现场条件限制。'],
  }),
  septon: r({
    checkModifiers: { learning: 2, diplomacy: 1, resistFear: 1 },
    multipliers: { prestigeGain: 0.05 },
    roleplayDirectives: ['熟悉七神教义与仪式，在信徒面前具有宗教威信，但无法施展超自然奇迹。'],
  }),
  tourney_participant: r({
    checkModifiers: { duel: 1 },
    multipliers: { prestigeGain: 0.1 },
    roleplayDirectives: ['熟悉比武场规则、长枪交锋与观者情绪，但比武技巧不等同于混乱战场的生存能力。'],
  }),
  widowed: r({
    roleplayDirectives: ['经历过丧偶之痛，其婚姻安排、情感纽带与家族态度会受到过往经历影响。'],
  }),
  refusing_marriage: r({
    checkModifiers: { diplomacy: -1, resistFear: 1 },
    roleplayDirectives: ['坚决抵触包办婚姻与联姻安排，愿意为自主选择承担家族与领主的压力。'],
  }),
  archmaester: r({
    checkModifiers: { learning: 4, medicine: 2 },
    multipliers: { prestigeGain: 0.15 },
    roleplayDirectives: ['在专业学问领域拥有极高造诣与学术权威，但观点仍可能受传统认知和学城政治局限。'],
  }),
  disputed_heritage: r({
    checkModifiers: { diplomacy: -1 },
    multipliers: { prestigeGain: -0.1 },
    roleplayDirectives: ['血统流言使其继承权与合法性受到质疑，容易成为政敌攻讦和勒索的借口。'],
  }),
  wild_oat: r({
    checkModifiers: { diplomacy: -1 },
    roleplayDirectives: ['缺少家族正式承认与庇护，在继承与社交中处于劣势，但更早学会自立求生。'],
  }),
  viking: r({
    checkModifiers: { battle: 2, survival: 1, diplomacy: -1 },
    multipliers: { prestigeGain: 0.05 },
    roleplayDirectives: ['熟悉沿海突袭、长船登岸与抢夺战利品，但在正统封建礼仪场合容易招致戒备。'],
  }),
  disinherited: r({
    checkModifiers: { diplomacy: -1 },
    multipliers: { prestigeGain: -0.15 },
    roleplayDirectives: ['已被剥夺家族继承顺位，在领地继承纠纷中处于法理劣势，可能怀抱怨恨或另谋出路。'],
  }),
  reaver: r({
    checkModifiers: { battle: 2, intimidation: 2, diplomacy: -2 },
    multipliers: { dreadGain: 0.15 },
    roleplayDirectives: ['信奉以武力夺取战利品而非交易，善于震慑弱者，但容易引起受害者的深仇大恨。'],
  }),
  adventurer_follower: r({
    checkModifiers: { survival: 2, duel: 1 },
    roleplayDirectives: ['习惯了漂泊与佣兵般的冒险生活，适应恶劣环境，但对封建领主的效忠可能缺乏深厚根基。'],
  }),
  faith_warrior: r({
    checkModifiers: { duel: 2, resistFear: 3, diplomacy: -1 },
    multipliers: { dreadGain: 0.1 },
    roleplayDirectives: ['以宗教狂热驱使剑刃，在捍卫信仰时视死如归，但对待异端和外教者缺乏妥协余地。'],
  }),
  legitimized_bastard: r({
    checkModifiers: { diplomacy: -1, intrigue: 1 },
    roleplayDirectives: ['虽已获得法律上的合法化承认，但旧日私生身份仍会在贵族圈层中引来暗中议论与排挤。'],
  }),
  red_priest: r({
    checkModifiers: { learning: 2, intimidation: 2, resistFear: 2 },
    multipliers: { dreadGain: 0.15 },
    roleplayDirectives: ['侍奉光之王并宣讲烈火与阴影，在信徒中拥有神秘威信，但无法随意召唤确定性的神迹。'],
  }),
  child_of_concubine_male: r({
    checkModifiers: { diplomacy: -1 },
    roleplayDirectives: ['出生自受承认的侍妾，在继承顺位和家族地位上通常次于正妻之子，受当地律法与习俗制约。'],
  }),
  silent_sister: r({
    checkModifiers: { learning: 1, resistFear: 3, diplomacy: -3 },
    roleplayDirectives: ['立下静默誓言专司亡者仪轨，不得开口言语，不受世俗婚姻与权势羁绊。'],
  }),
  drowned_man: r({
    checkModifiers: { resistFear: 3, survival: 2, diplomacy: -1 },
    roleplayDirectives: ['经历过受溺与复苏仪式，对死亡与风浪更加无畏，但仪式不会使肉体免疫疾病，其狂热教义也难以被外邦人理解。'],
  }),
  deserter: r({
    checkModifiers: { survival: 2, diplomacy: -3, intimidation: -1 },
    multipliers: { prestigeGain: -0.2 },
    roleplayDirectives: ['背负逃兵恶名，面临法律追捕与道德谴责，行事倾向隐匿踪迹以求自保。'],
  }),
  order_member: r({
    checkModifiers: { learning: 1, resistFear: 1 },
    roleplayDirectives: ['受宗教团体的共同誓约与清规戒律约束，言行须符合教团宗旨与同修期望。'],
  }),
  heresiarch: r({
    checkModifiers: { diplomacy: 2, intimidation: 2, learning: 2 },
    multipliers: { dreadGain: 0.2, prestigeGain: -0.1 },
    roleplayDirectives: ['在追随者中享有狂热号召力与思想领导权，但在正统教会与封建领主眼中是被严惩的异端。'],
  }),
  beardless_eunuch: r({
    checkModifiers: { diplomacy: -1, intrigue: 1 },
    roleplayDirectives: ['因身体残缺而在外貌上显露无遗，常受宫廷流言与偏见对待，但也因此容易被轻视而隐蔽行事。'],
  }),
  devoted: r({
    checkModifiers: { resistFear: 2, learning: 1, seduction: -2 },
    roleplayDirectives: ['立誓献身于崇高信仰或誓约，主动克制世俗物欲，在精神诱惑面前更为坚定。'],
  }),
  child_of_concubine_female: r({
    checkModifiers: { diplomacy: -1 },
    roleplayDirectives: ['作为侍妾之女，其联姻价值与家族地位取决于领主的重视程度与当地礼法。'],
  }),
  bearded_priest: r({
    checkModifiers: { learning: 2, resistFear: 2, diplomacy: 1 },
    roleplayDirectives: ['诺佛斯的蓄须祭司受严格等级与苦修戒律约束，在信众中拥有崇高地位，但不得违背祭司团指令。'],
  }),
  shieldmaiden: r({
    checkModifiers: { duel: 3, battle: 1, resistFear: 2 },
    multipliers: { prestigeGain: 0.1 },
    roleplayDirectives: ['以卓越武艺和坚韧意志在战场上确立威名，但可能遭遇保守封建传统对女性参战的偏见。'],
  }),
  holy_warrior: r({
    checkModifiers: { battle: 2, duel: 1, resistFear: 2 },
    multipliers: { prestigeGain: 0.1 },
    roleplayDirectives: ['受宗教热忱激励的战士，在圣战或捍卫信仰时士气高昂，但不代表能在兵力悬殊时创造奇迹。'],
  }),
  // 先天、健康与性格特质
  twin: r({
    roleplayDirectives: ['与双生手足拥有特殊亲缘经历，但不能凭空感知对方的位置、思想或危险。'],
  }),
  strong: r({
    checkModifiers: { duel: 2, survival: 1, intimidation: 1 },
    resistances: { injury: 0.1 },
    roleplayDirectives: ['天生骨骼粗壮、肌肉力量优异，在近身肉搏和体力负重中占据优势。'],
  }),
  dull: r({
    checkModifiers: { learning: -2, intrigue: -1, stewardship: -1 },
    roleplayDirectives: ['理解复杂政局、文书与精巧计谋较为吃力，容易落入言语陷阱。'],
  }),
  shrewd: r({
    checkModifiers: { intrigue: 1, stewardship: 1, learning: 1 },
    roleplayDirectives: ['观察敏锐且善于捕捉局势破绽与账目疏漏，能较快看清利益纠葛。'],
  }),
  drunkard: r({
    checkModifiers: { diplomacy: -1, stewardship: -1, duel: -1 },
    roleplayDirectives: ['严重依赖酒精麻痹神经，醉酒时判断力与反应速度明显下滑，并可能在失态中泄露秘密。'],
  }),
  depressed_1: r({
    checkModifiers: { diplomacy: -1, stewardship: -1, resistFear: -1 },
    roleplayDirectives: ['长期深陷情绪低谷与精神倦怠，处理繁杂政务与社交往来时更易感到心力交瘁。'],
  }),
  lunatic_1: r({
    checkModifiers: { diplomacy: -2, learning: -1, intrigue: 1, intimidation: 2 },
    roleplayDirectives: ['思维可能脱离现实并受妄念或幻象驱使，言行难以预测，但不会凭空得知隐藏的世界真相。'],
  }),
  celibate: r({
    checkModifiers: { seduction: -3, resistFear: 1 },
    roleplayDirectives: ['主动远离情欲与床笫诱惑，将精力投入职责或信仰，不受美色所惑。'],
  }),
  inbred: r({
    checkModifiers: { duel: -2, diplomacy: -2, learning: -1, survival: -1 },
    roleplayDirectives: ['受到近亲结合带来的遗传缺陷困扰，体魄与心智容易显露出虚弱或不稳定迹象。'],
  }),
  hunchbacked: r({
    checkModifiers: { duel: -1, diplomacy: -1 },
    roleplayDirectives: ['脊柱畸形带来身体负担与外貌异样，长途骑乘或披挂重甲较为吃力，并常遭浅薄之徒嘲弄。'],
  }),
  sickly: r({
    checkModifiers: { duel: -1, survival: -2 },
    roleplayDirectives: ['身体对寒冷、劳累和疾病格外敏感，体质孱弱，面对恶劣环境时需要更多休养与照料。'],
  }),
  infertile: r({
    roleplayDirectives: ['难以繁育亲生子嗣，这会成为封建婚姻谈判中的重大劣势与继承权危机的隐患。'],
  }),
  clubfooted: r({
    checkModifiers: { duel: -2, survival: -1 },
    roleplayDirectives: ['足部先天畸形导致步态跛行，在徒步奔跑、决斗步法和险峻地形行进中受到明显限制。'],
  }),
  stuttering: r({
    checkModifiers: { diplomacy: -2, intimidation: -1 },
    roleplayDirectives: ['言语表达存在节律障碍，在公开演讲或紧张争辩时容易受阻，但其智力与书面表达不受影响。'],
  }),
  scaly: r({
    checkModifiers: { diplomacy: -1, seduction: -1 },
    roleplayDirectives: ['皮肤粗糙并呈鳞状，容易引来无知者的异样眼光或迷信猜忌，但这种症状不能像甲胄一样减轻伤势。'],
  }),
  lisping: r({
    checkModifiers: { diplomacy: -2 },
    roleplayDirectives: ['发音不清在宫廷礼仪交际中容易招致轻视，需要付出更多努力以证明自身威严。'],
  }),
  weak: r({
    checkModifiers: { duel: -3, survival: -2 },
    roleplayDirectives: ['肌肉力量与耐力天生薄弱，在体力对抗、负重行军与搏斗中处于显著劣势。'],
  }),
  heterochromia_eyes: r({
    roleplayDirectives: ['双眼瞳色各异的奇特外貌令人过目难忘，但这种生理特征本身不会赋予魅力、威吓或任何超自然洞察力。'],
  }),
  albino: r({
    checkModifiers: { diplomacy: -1, intimidation: 1, survival: -1 },
    roleplayDirectives: ['苍白毛发与畏光的眼眸常被迷信者视为不祥征兆，在烈日与强光环境下容易感到不适。'],
  }),
  possessed_1: r({
    checkModifiers: { diplomacy: -2, intimidation: 2, intrigue: 1 },
    roleplayDirectives: ['发作时言行怪诞甚至出现痉挛狂语，旁人视其为恶魔附体或神谕附身，但无法随心所欲召唤超自然力量。'],
  }),
  hashishiyah: r({
    checkModifiers: { stewardship: -1, duel: -1 },
    roleplayDirectives: ['依赖麻醉草药排解压力，沉醉时反应迟钝、判断松懈，清醒时可能产生依赖性焦虑。'],
  }),
  contrite: r({
    checkModifiers: { diplomacy: 1, intrigue: -1, intimidation: -1 },
    multipliers: { dreadGain: -0.1 },
    roleplayDirectives: ['常因过去的过错而深感自责，行事倾向寻求和解与忏悔，难以狠下心采取残酷手段。'],
  }),
  depressed_genetic: r({
    checkModifiers: { diplomacy: -1, stewardship: -1, resistFear: -1 },
    roleplayDirectives: ['源自家族血脉的顽固忧郁如阴云笼罩，即便身处顺境也容易被无力感和消极情绪压垮。'],
  }),
  irritable: r({
    checkModifiers: { diplomacy: -1, intimidation: 1 },
    roleplayDirectives: ['性情急躁易怒，对繁杂细琐的要求缺乏耐性，容易因一时情绪激化人际摩擦。'],
  }),
  gallowsbait: r({
    checkModifiers: { intrigue: 2, diplomacy: -2, survival: 1 },
    multipliers: { dreadGain: 0.1, prestigeGain: -0.15 },
    roleplayDirectives: ['常年混迹于灰色地带与违法勾当，熟悉下层社会的脱身之道，但在体面贵族眼中声名狼藉。'],
  }),
  flagellant: r({
    checkModifiers: { resistFear: 2, duel: -1, learning: 1 },
    roleplayDirectives: ['通过自我鞭笞肉体来惩戒罪恶或寻求精神净化，满身伤痕令其耐受恐惧，但肉身持续受创。'],
  }),
  reclusive: r({
    checkModifiers: { diplomacy: -2, learning: 2 },
    roleplayDirectives: ['极度厌恶喧闹宴饮与宫廷交际，更愿意深居简出埋首于书卷或个人事务。'],
  }),
  lunatic_genetic: r({
    checkModifiers: { diplomacy: -2, learning: -1, intrigue: 1, intimidation: 2 },
    roleplayDirectives: ['血脉遗传的精神失常使思维与现实经常错位，可能出现偏执妄想，但不能预知未发生的事情。'],
  }),
  comfort_eater: r({
    checkModifiers: { stewardship: -1 },
    multipliers: { goldGain: -0.05 },
    roleplayDirectives: ['面对压力与焦虑时倾向通过过量进食寻求慰藉，难以抗拒美食诱惑与随之而来的开销。'],
  }),
  possessed_genetic: r({
    checkModifiers: { diplomacy: -2, intimidation: 2, intrigue: 1 },
    roleplayDirectives: ['家族中代代相传的癫狂发作，伴随突发性幻听与失控举动，容易引起周围人的恐慌与疏离。'],
  }),
  deviant: r({
    checkModifiers: { intrigue: 2, diplomacy: -1, seduction: 1 },
    multipliers: { dreadGain: 0.1 },
    roleplayDirectives: ['私密嗜好与行为严重违背主流正统戒律，必须极力隐蔽以防成为政治勒索与身败名裂的把柄。'],
  }),
  wheezing: r({
    checkModifiers: { duel: -2, survival: -1 },
    roleplayDirectives: ['呼吸系统脆弱，在剧烈搏斗、长跑或严寒烟尘环境中极易气喘吁吁、体力难支。'],
  }),
  rakish: r({
    checkModifiers: { seduction: 2, diplomacy: 1, stewardship: -1 },
    multipliers: { goldGain: -0.1 },
    roleplayDirectives: ['流连于风月场与享乐派对，善于风流挑逗，但在正经财务与庄重礼仪上容易显得放纵不羁。'],
  }),
  // 生活方式、性格与军事统帅特质
  lifestyle_blademaster: r({
    checkModifiers: { duel: 4, battle: 1, intimidation: 1 },
    resistances: { injury: 0.1 },
    multipliers: { prestigeGain: 0.1 },
    roleplayDirectives: ['经历无数次实战淬炼的剑术宗师，能敏锐捕捉对手破绽，但面对群体围攻或弓弩暗算仍须谨慎。'],
  }),
  lifestyle_poet: r({
    checkModifiers: { diplomacy: 2, seduction: 1, learning: 1 },
    multipliers: { prestigeGain: 0.1 },
    roleplayDirectives: ['善于运用音律与诗句传情达意、歌颂功绩或讽刺政敌，在宫廷宴会与社交场合颇受欢迎。'],
  }),
  lifestyle_hunter: r({
    checkModifiers: { survival: 2, battle: 1, duel: 1 },
    resistances: { injury: 0.05 },
    roleplayDirectives: ['精通追踪痕迹、判断风向与布置陷阱，熟悉荒野中野兽习性与隐蔽行进之道。'],
  }),
  lifestyle_mystic: r({
    checkModifiers: { learning: 2, intrigue: 2, diplomacy: -1 },
    roleplayDirectives: ['探求隐秘仪式、占卜与古老传说，善于利用人心的神秘敬畏，但无法凭空改变客观物理规律。'],
  }),
  disloyal: r({
    checkModifiers: { intrigue: 2, diplomacy: -1 },
    multipliers: { dreadGain: 0.1 },
    roleplayDirectives: ['视誓言为权宜之计，在利益与风险面前容易倒戈或背弃盟约，难以维持长久的真诚信任。'],
  }),
  lifestyle_reveler: r({
    checkModifiers: { diplomacy: 2, seduction: 1 },
    multipliers: { prestigeGain: 0.1, goldGain: -0.05 },
    roleplayDirectives: ['热爱宴饮派对并精通饮宴社交，能迅速活跃气氛拉近关系，但难免耗费资财与精力。'],
  }),
  loyal: r({
    checkModifiers: { diplomacy: 2, resistFear: 2 },
    multipliers: { prestigeGain: 0.1 },
    roleplayDirectives: ['恪守效忠誓言与信义承诺，在危难关头不易动摇，深得看重忠贞之人的敬重。'],
  }),
  reckless: r({
    checkModifiers: { duel: 2, battle: 1, survival: -2, stewardship: -1 },
    roleplayDirectives: ['行事果敢却缺乏深思熟虑，倾向正面硬拼而容易落入敌方埋伏或陷阱。'],
  }),
  administrator: r({
    checkModifiers: { stewardship: 3, diplomacy: 1 },
    multipliers: { goldGain: 0.2 },
    roleplayDirectives: ['精于官僚体制运作、法度推行与封邑管理，能使庞杂政务井井有条地高效运转。'],
  }),
  family_first: r({
    checkModifiers: { diplomacy: 1, stewardship: 1, intrigue: 1 },
    roleplayDirectives: ['始终将家族血亲的延续、利益与声誉置于首位，面对外人时更具抱团与排他倾向。'],
  }),
  unyielding_defender: r({
    checkModifiers: { battle: 3, resistFear: 2 },
    roleplayDirectives: ['精于守城作战、阵地防御与鼓舞坚守士气，在逆境防守中能沉着应对猛烈攻势。'],
  }),
  military_engineer: r({
    checkModifiers: { battle: 2, stewardship: 2 },
    roleplayDirectives: ['通晓攻城器械修造、营垒扎筑与要塞防务结构，擅长从工程技术层面瓦解敌军防御。'],
  }),
  organizer: r({
    checkModifiers: { battle: 2, stewardship: 2 },
    roleplayDirectives: ['善于规划行军路线、调度部队编制与维持队列秩序，使大军调动更为迅捷有序。'],
  }),
  cautious_leader: r({
    checkModifiers: { battle: 2, survival: 2, duel: -1 },
    roleplayDirectives: ['用兵严谨审慎，优先保障侦察与后路安全，不愿冒无把握之险，但有时可能错失战机。'],
  }),
  aggressive_attacker: r({
    checkModifiers: { battle: 3, intimidation: 1, survival: -1 },
    roleplayDirectives: ['坚信进攻即是最佳防守，长于发动迅猛突击打乱敌军阵脚，但较少顾及自身侧翼与后路防守。'],
  }),
  profligate: r({
    checkModifiers: { diplomacy: 1, stewardship: -2 },
    multipliers: { goldGain: -0.2, prestigeGain: 0.05 },
    roleplayDirectives: ['出手大方挥金如土，以此维持奢华排场与虚荣，但极易造成财政亏空与债务泥潭。'],
  }),
  flexible_leader: r({
    checkModifiers: { battle: 2, survival: 1 },
    roleplayDirectives: ['善于根据战场地形、天候与敌军变动灵活调整战术阵型，不易被套路所拘泥。'],
  }),
  forder: r({
    checkModifiers: { battle: 2, survival: 1 },
    roleplayDirectives: ['熟悉水流、滩涂、渡口与桥梁作战，善于指挥部队强渡河流并减少涉水阻滞与非战斗减员。'],
  }),
  lifestyle_physician: r({
    checkModifiers: { medicine: 3, learning: 2 },
    roleplayDirectives: ['掌握外科缝合、清创敷药与草药调配技艺，能冷静诊断病情并指导伤病患长期调理。'],
  }),
  lifestyle_wayfarer: r({
    checkModifiers: { survival: 2, diplomacy: 1 },
    roleplayDirectives: ['游历四方熟悉各地风土人情与商道驿站，在长途跋涉与异地交涉中具有丰富经验。'],
  }),
  lifestyle_gardener: r({
    checkModifiers: { stewardship: 1, learning: 1 },
    roleplayDirectives: ['懂得植物培植、土壤调理与庄园布局，在打理作物花木的耐心劳作中修身养性。'],
  }),
  logistician: r({
    checkModifiers: { stewardship: 3, battle: 1 },
    multipliers: { goldGain: 0.1 },
    roleplayDirectives: ['精于辎重筹措、粮草转运与补给线维系，深知粮秣乃军队维系战斗力之根本。'],
  }),
  lifestyle_herbalist: r({
    checkModifiers: { medicine: 2, learning: 1, survival: 1 },
    roleplayDirectives: ['熟悉野外药用植物与剧毒植物的辨识与提炼，能采集草药应急解毒救人，但知识本身不会使肉体免疫毒素。'],
  }),
  berserker: r({
    checkModifiers: { duel: 3, intimidation: 3, resistFear: 3, diplomacy: -2 },
    roleplayDirectives: ['在搏杀中能激发狂暴本能，暂时忽视恐惧与疼痛以骇人凶势压倒对手，但实际伤势不会因此减轻，且容易失去理智判断。'],
  }),
  wilderness: r({
    checkModifiers: { survival: 3, resistFear: 1 },
    resistances: { disease: 0.05 },
    roleplayDirectives: ['具备在荒野、山林与绝境中觅水、猎食、避险的求生技能，耐受严酷自然环境。'],
  }),
  // 第 5 级传奇教育特质
  education_diplomacy_5: r({
    checkModifiers: { diplomacy: 5 },
    multipliers: { prestigeGain: 0.15 },
    roleplayDirectives: ['拥有冠绝大陆的外交说服力与谈判艺术，善于化解血仇纷争，但仍须遵从基本的地缘政治现实。'],
  }),
  education_martial_5: r({
    checkModifiers: { battle: 5 },
    multipliers: { prestigeGain: 0.15 },
    roleplayDirectives: ['拥有卓越的宏观战略洞察与战场指挥艺术，能以精妙谋划扭转战局，但无法单凭智谋弥补绝对的兵力物资悬殊。'],
  }),
  education_stewardship_5: r({
    checkModifiers: { stewardship: 5 },
    multipliers: { goldGain: 0.15 },
    roleplayDirectives: ['在领地财政、税收整顿与资源调度方面拥有宗师级才干，能最大限度激发领地经济潜力。'],
  }),
  education_intrigue_5: r({
    checkModifiers: { intrigue: 5 },
    multipliers: { dreadGain: 0.15 },
    roleplayDirectives: ['在情报搜集、阴谋策划与人心操弄上出神入化，但暗中行动仍受执行人能力与意外变量制约。'],
  }),
  education_learning_5: r({
    checkModifiers: { learning: 5 },
    multipliers: { prestigeGain: 0.15 },
    roleplayDirectives: ['学识渊博贯通古今诸科，在学术辩论与历史文献考据中极具权威，但书本知识不能直接等同于实战经验。'],
  }),
};
