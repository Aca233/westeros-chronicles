// Generated character dossier narrative supplement dataset
// Curated public-at-start profiles for 100+ canon and important characters
import type { CharacterId } from '../features/characters/types';
import type { CharacterDossierSupplement } from '../features/characters/characterSupplementTypes';

export const CHARACTER_DOSSIER_SUPPLEMENTS: Record<CharacterId, CharacterDossierSupplement> = {
  "agot:Stark_3": {
    "characterId": "agot:Stark_3",
    "summary": "临冬城公爵兼北境守护，曾参与推翻坦格利安王朝的战争。性情沉静克制，以荣誉、责任和对家族的忠诚闻名七国。",
    "publicRoles": [
      "临冬城公爵",
      "北境守护"
    ],
    "aliases": [
      "奈德",
      "安静的狼"
    ],
    "appearance": "面容削瘦严肃，留着灰黑斑白的短胡须，灰眸如冬日之水。身材匀称结实，常着朴素深灰皮甲与厚重羊皮大氅。",
    "personality": "言语简练谨慎，极度看重誓言与荣誉；处事公正无私，对家人温厚爱护，面对谎言与阴谋时绝不妥协。",
    "reputation": "在北境诸侯与临冬城臣属间以公正、克制和重视誓言著称，其严肃作风也让不熟悉他的人感到疏离。",
    "experiences": [
      {
        "date": "8281",
        "title": "赫伦堡比武会",
        "description": "随父亲与兄妹前往赫伦堡参加盛大比武大会，见证雷加·坦格利安将爱与美的王冠献给莱安娜·史塔克。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Reed_1"
        ]
      },
      {
        "date": "8283",
        "title": "篡夺者战争",
        "description": "在父兄惨遭疯王杀害后，与劳勃及琼恩·艾林在谷地起兵讨伐坦格利安王室，并迎娶凯特琳·徒利巩固同盟。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Robert%27s_Rebellion",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Arryn_3",
          "agot:Tully_4"
        ]
      },
      {
        "date": "8289",
        "title": "葛雷乔伊叛乱",
        "description": "与国王劳勃合兵征讨发动叛乱的巴隆·葛雷乔伊，攻破派克城后将巴隆幼子席恩带回临冬城作为人质抚养。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Greyjoy%27s_Rebellion",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Greyjoy_5",
          "agot:Greyjoy_14"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Baratheon_2",
        "kind": "挚友与封君",
        "description": "两人自幼在艾林谷作为琼恩·艾林的养子共同成长，并在战争中结下生死情谊。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark"
      },
      {
        "targetId": "agot:Arryn_3",
        "kind": "养父与导师",
        "description": "琼恩·艾林如同第二个父亲，在疯王要求交出养子时毅然起兵保护奈德与劳勃。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jon_Arryn"
      },
      {
        "targetId": "agot:Reed_1",
        "kind": "生死战友",
        "description": "霍兰曾与奈德并肩经历极乐塔之战，此后仍是北境中受到奈德信任的旧友。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Howland_Reed"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Eddard_Stark",
      "https://asoiaf.fandom.com/zh/wiki/Eddard_Stark"
    ]
  },
  "agot:Stark_7": {
    "characterId": "agot:Stark_7",
    "summary": "艾德·史塔克带回临冬城并公开承认的私生子，自幼与史塔克子女一同受教。性情敏锐内敛，在私生身份带来的隔阂中，渴望凭自身能力赢得立足之地。",
    "publicRoles": [
      "临冬城公爵的私生子"
    ],
    "aliases": [
      "琼恩·雪诺"
    ],
    "appearance": "身材修长精干，面容带有史塔克家族典型的先民特征，长脸黑发，灰眸深邃，神态较同龄人更为沉静谨慎。",
    "personality": "敏锐内敛，自尊心极强；渴望在远离世俗偏见的绝境长城依靠能力赢得荣誉，对待弱者充满同情心。",
    "reputation": "被外界视为奈德公爵唯一的名誉污点，在临冬城侍卫与下人间以剑术出众、性格沉稳受到认可。",
    "experiences": [
      {
        "date": "8283",
        "title": "随父返回临冬城",
        "description": "篡夺者战争结束后被艾德·史塔克带回临冬城抚养，其生母身份成为奈德绝口不提的秘密。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jon_Snow",
        "participantIds": [
          "agot:Stark_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Stark_4",
        "kind": "崇拜的叔叔",
        "description": "将身为守夜人首席游骑兵的班扬视为楷模，也是促使其决定北上绝境长城的重要原因。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Benjen_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Jon_Snow",
      "https://asoiaf.fandom.com/zh/wiki/Jon_Snow"
    ]
  },
  "agot:Targaryen_9": {
    "characterId": "agot:Targaryen_9",
    "summary": "坦格利安王朝流亡公主，诞生于龙石岛的风暴之夜。家族覆灭后随兄长辗转自由贸易城邦，长期寄居他人门下，受制于兄长的复国野心。",
    "publicRoles": [
      "流亡公主",
      "真龙末裔"
    ],
    "aliases": [
      "风暴降生",
      "龙石岛公主"
    ],
    "appearance": "拥有坦格利安标志性的银金长发与淡紫色眼眸，容貌娇柔绝美，身材纤细轻盈，眼神中初显坚韧神采。",
    "personality": "初时怯懦柔顺，在兄长的暴躁压迫下求生；内心深处怀揣对故土与归宿的渴望，逐渐展露出真龙血脉的勇气与威严。",
    "reputation": "在厄索斯城邦间被称为流亡的末代王女，君临红堡则视其为必须严密防范的余孽隐患。",
    "experiences": [
      {
        "date": "8284",
        "title": "风暴降生龙石岛",
        "description": "在摧毁王室舰队的夏日风暴中诞生于龙石岛，母亲蕾拉王后在难产中逝世，随后在忠臣护送下渡海流亡。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Daenerys_Targaryen",
        "participantIds": [
          "agot:Targaryen_8"
        ]
      },
      {
        "date": "8297",
        "title": "庇护于潘托斯",
        "description": "与兄长韦赛里斯受到潘托斯总督伊利里欧·摩帕提斯接纳，住进其高墙豪宅中筹划借兵夺国。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Illyrio_Mopatis",
        "participantIds": [
          "agot:Targaryen_8",
          "agot:Mopatis_1"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Mopatis_1",
        "kind": "庇护赞助者",
        "description": "潘托斯富商总督，为流亡的坦格利安兄妹提供住所与生活所需。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Illyrio_Mopatis"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Daenerys_Targaryen",
      "https://asoiaf.fandom.com/zh/wiki/Daenerys_Targaryen"
    ]
  },
  "agot:Tully_4": {
    "characterId": "agot:Tully_4",
    "summary": "奔流城霍斯特·徒利公爵长女，临冬城公爵夫人。恪守“家族、责任、荣誉”的箴言，全心辅佐丈夫并守护子女，深受北境人民敬重。",
    "publicRoles": [
      "临冬城公爵夫人",
      "奔流城贵女"
    ],
    "aliases": [
      "凯特夫人"
    ],
    "appearance": "端庄秀美，拥有徒利家族经典的赤褐色长发、湛蓝眼眸与白皙肤色，举止从容优雅，兼具南方教养与北境坚韧。",
    "personality": "忠诚顾家，政治直觉敏锐但偶有感情用事；对子女爱护备至，对私生子琼恩·雪诺心怀介蒂与冷淡戒备。",
    "reputation": "被河间地与北境诸侯视为极具教养与尊严的贵族主母，以果断与忠贞著称。",
    "experiences": [
      {
        "date": "8283",
        "title": "与艾德·史塔克联姻",
        "description": "在原未婚夫布兰登·史塔克遇害后，依约改嫁其弟艾德以缔结北境与河间地的反抗疯王军事同盟。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Catelyn_Stark",
        "participantIds": [
          "agot:Stark_3",
          "agot:Tully_1"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Baelish_2",
        "kind": "幼时养弟与崇慕者",
        "description": "培提尔自幼在奔流城长大并深爱凯特琳，甚至曾为她向布兰登·史塔克发起决斗。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Petyr_Baelish"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Catelyn_Stark",
      "https://asoiaf.fandom.com/zh/wiki/Catelyn_Tully"
    ]
  },
  "agot:Stark_6": {
    "characterId": "agot:Stark_6",
    "summary": "临冬城继承人，艾德·史塔克与凯特琳的长子。在父亲悉心培养下成长为一名正直勇敢、擅长马术与剑术的年轻领袖。",
    "publicRoles": [
      "临冬城继承人"
    ],
    "aliases": [
      "临冬城少主"
    ],
    "appearance": "相貌承袭母亲的徒利家族特征，身材高大壮硕，红棕色卷发，蓝眸明亮有神，身旁跟随着形影不离的冰原狼灰风。",
    "personality": "勇敢刚毅，胸怀坦荡；继承了父亲的荣誉感与责任心，在重大决断前迅速展现出与年龄不相称的威严。",
    "reputation": "临冬城军民普遍爱戴的年轻少主，被北境封臣视为合格的未来北境守护。",
    "experiences": [
      {
        "date": "8283",
        "title": "奔流城降生",
        "description": "在篡夺者战争期间诞生于母亲的家族城堡奔流城，战后随母亲移居北境临冬城。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Robb_Stark",
        "participantIds": [
          "agot:Tully_4",
          "agot:Stark_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Greyjoy_14",
        "kind": "亲密同伴与侍从",
        "description": "席恩作为人质在临冬城生活近十年，与罗柏情同知交好友与并肩骑士。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Theon_Greyjoy"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Robb_Stark",
      "https://asoiaf.fandom.com/zh/wiki/Robb_Stark"
    ]
  },
  "agot:Stark_8": {
    "characterId": "agot:Stark_8",
    "summary": "艾德·史塔克与凯特琳的长女。自幼受南方淑女礼仪熏陶，精通刺绣、音律与诗歌，对骑士传说与王廷浪漫生活充满向往。",
    "publicRoles": [
      "临冬城长女",
      "贵族淑女"
    ],
    "aliases": [
      "小鸟"
    ],
    "appearance": "身材高挑优雅，继承了徒利家的浓密赤褐长发与明亮蓝眸，仪态端庄娇美，身边伴有温柔温顺的冰原狼淑女。",
    "personality": "温婉顺从，恪守礼仪教养；天真浪漫，对世界抱有美好幻想，极力回避粗鲁与冲突。",
    "reputation": "临冬城内外公认的完美淑女，受到茉丹修女与诸侯夫人们的一致赞赏。",
    "experiences": [
      {
        "date": "8286",
        "title": "降生临冬城",
        "description": "作为史塔克家族长女出生于临冬城，自幼接受严格的维斯特洛传统贵族礼仪教导。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Sansa_Stark",
        "participantIds": [
          "agot:Stark_3",
          "agot:Tully_4"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Tully_hh_4",
        "kind": "礼仪导师",
        "description": "茉丹修女负责珊莎的宫廷礼仪、针线女红与宗教教导，深得珊莎信赖。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Mordane"
      },
      {
        "targetId": "agot:Poole_3",
        "kind": "挚友手足",
        "description": "总管维扬·普尔之女，与珊莎形影不离，共同分享少女心事与骑士幻想。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jeyne_Poole"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Sansa_Stark",
      "https://asoiaf.fandom.com/zh/wiki/Sansa_Stark"
    ]
  },
  "agot:Stark_9": {
    "characterId": "agot:Stark_9",
    "summary": "艾德·史塔克公爵的次女。厌恶淑女规训与针线纺织，热衷于骑马、射箭与舞剑，常在临冬城回廊与残墙间攀爬探索。",
    "publicRoles": [
      "临冬城次女"
    ],
    "aliases": [
      "马面艾莉亚",
      "下水道的阿利"
    ],
    "appearance": "长着典型的史塔克长脸、灰眸与褐色乱发，身材瘦小灵活，常弄脏衣裳，身边伴有凶猛野性的冰原狼娜梅莉亚。",
    "personality": "叛逆倔强，直率无畏；极具正义感，绝不掩饰喜恶，渴望像骑士和战士一样掌握自己的命运。",
    "reputation": "临冬城内出了名的顽皮假小子，常令侍女和修女头疼不已。",
    "experiences": [
      {
        "date": "8289",
        "title": "降生临冬城",
        "description": "在葛雷乔伊叛乱结束之年诞生于临冬城，自幼展现出与众不同的野性与好奇心。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Arya_Stark",
        "participantIds": [
          "agot:Stark_3",
          "agot:Tully_4"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Arya_Stark",
      "https://asoiaf.fandom.com/zh/wiki/Arya_Stark"
    ]
  },
  "agot:Stark_10": {
    "characterId": "agot:Stark_10",
    "summary": "艾德·史塔克公爵的次子。热爱攀爬临冬城的古老高塔与残垣断壁，向往成为御林铁卫般的英勇骑士，深得临冬城上下喜爱。",
    "publicRoles": [
      "临冬城次子"
    ],
    "aliases": [
      "布兰",
      "攀爬者布兰"
    ],
    "appearance": "容貌清秀，留着赤褐色卷发，眼睛呈明亮深蓝，身体柔韧矫捷，身旁跟随着敏捷机警的冰原狼夏天。",
    "personality": "天真热忱，好奇心旺盛；充满对英雄骑士冒险的向往，行事勇敢但有时欠缺对危险的防备。",
    "reputation": "临冬城里身手最矫健的攀爬小能手，深受守军和仆役们的喜爱。",
    "experiences": [
      {
        "date": "8290",
        "title": "降生临冬城",
        "description": "以其英年早逝的伯父布兰登·史塔克之名命名，诞生于北境临冬城。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Bran_Stark",
        "participantIds": [
          "agot:Stark_3",
          "agot:Tully_4"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Stark_hh_2",
        "kind": "忠诚的仆从与陪伴者",
        "description": "身材魁梧的高大马夫，性情温厚纯真，常背负布兰穿行于城堡内外。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Hodor"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Bran_Stark",
      "https://asoiaf.fandom.com/zh/wiki/Bran_Stark"
    ]
  },
  "agot:Stark_11": {
    "characterId": "agot:Stark_11",
    "summary": "艾德·史塔克与凯特琳幼子。年仅三岁，性情活泼懵懂，紧紧跟随着哥哥姐姐与凶悍暴躁的黑色冰原狼毛毛狗在城堡奔跑。",
    "publicRoles": [
      "临冬城幼子"
    ],
    "aliases": [
      "瑞肯"
    ],
    "appearance": "圆脸蛋，浅棕色乱发与明亮蓝眼，年纪尚幼，步履蹒跚但充满精力。",
    "personality": "任性倔强，情绪强烈；尚未完全理解贵族规矩与世事变迁，极度依恋母亲与兄弟姐妹。",
    "reputation": "临冬城备受呵护的幼子，偶因冰原狼毛毛狗的凶性而令人敬畏。",
    "experiences": [
      {
        "date": "8295",
        "title": "降生临冬城",
        "description": "作为史塔克夫妇最小的孩子在临冬城降生。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Rickon_Stark",
        "participantIds": [
          "agot:Stark_3",
          "agot:Tully_4"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Rickon_Stark",
      "https://asoiaf.fandom.com/zh/wiki/Rickon_Stark"
    ]
  },
  "agot:Stark_4": {
    "characterId": "agot:Stark_4",
    "summary": "艾德·史塔克的幼弟，守夜人军团首席游骑兵。在篡夺者战争结束后自愿加入守夜人，常年率队深入塞外冰原巡逻，深受黑衣誓言兄弟爱戴。",
    "publicRoles": [
      "守夜人首席游骑兵",
      "史塔克家族成员"
    ],
    "aliases": [
      "班扬"
    ],
    "appearance": "身材高瘦干练，双眸呈尖锐警惕的蓝灰色，面庞如风霜雕琢的岩石般坚毅，常年身穿厚实黑羊毛与巡逻皮甲。",
    "personality": "沉着冷静，坚韧不拔；对绝境长城和鬼影森林了如指掌，对黑衣誓言怀有崇高奉献精神。",
    "reputation": "绝境长城内外最受尊敬的游骑兵领袖之一，野人与守夜人皆知其威名。",
    "experiences": [
      {
        "date": "8283",
        "title": "临冬城留守",
        "description": "在父兄南下参战期间担任临冬城的留守史塔克，战后选择穿上黑衣加入守夜人军团。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Benjen_Stark",
        "participantIds": [
          "agot:Stark_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Mormont_2",
        "kind": "军团总司令与长官",
        "description": "杰奥·莫尔蒙极为器重的首席游骑兵指挥官，负责军团前线最重要的侦察任务。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jeor_Mormont"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Benjen_Stark",
      "https://asoiaf.fandom.com/zh/wiki/Benjen_Stark"
    ]
  },
  "agot:Stark_hh_1": {
    "characterId": "agot:Stark_hh_1",
    "summary": "临冬城驻城学士与智囊顾问。精通医术、历史、天文、草药学与城堡运转，颈间戴着多环项链，包括极其罕见的高等瓦雷利亚钢金属环。",
    "publicRoles": [
      "学士",
      "临冬城学士顾问"
    ],
    "aliases": [
      "鲁温师傅"
    ],
    "appearance": "矮小瘦削的秃顶老人，白发稀疏，灰袍袖口极其宽大，常在袖中藏有各种药水、书籍、卷轴与小玩具。",
    "personality": "温和睿智，耐心仁慈；思维理性务实，对所谓魔法持怀疑态度，全心辅佐史塔克家族事务。",
    "reputation": "学识渊博且深受史塔克全家信赖的长者，北境公认的良医与贤者。",
    "experiences": [
      {
        "date": "8283",
        "title": "接生史塔克子嗣",
        "description": "自罗柏起为临冬城接生了所有史塔克家子女，并悉心教授他们算术、历史与礼仪。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Luwin",
        "participantIds": [
          "agot:Stark_3",
          "agot:Tully_4"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Stark_3",
        "kind": "顾问与挚友",
        "description": "艾德·史塔克在政务与机要密信处理上最倚重的智囊助手。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Luwin",
      "https://asoiaf.fandom.com/zh/wiki/Luwin"
    ]
  },
  "agot:Cassel_3": {
    "characterId": "agot:Cassel_3",
    "summary": "临冬城教头兼侍卫长。忠心耿耿侍奉史塔克家族数十年，负责训练城堡驻军与少主们的剑术武艺，经验丰富老道。",
    "publicRoles": [
      "临冬城教头",
      "骑士"
    ],
    "aliases": [
      "罗德利克爵士"
    ],
    "appearance": "粗壮敦实的老战士，蓄着一对标志性的大白连鬓胡须，说话时胡须随之抖动，常着皮铠佩精钢长剑。",
    "personality": "忠诚严正，脾气耿直；对待军事操练极其严苛，但对少主们怀有深切的关怀与长辈之爱。",
    "reputation": "北境享有崇高声誉的老牌教头，以无可挑剔的忠诚与练兵之能著称。",
    "experiences": [
      {
        "date": "8289",
        "title": "葛雷乔伊叛乱参战",
        "description": "跟随奈德公爵攻入派克岛，在此战中英勇杀敌，失去了两名兄长但立下赫赫战功。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Rodrik_Cassel",
        "participantIds": [
          "agot:Stark_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Cassel_4",
        "kind": "亲侄与下属",
        "description": "乔里是其已故兄长马丁之子，由罗德利克悉心带大并推举为侍卫队长。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jory_Cassel"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Rodrik_Cassel",
      "https://asoiaf.fandom.com/zh/wiki/Rodrik_Cassel"
    ]
  },
  "agot:Cassel_4": {
    "characterId": "agot:Cassel_4",
    "summary": "临冬城侍卫队长，马丁·凯索之子。年轻精干，剑术高强出众，负责艾德·史塔克公爵贴身安全与城堡各处防务。",
    "publicRoles": [
      "侍卫队长"
    ],
    "aliases": [
      "乔里"
    ],
    "appearance": "身材高大挺拔，褐色头发与机敏的灰眼睛，身着饰有史塔克冰原狼徽章的优质皮甲与锁甲。",
    "personality": "沉着警觉，忠勇果敢；行事雷厉风行，与临冬城上下相处融洽，是艾德最贴身的卫队长。",
    "reputation": "艾德公爵最得力的贴身护卫，备受北境卫士们的信赖与尊重。",
    "experiences": [
      {
        "date": "8289",
        "title": "晋升侍卫队长",
        "description": "在葛雷乔伊叛乱后凭过人武艺与忠诚被奈德公爵任命为临冬城侍卫队长。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jory_Cassel",
        "participantIds": [
          "agot:Stark_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Stark_3",
        "kind": "誓死护卫的主公",
        "description": "甘愿为艾德公爵与史塔克家族赴汤蹈火的忠勇近卫队长。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Jory_Cassel",
      "https://asoiaf.fandom.com/zh/wiki/Jory_Cassel"
    ]
  },
  "agot:Stark_hh_2": {
    "characterId": "agot:Stark_hh_2",
    "summary": "临冬城马厩杂工，老奶妈的曾孙。原名瓦德，身形极其魁梧，智力停留在幼童阶段，口中只能反复念叨‘阿多’一词。",
    "publicRoles": [
      "马厩杂工"
    ],
    "aliases": [
      "阿多"
    ],
    "appearance": "身高超过七英尺的巨人般青年，膀大腰圆，目光温和甚至略带怯意，常着简陋粗布麻衣。",
    "personality": "温顺怯弱，毫无攻击性；容易受惊，对史塔克家族的孩子们极其顺从友善。",
    "reputation": "临冬城人尽皆知的敦厚大个子，以老实听话、力大无穷闻名。",
    "notableRelations": [
      {
        "targetId": "agot:Stark_10",
        "kind": "背负与侍奉的少主",
        "description": "经常听从命令背负布兰在城堡内外活动。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Bran_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Hodor",
      "https://asoiaf.fandom.com/zh/wiki/Hodor"
    ]
  },
  "agot:Bolton_1": {
    "characterId": "agot:Bolton_1",
    "summary": "恐怖堡领主，北境最具势力的古老诸侯之一。精于算计、冷酷阴沉，深谙自保与扩张之道，虽臣服于史塔克家族但暗怀异心。",
    "publicRoles": [
      "恐怖堡伯爵",
      "北境诸侯"
    ],
    "aliases": [
      "水蛭大人"
    ],
    "appearance": "相貌平平但极具压迫感，皮肤苍白如死人，双眼呈奇异冰冷的淡白幽光，常年定期用水蛭吸血以保持平静。",
    "personality": "说话声音轻柔微弱，行事冷酷严密；绝不表露真实情感，深信‘剥皮人没有秘密’与‘安静的人活得长久’。",
    "reputation": "北境诸侯中令人忌惮畏惧的阴鸷角色，以严酷手段与难以捉摸的心思闻名。",
    "experiences": [
      {
        "date": "8283",
        "title": "三叉戟河之役参战",
        "description": "随艾德·史塔克南下作战，在战役结束后曾冷酷建议处决负伤被俘的巴利斯坦·赛尔弥。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Roose_Bolton",
        "participantIds": [
          "agot:Stark_3",
          "agot:Selmy_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Stark_3",
        "kind": "封君与提防对象",
        "description": "表面恭顺服从临冬城号令，但内心对艾德的道德洁癖与统治心存轻慢。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Roose_Bolton",
      "https://asoiaf.fandom.com/zh/wiki/Roose_Bolton"
    ]
  },
  "agot:Bolton_5": {
    "characterId": "agot:Bolton_5",
    "summary": "恐怖堡卢斯·波顿公爵的私生子。自幼在磨坊长大，后被接至恐怖堡效力，行事残虐狡诈疯狂，嗜好剥皮与猎杀活人。",
    "publicRoles": [
      "恐怖堡私生子"
    ],
    "aliases": [
      "恐怖堡的私生子"
    ],
    "appearance": "体格粗壮硕大，皮肤白而多粉刺，嘴唇厚实肥润，长着与卢斯如出一辙的阴冷幽白眼睛，头发黑长油腻。",
    "personality": "残忍嗜血，狡黠乖戾；以折磨他人为乐，对私生子身份极度敏感自卑，充满暴虐的统治欲望。",
    "reputation": "恐怖堡周围百姓噤若寒蝉的恶魔，以冷血残暴闻名北境乡野。",
    "experiences": [
      {
        "date": "8282",
        "title": "降生哭泣河磨坊",
        "description": "卢斯·波顿强暴磨坊主之妻后所生，后被卢斯暗中接济并招入恐怖堡。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Ramsay_Snow",
        "participantIds": [
          "agot:Bolton_1"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Ramsay_Snow",
      "https://asoiaf.fandom.com/zh/wiki/Ramsay_Snow"
    ]
  },
  "agot:Karstark_4": {
    "characterId": "agot:Karstark_4",
    "summary": "卡霍城伯爵，史塔克家族的远支亲族。性格刚烈剽悍忠勇，在北境拥有极高威望，率领卡霍城铁骑坚定效忠临冬城。",
    "publicRoles": [
      "卡霍城伯爵",
      "北境诸侯"
    ],
    "aliases": [
      "卡史塔克大人"
    ],
    "appearance": "身材高大威猛如北方巨熊，浓密的灰白胡须垂胸，目光如铁，披裹着厚重沉重的黑色毛皮大氅与锁甲。",
    "personality": "勇猛倔强，直来直去；极度重视家族血仇与荣誉，一旦受到背叛或伤害便誓死追讨到底。",
    "reputation": "以勇武善战和固执刚强著称的北境老将，卡霍城军队的绝对领袖。",
    "experiences": [
      {
        "date": "8283",
        "title": "起兵响应篡夺者战争",
        "description": "率领卡史塔克全族精锐南下追随艾德·史塔克征战，立下赫赫威名。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Rickard_Karstark",
        "participantIds": [
          "agot:Stark_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Stark_3",
        "kind": "同族宗主与封君",
        "description": "虽然自豪于卡史塔克的先民独立血脉，但在大义上始终拥护临冬城奔狼号令。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Rickard_Karstark",
      "https://asoiaf.fandom.com/zh/wiki/Rickard_Karstark"
    ]
  },
  "agot:Umber_8": {
    "characterId": "agot:Umber_8",
    "summary": "最后壁炉堡领主，安柏家族族长。身形巨大无比，嗓门如雷，勇猛好斗且性格暴烈，是北境最靠近绝境长城的雄关统帅。",
    "publicRoles": [
      "最后壁炉堡伯爵",
      "北境诸侯"
    ],
    "aliases": [
      "大琼恩"
    ],
    "appearance": "身高近七英尺，魁梧如巨灵，黑发虬结，挥舞一柄寻常人无法提起的双刃双手重剑，身穿厚重钢甲。",
    "personality": "豪迈粗犷，脾气火爆；崇尚绝对的武力与忠诚，一旦认可领袖便会奉献无可置疑的生死赤胆。",
    "reputation": "北境公认的第一猛将与悍勇封臣，在任何宴席与战场上都是声势最骇人的存在。",
    "experiences": [
      {
        "date": "8283",
        "title": "鸣钟之役浴血参战",
        "description": "随军南下参与三叉戟河诸役，在千军万马中以巨剑斩杀无数王军骑士。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jon_Umber",
        "participantIds": [
          "agot:Stark_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Stark_3",
        "kind": "敬重的北境守护",
        "description": "对奈德公爵的威严与公正深感信服，甘愿为其冲锋陷阵。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Jon_Umber",
      "https://asoiaf.fandom.com/zh/wiki/Jon_Umber"
    ]
  },
  "agot:Manderly_6": {
    "characterId": "agot:Manderly_6",
    "summary": "白港伯爵兼新堡领主，北境唯一的城市领主。掌控白刃河入海口与庞大舰队，财富雄厚，信奉七神，对外装作体态臃肿的享乐贵族。",
    "publicRoles": [
      "白港伯爵",
      "白刃河守卫"
    ],
    "aliases": [
      "白港鳗鱼大人",
      "臃肿伯爵"
    ],
    "appearance": "体积极其庞大，肥硕得无法骑马，需乘坐特制马车，双下巴重叠，但笑意盈盈的双眼中藏着敏锐深邃的光芒。",
    "personality": "圆滑隐忍，城府极深；擅长以荒唐可笑的外表迷惑敌人，内心深处对史塔克家族怀有数百年的忠诚与誓言。",
    "reputation": "常被南方贵族嘲笑为贪吃嗜睡的北境肥猪，实则是极具战略眼光与财力的智谋诸侯。",
    "experiences": [
      {
        "date": "8283",
        "title": "筑港扩军效忠北境",
        "description": "在篡夺者战争中为联军提供港口转运与精锐战船，稳固了北境与三叉戟河的海上补给线。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Wyman_Manderly",
        "participantIds": [
          "agot:Stark_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Stark_3",
        "kind": "效忠的宗主领主",
        "description": "曼德勒家族自古受史塔克庇护迁居白港，世世代代誓死捍卫北境古神之狼。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Wyman_Manderly",
      "https://asoiaf.fandom.com/zh/wiki/Wyman_Manderly"
    ]
  },
  "agot:Mormont_4": {
    "characterId": "agot:Mormont_4",
    "summary": "熊岛女伯爵与莫尔蒙家族族长，在侄子乔拉流亡后接掌熊岛。她作风强硬务实，熟悉这座贫瘠海岛长期面对的铁民袭扰与防务压力。",
    "publicRoles": [
      "熊岛伯爵夫人",
      "北境女诸侯"
    ],
    "aliases": [
      "梅姬夫人"
    ],
    "appearance": "身形敦实强健，带有久居北境海岛的粗砺气质；衣着以便于骑乘和处理领地事务的厚实毛料、皮革为主。",
    "personality": "直率顽强，不拘泥南方贵族礼法；重视家族、领民与熊岛的独立传统，面对威胁时态度坚决。",
    "reputation": "以强硬、能干和不畏艰苦著称，是北境少数公开执掌领地与军务的女性领主之一。",
    "experiences": [
      {
        "date": "8293",
        "title": "接管熊岛统治",
        "description": "在乔拉·莫尔蒙因贩奴畏罪潜逃后，毅然收拾家族乱局，恢复熊岛的安定与秩序。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Maege_Mormont",
        "participantIds": [
          "agot:Mormont_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Stark_3",
        "kind": "尊敬的守护领主",
        "description": "感谢艾德公爵对熊岛的庇护，同时坚决支持临冬城对贩奴罪犯的严正法令。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Maege_Mormont",
      "https://asoiaf.fandom.com/zh/wiki/Maege_Mormont"
    ]
  },
  "agot:Reed_1": {
    "characterId": "agot:Reed_1",
    "summary": "灰水望领主与颈泽泽地人首领，长期居于难以定位的沼泽城堡。熟悉颈泽水道、草木与伏击战法，也是极乐塔之战少数生还者之一。",
    "publicRoles": [
      "灰水望伯爵",
      "泽地人领主"
    ],
    "aliases": [
      "泽地人霍兰"
    ],
    "appearance": "身材矮小削瘦，目光敏锐灵动，身穿编织水草皮毛与泥沼鳞甲的独特沼泽装束，常持三叉戟与捕网。",
    "personality": "寡言谨慎，重视旧神传统与待客之道；更擅长利用湿地、隐蔽和耐心取胜，而非正面展示武力。",
    "reputation": "南方人很少见到的泽地领主，在北境以忠于史塔克家族、熟悉颈泽地形和行事隐秘闻名。",
    "experiences": [
      {
        "date": "8281",
        "title": "前往神眼湖千面屿",
        "description": "年轻时泛舟前往神秘的千面屿向绿先知求知，后前往赫伦堡参加比武大会结识史塔克家族众兄妹。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Howland_Reed",
        "participantIds": [
          "agot:Stark_3"
        ]
      },
      {
        "date": "8283",
        "title": "极乐塔之战幸存",
        "description": "随艾德·史塔克在极乐塔与亚瑟·戴恩等三位御林铁卫死战，在千钧一发之际救下奈德性命。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Howland_Reed",
        "participantIds": [
          "agot:Stark_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Stark_3",
        "kind": "生死挚友",
        "description": "两人曾共同经历赫伦堡比武会与极乐塔之战，战后仍维持少见而牢固的信任。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Howland_Reed",
      "https://asoiaf.fandom.com/zh/wiki/Howland_Reed"
    ]
  },
  "agot:Glover_4": {
    "characterId": "agot:Glover_4",
    "summary": "深林堡领主，葛洛佛家族族长。忠诚骁勇的北境老派诸侯，长年镇守北境西海岸要隘，抵御铁民劫掠与狼林盗匪。",
    "publicRoles": [
      "深林堡主",
      "北境诸侯"
    ],
    "aliases": [
      "葛洛佛大人"
    ],
    "appearance": "面容冷峻刚毅，披着深色皮毛大氅，锁子甲胸前饰有葛洛佛家族的铁护手徽记，身材精悍矫健。",
    "personality": "忠诚坦荡，性格耿直；在北境军务与诸侯议事中以公正无私与勇于担当著称。",
    "reputation": "深受北境诸侯信赖的资深指挥官与坚守誓言的重臣。",
    "experiences": [
      {
        "date": "8289",
        "title": "防御铁民袭扰",
        "description": "在葛雷乔伊叛乱中坚守深林堡海岸线，成功击退铁民舰队的试探性偷袭。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Galbart_Glover",
        "participantIds": [
          "agot:Stark_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Stark_3",
        "kind": "效忠的封君",
        "description": "坚定追随艾德·史塔克治理北境，是史塔克家族核心军事支柱之一。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Galbart_Glover",
      "https://asoiaf.fandom.com/zh/wiki/Galbart_Glover"
    ]
  },
  "agot:Baratheon_2": {
    "characterId": "agot:Baratheon_2",
    "summary": "七大王国统治者兼铁王座之主，在篡夺者战争中推翻坦格利安王朝。年轻时勇猛无敌，登基后沉溺于酒色与比武游猎，王国财政日渐窘迫。",
    "publicRoles": [
      "安达尔人与先民的国王",
      "全境守护者"
    ],
    "aliases": [
      "野猪王",
      "篡夺者"
    ],
    "appearance": "身材极为高大魁梧，体态日渐肥胖，浓密的黑须遮住下颌与胸口，双目明亮带笑，嗓门洪亮如雷。",
    "personality": "豪爽慷慨，嗜酒如命；热爱打仗比武胜过治国理政，脾气暴躁但易于妥协，深切怀念早逝的挚爱莱安娜·史塔克。",
    "reputation": "全境闻名的传奇战士与铁锤猛将，但在治国与内政上被普遍认为怠惰挥霍。",
    "experiences": [
      {
        "date": "8283",
        "title": "三叉戟河决战",
        "description": "在红宝石滩挥舞双手战锤亲手击杀雷加·坦格利安王子，彻底奠定篡夺者战争的胜利。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Robert_I_Baratheon",
        "participantIds": [
          "agot:Stark_3",
          "agot:Arryn_3"
        ]
      },
      {
        "date": "8289",
        "title": "亲征派克城",
        "description": "御驾亲征铁群岛平定葛雷乔伊叛乱，迫使巴隆·葛雷乔伊屈膝臣服。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Greyjoy%27s_Rebellion",
        "participantIds": [
          "agot:Stark_3",
          "agot:Lannister_1",
          "agot:Greyjoy_5"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Stark_3",
        "kind": "情同手足的生死兄弟",
        "description": "视奈德为一生中最信任的朋友，在前首相艾林去世后亲自北上邀请其担任国王之手。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark"
      },
      {
        "targetId": "agot:Arryn_3",
        "kind": "如父导师与首任首相",
        "description": "琼恩·艾林如同其养父，在位十五年来一直代劳勃处理繁杂的国家政务。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jon_Arryn"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Robert_I_Baratheon",
      "https://asoiaf.fandom.com/zh/wiki/Robert_Baratheon"
    ]
  },
  "agot:Lannister_6": {
    "characterId": "agot:Lannister_6",
    "summary": "七大王国王后，泰温·兰尼斯特公爵的独女。以出众容貌、强烈自尊和对家族地位的维护闻名，在红堡宫廷拥有仅次于国王的公开影响力。",
    "publicRoles": [
      "七国王后",
      "兰尼斯特家族贵女"
    ],
    "aliases": [
      "瑟曦王后",
      "西境之光"
    ],
    "appearance": "金发如瀑，碧绿如翡翠的眼眸光彩照人，体态优雅高贵，常着华丽红金丝袍与缀满珠宝的礼服。",
    "personality": "骄傲自负，多疑善妒；极度护短三个子女，对任何潜在的权力威胁充满敌意与反击冲动。",
    "reputation": "君临红堡最有权势与美貌的女人，但在贵族与重臣眼中以傲慢跋扈、难以相处著称。",
    "experiences": [
      {
        "date": "8284",
        "title": "大婚君临贝勒大圣堂",
        "description": "在篡夺者战争结束后嫁给劳勃·拜拉席恩国王，成为七大王国王后以巩固西境与铁王座的同盟。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Cersei_Lannister",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Lannister_1"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Cersei_Lannister",
      "https://asoiaf.fandom.com/zh/wiki/Cersei_Lannister"
    ]
  },
  "agot:Baratheon_5": {
    "characterId": "agot:Baratheon_5",
    "summary": "铁王座王储兼劳勃国王的长子。自幼受母亲过度娇惯纵容，性格傲慢残忍且喜怒无常，对平民与弱小充满鄙夷与虐待倾向。",
    "publicRoles": [
      "铁王座王储",
      "多恩领亲王"
    ],
    "aliases": [
      "乔佛里王子"
    ],
    "appearance": "相貌英俊，留着兰尼斯特式的金色卷发，碧绿眼眸与厚翘的嘴唇，常着裁剪精致的金丝天鹅绒华服。",
    "personality": "任性暴戾，自大怯懦；极度热衷炫耀王家权威，缺乏共点心，在逆境时容易歇斯底里。",
    "reputation": "君临廷臣与侍从私下畏惧的残暴王子，在外人面前则维持着虚伪的礼貌与贵族派头。",
    "experiences": [
      {
        "date": "8286",
        "title": "诞生于红堡",
        "description": "作为王室长子在君临降生，举国欢庆其诞生并册封其为王位法定继承人。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Joffrey_Baratheon",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Lannister_6"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Clegane_4",
        "kind": "贴身侍卫与恶犬",
        "description": "猎狗桑铎·克里冈被指定为其贴身护卫，负责执行乔佛里各种任性残忍的命令。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Sandor_Clegane"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Joffrey_Baratheon",
      "https://asoiaf.fandom.com/zh/wiki/Joffrey_Baratheon"
    ]
  },
  "agot:Baratheon_6": {
    "characterId": "agot:Baratheon_6",
    "summary": "劳勃国王与瑟曦王后的独女。性情温顺甜美，聪慧知书懂礼，拥有兰尼斯特式的金色秀发，深受王室长辈与侍女宠爱。",
    "publicRoles": [
      "王室公主"
    ],
    "aliases": [
      "弥赛菈公主"
    ],
    "appearance": "长相甜美秀丽，留着柔顺的金色卷发，绿眼睛清澈明亮，举止优雅文静。",
    "personality": "善良温和，知书达礼；对待身边所有人皆充满善意，没有母亲与长兄的傲慢暴戾。",
    "reputation": "君临红堡人见人爱的高贵小公主，以纯真与礼貌受到宫廷赞誉。",
    "experiences": [
      {
        "date": "8290",
        "title": "降生君临红堡",
        "description": "在君临红堡诞生，成为拜拉席恩王室唯一的公主。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Myrcella_Baratheon",
        "participantIds": [
          "agot:Lannister_6",
          "agot:Baratheon_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Lannister_8",
        "kind": "亲善的舅舅",
        "description": "与舅舅提利昂关系融洽，提利昂也非常喜爱这位懂事善良的外甥女。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Tyrion_Lannister"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Myrcella_Baratheon",
      "https://asoiaf.fandom.com/zh/wiki/Myrcella_Baratheon"
    ]
  },
  "agot:Baratheon_7": {
    "characterId": "agot:Baratheon_7",
    "summary": "劳勃国王与瑟曦王后的幼子。生性温厚善良胆小，喜爱小动物与小猫，在强势专横的长兄乔佛里阴影下受庇护长大。",
    "publicRoles": [
      "王室小王子"
    ],
    "aliases": [
      "托曼王子"
    ],
    "appearance": "圆脸蛋，微胖稚嫩，金发柔软蓬松，碧绿大眼透着孩子特有的天真与胆怯。",
    "personality": "温顺善良，易受摆布；讨厌暴力与流血冲突，极易顺从长辈与兄长的安排。",
    "reputation": "宫廷中天真无邪的幼子，待人随和友好，没有王室骄纵之气。",
    "experiences": [
      {
        "date": "8291",
        "title": "降生君临红堡",
        "description": "在君临红堡诞生，为拜拉席恩与兰尼斯特王室增添幼子。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Tommen_Baratheon",
        "participantIds": [
          "agot:Lannister_6",
          "agot:Baratheon_2"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Tommen_Baratheon",
      "https://asoiaf.fandom.com/zh/wiki/Tommen_Baratheon"
    ]
  },
  "agot:Baratheon_3": {
    "characterId": "agot:Baratheon_3",
    "summary": "龙石岛领主兼御前海政大臣，劳勃国王的大弟。性格坚韧如铁、不苟言笑，恪守法律与规矩，因未获封风息堡而常年对兄长心怀怨怼。",
    "publicRoles": [
      "龙石岛领主",
      "海政大臣"
    ],
    "aliases": [
      "龙石岛公爵"
    ],
    "appearance": "身材高瘦挺拔，面容如雕刻般严酷削瘦，深蓝眼眸冰冷刺骨，头发稀疏后退，下颚常紧紧咬合咬牙切齿。",
    "personality": "死板严苛，绝不通融；没有幽默感与社交温情，但具有无与伦比的坚韧意志与战术才能。",
    "reputation": "全境公认最冷酷执拗的将领，治军极严，公正到不近人情，深受敬畏但鲜有人喜爱。",
    "experiences": [
      {
        "date": "8283",
        "title": "风息堡围城死守",
        "description": "在篡夺者战争中率少数守军坚守风息堡近一年，弹尽粮绝之际靠戴佛斯走私洋葱救活全城守军。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Stannis_Baratheon",
        "participantIds": [
          "agot:Seaworth_1",
          "agot:Tyrell_8"
        ]
      },
      {
        "date": "8289",
        "title": "仙民岛海战大捷",
        "description": "在葛雷乔伊叛乱中指挥王家舰队在仙民岛海域彻底击溃维克塔利昂的铁舰队，奠定平叛大局。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Stannis_Baratheon",
        "participantIds": [
          "agot:Greyjoy_7",
          "agot:Baratheon_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Seaworth_1",
        "kind": "唯一挚信的封臣",
        "description": "封戴佛斯为洋葱骑士同时切除其指节以示公正，但视其为唯一敢于直言进谏的心腹助手。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Davos_Seaworth"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Stannis_Baratheon",
      "https://asoiaf.fandom.com/zh/wiki/Stannis_Baratheon"
    ]
  },
  "agot:Florent_10": {
    "characterId": "agot:Florent_10",
    "summary": "龙石岛公爵夫人，亮水城亚勒斯特·佛罗伦伯爵的侄女。与史坦尼斯夫妻关系冷淡疏离，近期深受拉赫洛红袍僧梅丽珊卓的宗教影响。",
    "publicRoles": [
      "龙石岛公爵夫人",
      "河湾地贵女"
    ],
    "aliases": [
      "赛丽丝夫人"
    ],
    "appearance": "身材高瘦干瘪，面容缺乏美感，长着佛罗伦家族标志性的大耳朵与淡淡的唇须，神色焦虑刻板。",
    "personality": "狂热执拗，心胸狭隘；在夫妻与家庭生活中深感挫败，转而将全部精神寄托于光之王信仰。",
    "reputation": "龙石岛封臣眼中神经质且严苛排外的公爵夫人，难于接近。",
    "experiences": [
      {
        "date": "8286",
        "title": "与史坦尼斯完婚",
        "description": "依政治联姻安排嫁入龙石岛，但婚后多年仅育有一女希琳·拜拉席恩。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Selyse_Florent",
        "participantIds": [
          "agot:Baratheon_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Melisandre_1",
        "kind": "崇拜的宗教导师",
        "description": "对梅丽珊卓的光之王神迹深信不疑，成为红神在龙石岛最坚定的拥护者。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Melisandre"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Selyse_Florent",
      "https://asoiaf.fandom.com/zh/wiki/Selyse_Florent"
    ]
  },
  "agot:Baratheon_13": {
    "characterId": "agot:Baratheon_13",
    "summary": "史坦尼斯·拜拉席恩公爵的独女兼继承人。幼年患上致命的灰鳞病并奇迹般幸存，半边面孔留下灰石般的鳞状斑痕，性格安静善良。",
    "publicRoles": [
      "龙石岛继承人"
    ],
    "aliases": [
      "希琳小贵女"
    ],
    "appearance": "身材瘦小单薄，蓝眼睛与黑卷发，左脸与脖颈布满如石化开裂的灰斑，平时喜爱读书与听小丑讲故事。",
    "personality": "乖巧恬静，懂事敏感；对世间丑恶毫无戒心，十分渴望得到父母的关注与关爱。",
    "reputation": "龙石岛上下怜悯同情的小贵女，以纯洁善良和灰鳞病瘢痕闻名。",
    "experiences": [
      {
        "date": "8289",
        "title": "灰鳞病痊愈",
        "description": "婴儿时期罹患灰鳞病，在学士们的拼死医治下成功遏制扩散，但半边面容终生石化。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Shireen_Baratheon",
        "participantIds": [
          "agot:Baratheon_3",
          "agot:Florent_10"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Seaworth_1",
        "kind": "亲近的长辈导师",
        "description": "与戴佛斯情同父女，经常陪伴戴佛斯并教导其认字读书。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Davos_Seaworth"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Shireen_Baratheon",
      "https://asoiaf.fandom.com/zh/wiki/Shireen_Baratheon"
    ]
  },
  "agot:Baratheon_4": {
    "characterId": "agot:Baratheon_4",
    "summary": "风息堡公爵兼御前法务大臣，劳勃国王的幼弟。英俊潇洒、魅力非凡，酷似年轻时的劳勃，深受君临朝野与风暴地诸侯的狂热拥戴。",
    "publicRoles": [
      "风息堡公爵",
      "法务大臣"
    ],
    "aliases": [
      "风息堡领主"
    ],
    "appearance": "相貌极其俊美，身材高大挺拔，乌黑卷发垂落肩头，深绿眼眸明亮迷人，酷爱穿戴翡翠色的奢华天鹅绒铠甲。",
    "personality": "风趣迷人，擅长交际；极具政治号召力与野心，行事讲究仪态风度，深受骑士阶层青睐。",
    "reputation": "王廷中最具人气的英俊年轻贵族，风暴地与河湾地封臣的心仪领袖。",
    "experiences": [
      {
        "date": "8284",
        "title": "受封风息堡",
        "description": "在劳勃登基后被跨过二哥史坦尼斯破格封为拜拉席恩家族祖地风息堡公爵。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Renly_Baratheon",
        "participantIds": [
          "agot:Baratheon_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Tyrell_13",
        "kind": "密友与侍从骑士",
        "description": "与洛拉斯·提利尔形影不离，两人保持着极其亲密深厚的同盟与私交。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Loras_Tyrell"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Renly_Baratheon",
      "https://asoiaf.fandom.com/zh/wiki/Renly_Baratheon"
    ]
  },
  "agot:Seaworth_1": {
    "characterId": "agot:Seaworth_1",
    "summary": "跳蚤窝出身的前走私贩，现为雨林岬领主兼史坦尼斯·拜拉席恩最忠诚的心腹封臣。以诚实、正直和直言进谏著称。",
    "publicRoles": [
      "雨林岬领主",
      "骑士",
      "走私船长"
    ],
    "aliases": [
      "洋葱骑士",
      "短指头戴佛斯"
    ],
    "appearance": "相貌朴实无华，褐发黑眼，胡须微白，左手四根手指被切去第一指节，颈间挂着装有指骨的小皮袋以求好运。",
    "personality": "谦卑务实，刚直不阿；极度忠诚于史坦尼斯，行事从不谋求私利，敢于冒死说出逆耳忠言。",
    "reputation": "维斯特洛贵族中备受嘲讽但私下敬重的平民骑士，以铁骨铮铮与忠诚扬名。",
    "experiences": [
      {
        "date": "8283",
        "title": "风息堡走私救城",
        "description": "驾驶走私小船穿过红斑蜘蛛雷加的封锁网，将一船洋葱和咸鱼送入围城中的风息堡拯救史坦尼斯。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Davos_Seaworth",
        "participantIds": [
          "agot:Baratheon_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Baratheon_3",
        "kind": "效忠的君主与主公",
        "description": "将史坦尼斯视作赋予自己新生与荣耀的明主，誓死为其效力。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Stannis_Baratheon"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Davos_Seaworth",
      "https://asoiaf.fandom.com/zh/wiki/Davos_Seaworth"
    ]
  },
  "agot:Melisandre_1": {
    "characterId": "agot:Melisandre_1",
    "summary": "来自亚夏的红袍女祭司，拉赫洛光之王忠实信徒。跨越狭海来到龙石岛，深信史坦尼斯·拜拉席恩就是预言中重生的救世英雄亚梭尔·亚亥。",
    "publicRoles": [
      "光之王女祭司",
      "阴影缚术士"
    ],
    "aliases": [
      "红袍女",
      "亚夏的梅丽珊卓"
    ],
    "appearance": "容貌妖娆绝伦，身材丰满修长，拥有铜红色的长发与赤红如火的眼眸，长年身着深红丝袍，颈间戴着镶嵌发光红宝石的纯金项圈。",
    "personality": "自信冷酷，狂热虔诚；行事神秘而目标明确，深信黑暗即将吞噬世界，必须依靠火魔法与铁血手段力挽狂澜。",
    "reputation": "龙石岛上下敬畏猜忌的异域巫女，以展现火焰预言与神秘莫测的法力闻名。",
    "experiences": [
      {
        "date": "8297",
        "title": "抵达龙石岛传教",
        "description": "从厄索斯狭海对岸来到龙石岛，凭借预言与幻象成功让赛丽丝夫人及部分守军皈依拉赫洛信仰。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Melisandre",
        "participantIds": [
          "agot:Florent_10",
          "agot:Baratheon_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Baratheon_3",
        "kind": "预言中的救世王者",
        "description": "坚信史坦尼斯是带领生者战胜远古严寒的唯一真王，全力辅佐其夺取大权。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Stannis_Baratheon"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Melisandre",
      "https://asoiaf.fandom.com/zh/wiki/Melisandre"
    ]
  },
  "agot:Dondarrion_2": {
    "characterId": "agot:Dondarrion_2",
    "summary": "黑港伯爵，风暴地年轻俊朗的名门骑士。枪术出众、荣誉感极强，在君临比武大会中备受瞩目，与艾利斯塔·罗宛小姐订有婚约。",
    "publicRoles": [
      "黑港伯爵",
      "骑士"
    ],
    "aliases": [
      "闪电伯爵"
    ],
    "appearance": "金红发色，相貌英俊俊朗，身材挺拔，身披绣有唐德利恩家族分叉闪电徽章的深黑披风与闪亮板甲。",
    "personality": "英勇正直，恪守骑士道；热衷比武与冒险，对弱小充满骑士护佑之情。",
    "reputation": "风暴地久负盛名的年轻贵族模范，在王廷贵族中享有极高声誉。",
    "notableRelations": [
      {
        "targetId": "agot:Brotherhood_8",
        "kind": "挚友与比武同僚",
        "description": "与密尔的红袍僧索罗斯在君临宴饮结识，两人性情相投结为莫逆之交。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Thoros_of_Myr"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Beric_Dondarrion",
      "https://asoiaf.fandom.com/zh/wiki/Beric_Dondarrion"
    ]
  },
  "agot:Tarth_6": {
    "characterId": "agot:Tarth_6",
    "summary": "暮星城塞尔温·塔斯伯爵独女兼继承人。体格异常高大强壮，武艺精湛，热切向往骑士精神与荣誉，常因相貌粗陋而受尽贵族冷嘲热讽。",
    "publicRoles": [
      "塔斯岛继承人",
      "女战士"
    ],
    "aliases": [
      "美人布蕾妮",
      "塔斯的布蕾妮"
    ],
    "appearance": "身材高逾六尺，膀大腰圆，胸部扁平，面庞扁阔布满雀斑，牙齿歪斜，但拥有一双极其清澈诚挚的大蓝眼睛。",
    "personality": "纯朴刚毅，重诺守信；内心极度敏感脆弱但绝不在外表屈服，誓死追求最纯粹的骑士美德。",
    "reputation": "贵族阶层口中被戏谑为‘美人’的异类丑女，战场上令普通骑士胆寒的强悍勇士。",
    "experiences": [
      {
        "date": "8293",
        "title": "受训剑术武艺",
        "description": "拒绝包办婚姻与淑女规训，在父亲默许下跟随老教头格温·古德兄弟刻苦磨练剑盾与马术。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Brienne_of_Tarth",
        "participantIds": [
          "agot:Tarth_1"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Baratheon_4",
        "kind": "暗恋与效忠的领主",
        "description": "在蓝礼巡视塔斯岛时受到其唯一不带嘲弄的温柔对待，从此将蓝礼奉为心中神明与唯一效忠对象。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Renly_Baratheon"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Brienne_of_Tarth",
      "https://asoiaf.fandom.com/zh/wiki/Brienne_of_Tarth"
    ]
  },
  "agot:Lannister_1": {
    "characterId": "agot:Lannister_1",
    "summary": "凯岩城公爵、西境守护兼赫伦堡前首相。以铁腕统治西境数十年，曾一手扑灭雷耶斯与塔贝克叛乱，是全维斯特洛最富庶且令人生畏的政治巨擘。",
    "publicRoles": [
      "凯岩城公爵",
      "西境守护",
      "西境统帅"
    ],
    "aliases": [
      "凯岩城雄狮",
      "老狮子"
    ],
    "appearance": "身材高大削瘦挺拔，剃光头发以掩饰秃顶，两鬓留着修剪整齐的金须，双眼呈透着金斑的冷酷淡绿。",
    "personality": "冷酷严厉，极度自尊与务实；视家族荣耀与威严为最高使命，绝不宽恕敌人的软弱与挑衅，从不大笑。",
    "reputation": "全七国公认最具统治手腕与财力的霸主，‘兰尼斯特有债必偿’的实际缔造者。",
    "experiences": [
      {
        "date": "8261",
        "title": "剿灭雷恩与塔贝克",
        "description": "以雷霆手段水淹卡斯特梅、夷平塔贝克厅彻底诛灭叛乱家族，写就《卡斯特梅的雨季》震慑西境。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Tywin_Lannister",
        "participantIds": [
          "agot:Lannister_2"
        ]
      },
      {
        "date": "8283",
        "title": "君临陷落",
        "description": "在篡夺者战争尾声率西境大军进驻君临攻破红堡，终结疯王伊里斯统治并向劳勃献上投名状。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Sack_of_King%27s_Landing",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Clegane_3"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Tywin_Lannister",
      "https://asoiaf.fandom.com/zh/wiki/Tywin_Lannister"
    ]
  },
  "agot:Lannister_7": {
    "characterId": "agot:Lannister_7",
    "summary": "御林铁卫白袍骑士，泰温·兰尼斯特长子。十五岁破格入卫，因在篡夺者战争中刺杀疯王而背负‘弑君者’骂名，剑术冠绝全境。",
    "publicRoles": [
      "御林铁卫骑士"
    ],
    "aliases": [
      "弑君者",
      "金袍骑士"
    ],
    "appearance": "面容英俊绝伦，身形高大矫健，一头浓密飘逸的金发，碧绿眼眸闪烁傲慢光芒，身披镀金铠甲或御林铁卫纯白披风。",
    "personality": "桀骜不驯，玩世不恭；极度鄙视世俗道德虚伪，内心深处渴望真正的骑士荣耀但从不辩解‘弑君’背后的救城真相。",
    "reputation": "维斯特洛公认最顶尖但名声最臭名昭著的剑客，被世人唾弃为背誓者与弑君者。",
    "experiences": [
      {
        "date": "8281",
        "title": "晋升御林铁卫",
        "description": "在赫伦堡比武会上由疯王伊里斯二世亲手披上白袍，成为历史上最年轻的御林铁卫。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jaime_Lannister",
        "participantIds": [
          "agot:Selmy_3"
        ]
      },
      {
        "date": "8283",
        "title": "铁王座前刺杀疯王",
        "description": "在君临陷落之际，为阻止疯王引爆全城野火炸毁君临而拔剑刺穿伊里斯喉咙，后坐在铁王座上等待联军。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jaime_Lannister",
        "participantIds": [
          "agot:Stark_3",
          "agot:Baratheon_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Selmy_3",
        "kind": "铁卫队长与前辈",
        "description": "敬仰巴利斯坦的武艺与武德，但彼此在誓言理解与处世原则上有着难以逾越的鸿沟。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Barristan_Selmy"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Jaime_Lannister",
      "https://asoiaf.fandom.com/zh/wiki/Jaime_Lannister"
    ]
  },
  "agot:Lannister_8": {
    "characterId": "agot:Lannister_8",
    "summary": "泰温·兰尼斯特公爵次子。天生侏儒畸形，自幼饱受家人与世人白眼，但他凭借过人智慧、渊博学识与尖锐毒舌在权谋世界中自保周旋。",
    "publicRoles": [
      "兰尼斯特家族贵族学者"
    ],
    "aliases": [
      "小恶魔",
      "半人",
      "侏儒"
    ],
    "appearance": "身材矮小畸形，长短脚，额头突起，长着一黑一绿的异色双眸，金白相间的杂乱头发，身着特制华贵短袍。",
    "personality": "毒舌狡黠，心智过人；嗜酒好色以自嘲掩盖痛苦，同情弱小与残缺者，渴望获得父亲与世人哪怕一丝真正的认可。",
    "reputation": "全境贵族口中的畸形怪物与下流恶魔，实际是罕见的博学之士与政治天才。",
    "experiences": [
      {
        "date": "8286",
        "title": "游历君临与自由城邦",
        "description": "十六岁成年后在西方与君临广泛游历，研读古籍与七国律法，精通财政与算术。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Tyrion_Lannister",
        "participantIds": [
          "agot:Lannister_1"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Tyrion_Lannister",
      "https://asoiaf.fandom.com/zh/wiki/Tyrion_Lannister"
    ]
  },
  "agot:Lannister_2": {
    "characterId": "agot:Lannister_2",
    "summary": "泰温·兰尼斯特的亲弟兼首席副帅。性格沉稳老练，执行力极强，毕生甘于居于兄长阴影之下辅佐军政，深受西境军民爱戴。",
    "publicRoles": [
      "西境副统帅",
      "骑士"
    ],
    "aliases": [
      "凯冯爵士"
    ],
    "appearance": "相貌与泰温相仿但线条更为柔和温厚，金发微秃，灰须整齐，目光沉着坚定，身穿实用的精钢锁甲。",
    "personality": "务实忠诚，谦逊自省；极富军政才干但从不争功抢风头，是兰尼斯特家族最稳定可靠的基石。",
    "reputation": "在西境被视为稳健可靠的副手，熟悉军政事务，并以长期辅佐兄长泰温、很少争夺个人风头著称。",
    "experiences": [
      {
        "date": "8261",
        "title": "协助平定九铜板王之战与西境叛乱",
        "description": "从九铜板王之战起便与兄长泰温并肩作战，在诛灭雷恩与塔贝克家族战役中统帅西境左翼。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Kevan_Lannister",
        "participantIds": [
          "agot:Lannister_1"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Kevan_Lannister",
      "https://asoiaf.fandom.com/zh/wiki/Kevan_Lannister"
    ]
  },
  "agot:Lannister_9": {
    "characterId": "agot:Lannister_9",
    "summary": "凯冯·兰尼斯特爵士长子，年轻英俊但阅历尚浅，被安排担任劳勃·拜拉席恩国王的王室侍从，在红堡学习宫廷礼仪与侍从职责。",
    "publicRoles": [
      "国王侍从",
      "兰尼斯特家族子弟"
    ],
    "aliases": [
      "蓝赛尔侍从"
    ],
    "appearance": "相貌极具兰尼斯特特征，留着金色卷发与绿眼睛，容貌与詹姆有几分神似但缺乏男儿英武之气。",
    "personality": "虚荣自负，胆小懦弱；渴望赢得骑士荣耀却易于被权势摆布，对瑟曦充满迷恋与盲从。",
    "reputation": "宫廷侍从中依靠显赫家族背景获得优待的年轻贵胄，缺乏真才实学。",
    "experiences": [
      {
        "date": "8297",
        "title": "受荐成为国王侍从",
        "description": "由瑟曦王后举荐成为劳勃国王身边的侍从，负责在宴饮和游猎中为国王斟酒照料盔甲。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Lancel_Lannister",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Lannister_6"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Lancel_Lannister",
      "https://asoiaf.fandom.com/zh/wiki/Lancel_Lannister"
    ]
  },
  "agot:Clegane_3": {
    "characterId": "agot:Clegane_3",
    "summary": "克里冈家族领主兼泰温·兰尼斯特麾下最凶残的封臣骑士。身躯异常庞大如巨怪，嗜杀成性，常年头痛需大量饮用罂粟花奶止痛。",
    "publicRoles": [
      "方石城领主",
      "骑士"
    ],
    "aliases": [
      "魔山",
      "骑马的巨怪"
    ],
    "appearance": "身高达八英尺，重逾三十石，肩膀宽阔如城门，着全套厚重实心精钢重铠，单手挥舞一柄重型巨剑。",
    "personality": "嗜血残暴，凶蛮嗜杀；毫无道德与同理心，对暴力与虐杀充满本能渴望，只听从泰温·兰尼斯特的残酷号令。",
    "reputation": "全维斯特洛人人谈之色变的战争凶兽与刽子手，恶名昭彰于七大王国。",
    "experiences": [
      {
        "date": "8283",
        "title": "洗劫君临与杀害坦格利安幼嗣",
        "description": "攻破红堡梅葛楼，残忍摔死雷加王子的幼子伊耿并强暴杀害了多恩公主伊莉亚·马泰尔。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Gregor_Clegane",
        "participantIds": [
          "agot:Lannister_1"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Lannister_1",
        "kind": "效忠的主公",
        "description": "泰温公爵手中最致命也是最骇人的杀戮工具，负责执行一切毁灭性任务。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Tywin_Lannister"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Gregor_Clegane",
      "https://asoiaf.fandom.com/zh/wiki/Gregor_Clegane"
    ]
  },
  "agot:Clegane_4": {
    "characterId": "agot:Clegane_4",
    "summary": "兰尼斯特家族侍卫兼乔佛里王子贴身保镖。幼年遭亲兄魔山毁容，厌恶骑士的虚伪口号而坚拒受封骑士头衔，剑术凶悍凌厉。",
    "publicRoles": [
      "王室侍卫",
      "近卫战士"
    ],
    "aliases": [
      "猎狗"
    ],
    "appearance": "身材高大魁梧，左脸布满被烈火灼烧扭曲的狰狞暗红焦疤，头戴标志性的龇牙狂吠精钢狗头盔。",
    "personality": "冷酷粗暴，愤世嫉俗；极度厌恶骑士虚名，内心残存未泯的良知，对烈火怀有深入骨髓的本能恐惧。",
    "reputation": "君临红堡中最令人畏惧退避的凶悍恶犬，以杀伐果断与毒舌无情闻名。",
    "experiences": [
      {
        "date": "8283",
        "title": "受雇兰尼斯特家族",
        "description": "离开克里冈祖地加入凯岩城侍卫军，凭借凶悍武艺成为兰尼斯特家族的核心打手。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Sandor_Clegane",
        "participantIds": [
          "agot:Lannister_1"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Baratheon_5",
        "kind": "护卫与侍奉的主子",
        "description": "受命贴身保护乔佛里，虽然看不起这位任性残忍的王子但忠实执行护卫职责。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Joffrey_Baratheon"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Sandor_Clegane",
      "https://asoiaf.fandom.com/zh/wiki/Sandor_Clegane"
    ]
  },
  "agot:Payne_6": {
    "characterId": "agot:Payne_6",
    "summary": "国王正义使者（御前行刑官），派恩家族骑士。曾因夸口泰温统治实权超过疯王而被疯王用火钳拔去舌头，从此沉默无声、形如枯骨。",
    "publicRoles": [
      "国王正义使者",
      "王室行刑官"
    ],
    "aliases": [
      "无舌刽子手"
    ],
    "appearance": "身材高瘦干枯如骷髅，面容枯槁无血色，无发无须，眼神阴鸷死寂，背负一柄沉重锋利的双手双手巨剑。",
    "personality": "阴冷死寂，毫无言语；沉醉于行刑与斩首的机械快感中，对死亡与鲜血习以为常。",
    "reputation": "君临红堡地牢与贝勒大圣堂外令人毛骨悚然的活死人行刑官。",
    "experiences": [
      {
        "date": "8276",
        "title": "遭疯王拔舌受刑",
        "description": "因言获罪被疯王伊里斯拔去舌头，劳勃登基后为安抚西境将其任命为皇家御前行刑官。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Ilyn_Payne",
        "participantIds": [
          "agot:Lannister_1",
          "agot:Baratheon_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Baratheon_2",
        "kind": "效忠的国王",
        "description": "听从国王手谕执行帝国所有的死刑判决。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Robert_I_Baratheon"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Ilyn_Payne",
      "https://asoiaf.fandom.com/zh/wiki/Ilyn_Payne"
    ]
  },
  "agot:Payne_16": {
    "characterId": "agot:Payne_16",
    "summary": "派恩家族远支遗孤。性格极度腼腆胆怯，说话结巴，被远亲安排到兰尼斯特军营担任杂役侍从，渴望成为一名合格骑士。",
    "publicRoles": [
      "侍从贵族子弟"
    ],
    "aliases": [
      "波德"
    ],
    "appearance": "身材瘦小单薄，棕色软发，神情常显羞涩慌乱，经常紧张得低下头绞弄衣角。",
    "personality": "忠诚体贴，腼腆寡言；虽然胆小怕生但内心极为忠厚老实，懂得感恩且做事细致入微。",
    "reputation": "军营与贵族子弟间常被忽视戏耍的小跟班侍从。",
    "notableRelations": [
      {
        "targetId": "agot:Payne_6",
        "kind": "同族远亲伯父",
        "description": "惧怕无舌行刑官伊林爵士的阴冷面孔，但依附于家族名声求生。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Ilyn_Payne"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Podrick_Payne",
      "https://asoiaf.fandom.com/zh/wiki/Podrick_Payne"
    ]
  },
  "agot:Marbrand_4": {
    "characterId": "agot:Marbrand_4",
    "summary": "烙印城继承人兼西境骑兵先锋统领。詹姆·兰尼斯特的儿时挚友，擅长长矛骑战与前线侦察，是西境年轻一代中最优秀的将领之一。",
    "publicRoles": [
      "烙印城继承人",
      "骑士",
      "前锋统领"
    ],
    "aliases": [
      "亚当爵士"
    ],
    "appearance": "身材匀称挺拔，留着铜红色的披肩长发，面容英俊开朗，身穿绘有燃烧之树纹章的华丽亮银板甲。",
    "personality": "勇敢机敏，豪迈大度；深通斥候战术与骑兵突袭，在军中极有威望与人缘。",
    "reputation": "西境公认最骁勇善战的先锋骑兵大将，深受泰温与詹姆的极高评价。",
    "experiences": [
      {
        "date": "8289",
        "title": "平定铁群岛叛乱",
        "description": "随西境大军渡海征讨铁民，在先锋抢滩战中战功卓著。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Addam_Marbrand",
        "participantIds": [
          "agot:Lannister_1",
          "agot:Lannister_7"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Lannister_7",
        "kind": "儿时至交好友",
        "description": "与詹姆在凯岩城一同受训长大，是詹姆极少数推心置腹的骑士兄弟。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jaime_Lannister"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Addam_Marbrand",
      "https://asoiaf.fandom.com/zh/wiki/Addam_Marbrand"
    ]
  },
  "agot:Crakehall_8": {
    "characterId": "agot:Crakehall_8",
    "summary": "峭岩堡罗兰·克雷赫伯爵次子，西境猛将。体格异常硕大粗壮，力大过人，常自夸能徒手扼死野猪，勇名传遍西境。",
    "publicRoles": [
      "骑士",
      "西境勇将"
    ],
    "aliases": [
      "野猪莱尔"
    ],
    "appearance": "身材高大肥壮如山，胸毛浓密如毡，毛发黑粗，面孔红润粗旷，身着绘有野猪图案的坚固重铠。",
    "personality": "性格粗豪豪放，酷爱饮酒与肉搏；虽然行事粗鲁但心无城府，重义气，打仗勇往直前。",
    "reputation": "西境仅次于魔山的大力士猛将，在军士中极有人缘与号召力。",
    "experiences": [
      {
        "date": "8289",
        "title": "攻坚铁群岛",
        "description": "在葛雷乔伊叛乱中随西境主力登岛破城，以巨斧劈碎敌军寨门。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Lyle_Crakehall",
        "participantIds": [
          "agot:Lannister_1"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Lannister_7",
        "kind": "崇拜的军中统帅",
        "description": "与詹姆私交甚笃，极度钦佩詹姆的剑术与武勇。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jaime_Lannister"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Lyle_Crakehall",
      "https://asoiaf.fandom.com/zh/wiki/Lyle_Crakehall"
    ]
  },
  "agot:Arryn_3": {
    "characterId": "agot:Arryn_3",
    "summary": "鹰巢城公爵、谷地守护兼国王之手，也是劳勃与艾德的养父。篡夺者战争后长期主持王国政务，以稳健、宽厚和善于调和诸侯闻名。",
    "publicRoles": [
      "鹰巢城公爵",
      "谷地守护",
      "国王之手"
    ],
    "aliases": [
      "艾林公爵",
      "老首相"
    ],
    "appearance": "身材高大挺拔，晚年满头银白霜发，蓝眼慈祥而睿智，面容布满治国操劳的深邃皱纹，身披天蓝与月白丝袍。",
    "personality": "仁慈威严，公正审慎；富有崇高政治远见与长者智慧，一心维系王国和平与各方势力平衡。",
    "reputation": "在谷地和王廷享有资深领主与调停者的声望，长期主持政务使许多诸侯将他视为劳勃王朝的重要支柱。",
    "experiences": [
      {
        "date": "8282",
        "title": "鸣钟起兵反抗疯王",
        "description": "在疯王索要奈德与劳勃首级时拒不遵从，在海鸥镇斩断王室锁链正式掀起篡夺者战争。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jon_Arryn",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Stark_3"
        ]
      },
      {
        "date": "8284",
        "title": "出使多恩缔结和平",
        "description": "战争结束后亲往阳戟城归还亲王遗骨，以高超外交手腕平息多恩怒火化解危机。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jon_Arryn",
        "participantIds": [
          "agot:Martell_4"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Baratheon_2",
        "kind": "养子与君主",
        "description": "既是劳勃的君臣首相，更是劳勃终生敬爱的养父与治国向导。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Robert_I_Baratheon"
      },
      {
        "targetId": "agot:Stark_3",
        "kind": "如子至亲",
        "description": "视奈德为最骄傲的养子，两人在荣誉与治国理念上高度契合。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Jon_Arryn",
      "https://asoiaf.fandom.com/zh/wiki/Jon_Arryn"
    ]
  },
  "agot:Tully_6": {
    "characterId": "agot:Tully_6",
    "summary": "奔流城霍斯特公爵次女，琼恩·艾林公爵夫人。她长期生活在丈夫显赫地位与宫廷压力之下，性情敏感多疑，对年幼独子保护得近乎偏执。",
    "publicRoles": [
      "艾林公爵夫人",
      "谷地贵妇"
    ],
    "aliases": [
      "莱莎夫人"
    ],
    "appearance": "身材丰腴发福，面色苍白略显浮肿，有着徒利家的浅蓝眼眸与泛红卷发，神情焦虑多疑，神态神经质。",
    "personality": "偏执疯狂，占有欲极强；对儿子劳勃病态溺爱过度保护，对外界一切人事充满猜疑与防备。",
    "reputation": "谷地封臣眼中喜怒无常、难以理喻的神经质寡妇摄政。",
    "experiences": [
      {
        "date": "8283",
        "title": "下嫁琼恩·艾林",
        "description": "在奔流城依父命与年过花甲的琼恩·艾林成婚，以换取艾林家族全力出兵参战。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Lysa_Arryn",
        "participantIds": [
          "agot:Tully_1",
          "agot:Arryn_3"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Lysa_Arryn",
      "https://asoiaf.fandom.com/zh/wiki/Lysa_Tully"
    ]
  },
  "agot:Arryn_8": {
    "characterId": "agot:Arryn_8",
    "summary": "鹰巢城公爵兼谷地守护，琼恩·艾林与莱莎幼子。年仅六岁，体弱多病常发癫痫抽搐，在母亲过度的母乳喂养与溺爱下娇纵任性。",
    "publicRoles": [
      "鹰巢城公爵",
      "谷地守护者"
    ],
    "aliases": [
      "乖罗宾",
      "小劳勃"
    ],
    "appearance": "身材瘦小孱弱，面色蜡黄，大眼睛水汪汪且充斥着恐慌，常常蜷缩在母亲怀中剧烈颤抖或啼哭。",
    "personality": "胆怯任性，喜怒无常；极度依赖母亲，对不顺心的人动辄扬言‘让他们飞出月门摔死’。",
    "reputation": "谷地诸侯眼中极其羸弱且令人担忧的家族末裔独苗公爵。",
    "experiences": [
      {
        "date": "8292",
        "title": "降生君临红堡",
        "description": "历经多次流产后在君临红堡诞生，以国王劳勃·拜拉席恩之名命名。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Robert_Arryn",
        "participantIds": [
          "agot:Arryn_3",
          "agot:Tully_6",
          "agot:Baratheon_2"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Robert_Arryn",
      "https://asoiaf.fandom.com/zh/wiki/Robert_Arryn"
    ]
  },
  "agot:Royce_1": {
    "characterId": "agot:Royce_1",
    "summary": "符石城伯爵，谷地声望最隆的重臣封臣。身形威武庞大，长年身穿铭刻远古符文的青铜铠甲，枪术剑术超群，对艾林家族忠贞不渝。",
    "publicRoles": [
      "符石城伯爵",
      "谷地诸侯领袖"
    ],
    "aliases": [
      "青铜约恩"
    ],
    "appearance": "身材异常高大壮硕，灰发披肩，面庞如花岗岩般粗砺刻板，常年身披刻满古代先民符文的暗青铜重甲。",
    "personality": "刚烈耿直，恪守古风荣誉；治军严明，对谷地事务有极强责任感，鄙薄宫廷谄媚之风。",
    "reputation": "谷地诸侯公认的军事领袖与精神支柱，在七大王国武术比武界享有崇高声誉。",
    "experiences": [
      {
        "date": "8283",
        "title": "率谷地大军参战",
        "description": "随琼恩·艾林公爵起兵反抗疯王，在三叉戟河诸役中指挥谷地重骑兵浴血奋战。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Yohn_Royce",
        "participantIds": [
          "agot:Arryn_3",
          "agot:Stark_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Arryn_3",
        "kind": "效忠的封君挚友",
        "description": "琼恩·艾林最信任的谷地同僚将领，誓死维护艾林家族在谷地的正统统治。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jon_Arryn"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Yohn_Royce",
      "https://asoiaf.fandom.com/zh/wiki/Yohn_Royce"
    ]
  },
  "agot:RoyceGOTM_1": {
    "characterId": "agot:RoyceGOTM_1",
    "summary": "艾林谷月门堡大元帅兼符石城罗伊斯家族远支。长年在琼恩·艾林离谷期间尽忠职守代掌月门堡与谷地日常防务，深得谷地诸侯信赖。",
    "publicRoles": [
      "月门堡大元帅",
      "谷地防务统领"
    ],
    "aliases": [
      "月门堡奈斯特爵士"
    ],
    "appearance": "身材高大结实，灰发粗短，面容严肃精悍，留着厚重的灰白髭须，身披饰有黑色铁栅与罗伊斯纹章的铁甲。",
    "personality": "老成持重，忠于职守；办事一丝不苟，虽然地位不如符石城本家显赫但极有担当。",
    "reputation": "艾林谷无可替代的干练元帅，谷地上下公认的防务支柱。",
    "experiences": [
      {
        "date": "8284",
        "title": "受封月门堡大元帅",
        "description": "在琼恩·艾林公爵前往君临担任国王之手前，被正式托付月门堡与艾林谷日常驻军防务。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Nestor_Royce",
        "participantIds": [
          "agot:Arryn_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Arryn_3",
        "kind": "效忠的公爵主公",
        "description": "数十年来兢兢业业替琼恩·艾林镇守谷地大门。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jon_Arryn"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Nestor_Royce",
      "https://asoiaf.fandom.com/zh/wiki/Nestor_Royce"
    ]
  },
  "agot:Waynwood_5": {
    "characterId": "agot:Waynwood_5",
    "summary": "铁橡城女伯爵，谷地最具声望与家族底蕴的女诸侯。精明强干，恪守古老荣誉与贵族礼节，在谷地各大家族联姻与调解中举足轻重。",
    "publicRoles": [
      "铁橡城女伯爵",
      "谷地诸侯重臣"
    ],
    "aliases": [
      "安雅夫人"
    ],
    "appearance": "面容清瘦严正，灰发盘起，神态威严沉着，身穿优雅高贵的墨绿天鹅绒贵妇长袍。",
    "personality": "威严干练，精通家族事务；行事极其讲究规矩与信誉，对谷地后辈的管教甚严。",
    "reputation": "谷地诸侯极其敬重的长者与智谋贵妇，在谷地政局中话语权极重。",
    "experiences": [
      {
        "date": "8283",
        "title": "稳固铁橡城后方",
        "description": "在篡夺者战争中统筹后勤与领地防御，派遣诸子随琼恩·艾林征战。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Anya_Waynwood",
        "participantIds": [
          "agot:Arryn_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Royce_1",
        "kind": "政治盟友同僚",
        "description": "与符石城罗伊斯家族保持世代通婚与紧密的谷地政治军事同盟。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Yohn_Royce"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Anya_Waynwood",
      "https://asoiaf.fandom.com/zh/wiki/Anya_Waynwood"
    ]
  },
  "agot:Baelish_2": {
    "characterId": "agot:Baelish_2",
    "summary": "御前财政大臣兼五指半岛微末领主。出身寒微但精通理财与投机权谋，掌控王家海关与庞大商业网络，在君临暗中布局翻云覆雨。",
    "publicRoles": [
      "御前财政大臣",
      "五指半岛领主"
    ],
    "aliases": [
      "小指头"
    ],
    "appearance": "身材短小瘦削，留着精心修剪的黑灰小山羊胡，一双灰绿如猫的双眼闪烁狡黠智慧，常着裁剪讲究的灰蓝丝绒短袍。",
    "personality": "野心勃勃，城府深不可测；擅长伪装人畜无害，擅长挑起混乱并视混乱为向权力巅峰攀爬的天梯。",
    "reputation": "朝廷上下人尽皆知的理财奇才，看似无害但私下令王室重臣摸不透底细。",
    "experiences": [
      {
        "date": "8281",
        "title": "奔流城决斗惨败",
        "description": "年轻时为争夺凯特琳·徒利向布兰登·史塔克发起生死决斗，重伤落败后被逐出奔流城。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Petyr_Baelish",
        "participantIds": [
          "agot:Tully_4",
          "agot:Tully_1"
        ]
      },
      {
        "date": "8293",
        "title": "晋升御前财政大臣",
        "description": "在莱莎引荐与海鸥镇海关显赫政绩推动下，被琼恩·艾林招入御前会议主管全国财政税收。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Petyr_Baelish",
        "participantIds": [
          "agot:Arryn_3",
          "agot:Tully_6",
          "agot:Baratheon_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Tully_4",
        "kind": "毕生执念与初恋",
        "description": "自幼深爱凯特琳，其一生对权力的狂热追逐皆始于当年因地位悬殊被夺爱的屈辱。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Catelyn_Stark"
      },
      {
        "targetId": "agot:Eunuch_1",
        "kind": "宫廷棋局宿敌兼智谋对手",
        "description": "与情报总管瓦里斯在红堡深宫中心照不宣地博弈对抗，彼此提防对方的暗棋。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Varys"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Petyr_Baelish",
      "https://asoiaf.fandom.com/zh/wiki/Petyr_Baelish"
    ]
  },
  "agot:Eunuch_1": {
    "characterId": "agot:Eunuch_1",
    "summary": "御前情报大臣兼红堡太监。来自厄索斯自由城邦里斯，掌控遍布君临与七大王国的庞大‘小小鸟儿’谍报网络，自称一生皆为‘为了王国’服务。",
    "publicRoles": [
      "御前情报大臣",
      "太监"
    ],
    "aliases": [
      "八爪蜘蛛",
      "情报总管"
    ],
    "appearance": "身材肥白圆润，光头无须，身上常年散发着浓郁丁香甜香，动作轻盈无声，能在瞬息间变换各种伪装与嗓音。",
    "personality": "圆滑谦恭，深不可测；表面逢迎各派权贵，内心怀揣极其宏大隐秘的天下复兴棋局，从不行差踏错。",
    "reputation": "君临红堡人人心怀戒备的密探之王，无人知晓其真正底细与忠诚归属。",
    "experiences": [
      {
        "date": "8279",
        "title": "入仕疯王廷臣",
        "description": "被疯王伊里斯二世从潘托斯招入君临担任情报总管，揭发多起针对王室的阴谋叛变。",
        "visibility": "secret",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Varys",
        "participantIds": [
          "agot:Mopatis_1"
        ]
      },
      {
        "date": "8283",
        "title": "劝阻疯王开门",
        "description": "在泰温·兰尼斯特率军兵临城下时曾力劝疯王紧闭城门，但疯王听信派席尔致使君临陷落。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Varys",
        "participantIds": [
          "agot:Lannister_1",
          "agot:Pycelle_1"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Baelish_2",
        "kind": "暗流涌动的博弈对手",
        "description": "清楚培提尔对混乱的渴望，在宫廷中时刻监视并防范其破坏王国的脆弱平衡。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Petyr_Baelish"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Varys",
      "https://asoiaf.fandom.com/zh/wiki/Varys"
    ]
  },
  "agot:Pycelle_1": {
    "characterId": "agot:Pycelle_1",
    "summary": "学城派驻君临的御前大学士。侍奉过坦格利安四代君王与劳勃国王，历经数十年风云，表面苍老龙钟，实则是兰尼斯特家族在朝廷最坚定的暗子。",
    "publicRoles": [
      "大学士",
      "御前会议成员"
    ],
    "aliases": [
      "派席尔大学士"
    ],
    "appearance": "白须垂胸如银瀑的高大老者，身披缀满各色重金项环的繁复学士长袍，常作步履蹒跚、昏昏欲睡状。",
    "personality": "伪善狡诈，奴颜婢膝；擅长以衰老软弱伪装自我，在关键政治风暴中坚定维护泰温·兰尼斯特的利益。",
    "reputation": "侍奉多代君王的资深大学士，熟悉宫廷礼制与王国政务；其政治立场常被认为更亲近兰尼斯特家族。",
    "experiences": [
      {
        "date": "8259",
        "title": "受命出任大学士",
        "description": "由学城总枢机派往君临侍奉杰赫里斯二世国王，从此深植红堡核心枢纽数十年。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Pycelle",
        "participantIds": [
          "agot:Lannister_1"
        ]
      },
      {
        "date": "8283",
        "title": "力劝疯王开城献关",
        "description": "在泰温大军兵临君临时竭力说服疯王打开城门迎接‘盟友’，直接促成红堡陷落。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Pycelle",
        "participantIds": [
          "agot:Lannister_1",
          "agot:Eunuch_1"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Pycelle",
      "https://asoiaf.fandom.com/zh/wiki/Pycelle"
    ]
  },
  "agot:Selmy_3": {
    "characterId": "agot:Selmy_3",
    "summary": "御林铁卫队长，维斯特洛无可争议的传奇骑士。侍奉过疯王伊里斯与劳勃·拜拉席恩，以卓越无匹的剑术武功、高尚武德与无可动摇的忠诚享誉全境。",
    "publicRoles": [
      "御林铁卫队长",
      "传奇骑士"
    ],
    "aliases": [
      "无畏的巴利斯坦",
      "巴利斯坦爵士"
    ],
    "appearance": "身材高大挺拔如松，满头银发但目光湛蓝锐利如鹰，身着一尘不染的纯白板甲与及地白袍，威严不可侵犯。",
    "personality": "正直高洁，恪守誓言；将骑士精神与铁卫操守视作生命全部，不涉党争，纯粹以剑护主。",
    "reputation": "七大王国活着的最伟大传奇骑士，举国骑士阶层膜拜的标杆榜样。",
    "experiences": [
      {
        "date": "8260",
        "title": "九铜板王之战斩杀末代黑火",
        "description": "在石阶列岛决战中单枪匹马突破重围，亲手格杀九铜板王之一的凶怪马里斯·黑火终结黑火叛乱。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Barristan_Selmy",
        "participantIds": [
          "agot:Lannister_1"
        ]
      },
      {
        "date": "8277",
        "title": "暮谷镇单骑救疯王",
        "description": "在暮谷镇叛乱中一人潜入敌巢，在万军之中成功救出被囚禁的伊里斯国王并击杀达克林家叛将。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Defiance_of_Duskendale",
        "participantIds": [
          "agot:Lannister_1"
        ]
      },
      {
        "date": "8283",
        "title": "三叉戟河血战负伤受赦",
        "description": "在三叉戟河为雷加王子血战受重伤，劳勃国王敬其忠勇派御医全力救治并封其为御林铁卫队长。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Barristan_Selmy",
        "participantIds": [
          "agot:Baratheon_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Baratheon_2",
        "kind": "誓死护卫的君主",
        "description": "虽然曾为坦格利安死战，但在劳勃赦免后全心恪守白袍誓言保卫劳勃与王室。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Robert_I_Baratheon"
      },
      {
        "targetId": "agot:Lannister_7",
        "kind": "痛惜而提防的铁卫同僚",
        "description": "叹息詹姆傲世天赋的同时，深深不齿其刺杀疯王的背誓行为。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jaime_Lannister"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Barristan_Selmy",
      "https://asoiaf.fandom.com/zh/wiki/Barristan_Selmy"
    ]
  },
  "agot:Blount_3": {
    "characterId": "agot:Blount_3",
    "summary": "御林铁卫白袍骑士，王领布劳恩家族出身。体态肥胖沉重，性情暴躁胆怯，剑术平庸，在宫廷中深受瑟曦王后拉拢驱使。",
    "publicRoles": [
      "御林铁卫骑士"
    ],
    "aliases": [
      "柏洛斯爵士",
      "肚腩柏洛斯"
    ],
    "appearance": "身材肥胖臃肿，下垂的双颊如斗牛犬，目光浑浊，身穿紧绷的白色御林铁卫铠甲。",
    "personality": "傲慢欺软，贪生怕死；面对强敌时懦弱退缩，面对弱小与平民时蛮横粗暴。",
    "reputation": "白袍铁卫中声名最差、最缺乏骑士美德的平庸之辈。",
    "experiences": [
      {
        "date": "8290",
        "title": "受封御林铁卫",
        "description": "在劳勃国王时期依靠兰尼斯特家族的宫廷运作被选入御林铁卫。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Boros_Blount",
        "participantIds": [
          "agot:Lannister_6",
          "agot:Baratheon_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Lannister_6",
        "kind": "附庸效忠的王后",
        "description": "完全唯瑟曦王后之命是从，在宫廷中充当瑟曦的铁卫帮手。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Cersei_Lannister"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Boros_Blount",
      "https://asoiaf.fandom.com/zh/wiki/Boros_Blount"
    ]
  },
  "agot:Trant_2": {
    "characterId": "agot:Trant_2",
    "summary": "御林铁卫白袍骑士，风暴地特兰家族出身。冷酷残忍、缺乏同情心，甘愿充当瑟曦王后与乔佛里王子处理脏事的冷血打手。",
    "publicRoles": [
      "御林铁卫骑士"
    ],
    "aliases": [
      "马林爵士"
    ],
    "appearance": "面容干瘪丑陋，眼袋深重，面色苍白，留着灰白髭须，身着御林铁卫纯白板甲与披风。",
    "personality": "冷酷阴鸷，毫无道德底线；以盲从上峰命令为借口残害妇孺弱小，毫无骑士荣誉感。",
    "reputation": "朝廷中人尽皆知的冷血走狗，以残忍听话闻名。",
    "experiences": [
      {
        "date": "8286",
        "title": "入选御林铁卫",
        "description": "劳勃国王即位后为拉拢风暴地与王领贵族，由宫廷遴选披上白袍。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Meryn_Trant",
        "participantIds": [
          "agot:Baratheon_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Lannister_6",
        "kind": "听命的主使者",
        "description": "深得瑟曦信任，是王后用来执行见不得光暗杀与逼迫任务的死忠爪牙。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Cersei_Lannister"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Meryn_Trant",
      "https://asoiaf.fandom.com/zh/wiki/Meryn_Trant"
    ]
  },
  "agot:Oakheart_4": {
    "characterId": "agot:Oakheart_4",
    "summary": "御林铁卫白袍骑士，河湾地古老贵族古橡城出身。恪守传统骑士信条，温和有礼，常年被指派贴身护卫弥赛菈公主的安全。",
    "publicRoles": [
      "御林铁卫骑士"
    ],
    "aliases": [
      "亚历斯爵士"
    ],
    "appearance": "面容英俊端正，身材高大匀称，留着浅金棕色头发与温和的棕色眼睛，白袍白甲一尘不染。",
    "personality": "正直热诚，恪尽职守；对骑士誓言抱有赤诚之心，但在面对情感与道义冲突时内心容易挣扎。",
    "reputation": "御林铁卫中为数不多仍保留传统骑士风范与良好声誉的贵族楷模。",
    "experiences": [
      {
        "date": "8290",
        "title": "披上白袍入卫",
        "description": "凭借出众武艺与古橡城名门贵族教养被劳勃国王选入御林铁卫。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Arys_Oakheart",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Selmy_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Baratheon_6",
        "kind": "誓死护卫的小公主",
        "description": "长期担任弥赛菈公主的专属护卫骑士，对公主忠心耿耿爱护有加。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Myrcella_Baratheon"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Arys_Oakheart",
      "https://asoiaf.fandom.com/zh/wiki/Arys_Oakheart"
    ]
  },
  "agot:Greenfield_3": {
    "characterId": "agot:Greenfield_3",
    "summary": "御林铁卫白袍骑士，西境格林菲尔家族出身。老成持重，长年默默履行卫戍誓言职责，在复杂的宫廷斗争中保持中立克制。",
    "publicRoles": [
      "御林铁卫骑士"
    ],
    "aliases": [
      "普列斯顿爵士"
    ],
    "appearance": "身材高大健硕的老牌骑士，胡须花白，目光沉静，身着全套白色铠甲与纯白长披风。",
    "personality": "忠厚沉稳，尽忠职守；不喜宫廷勾心斗角，唯以守卫王室宗亲为己任。",
    "reputation": "红堡中低调可靠的资深铁卫骑士。",
    "experiences": [
      {
        "date": "8285",
        "title": "入选御林铁卫",
        "description": "在篡夺者战争后补选入御林铁卫，驻守红堡历经十余年风雨。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Preston_Greenfield",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Selmy_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Selmy_3",
        "kind": "敬服的长官",
        "description": "坚定遵从巴利斯坦队长的号令操练值守。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Barristan_Selmy"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Preston_Greenfield",
      "https://asoiaf.fandom.com/zh/wiki/Preston_Greenfield"
    ]
  },
  "agot:Moore_2": {
    "characterId": "agot:Moore_2",
    "summary": "御林铁卫白袍骑士，谷地出身。由琼恩·艾林引荐入卫，剑术极强但面无表情如同死尸，被詹姆·兰尼斯特评价为最危险的同僚。",
    "publicRoles": [
      "御林铁卫骑士"
    ],
    "aliases": [
      "曼登爵士"
    ],
    "appearance": "身材高大精瘦，面容僵硬冷漠毫无表情，一双灰死如鱼的眼眸毫无生气，白袍下散发着冰冷杀意。",
    "personality": "沉默冷酷，无喜无悲；宛如毫无情感的杀人兵器，从不与任何同僚交心交友。",
    "reputation": "御林铁卫中最令人捉摸不透且暗中胆寒的冷面死士剑客。",
    "experiences": [
      {
        "date": "8288",
        "title": "受荐披上白袍",
        "description": "由时任首相琼恩·艾林从谷地骑士中引荐入宫，被劳勃国王册封为御林铁卫。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Mandon_Moore",
        "participantIds": [
          "agot:Arryn_3",
          "agot:Baratheon_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Lannister_7",
        "kind": "戒备的铁卫同僚",
        "description": "詹姆对其精湛武艺与毫无破绽的冷血眼神始终心存三分戒心。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jaime_Lannister"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Mandon_Moore",
      "https://asoiaf.fandom.com/zh/wiki/Mandon_Moore"
    ]
  },
  "agot:Slynt_1": {
    "characterId": "agot:Slynt_1",
    "summary": "君临都城守备队的司令，出身屠夫家庭，依靠宫廷经营与利益交换逐步升迁。以贪婪、卖官鬻爵和牢牢控制金袍子闻名。",
    "publicRoles": [
      "都城守备队司令",
      "金袍子司令官"
    ],
    "aliases": [
      "青蛙脸司令"
    ],
    "appearance": "身材矮胖结实，脖子粗短，青蛙般凸出的双眼与阔嘴，留着稀疏黑发，身穿华丽耀眼的金边黑铠与金袍。",
    "personality": "贪婪狂妄，见风使舵；热衷聚敛财富与巴结权贵，极度渴望跻身贵族领主之列。",
    "reputation": "君临平民与正直贵族眼中臭名昭著的贪渎黑官，但在宫廷权贵眼中是绝佳的收买工具。",
    "experiences": [
      {
        "date": "8293",
        "title": "升任都城守备队总司令",
        "description": "在前任司令去世后，凭借培提尔·贝里席的幕后运作成功当上君临金袍子最高统帅。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Janos_Slynt",
        "participantIds": [
          "agot:Baratheon_2"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Janos_Slynt",
      "https://asoiaf.fandom.com/zh/wiki/Janos_Slynt"
    ]
  },
  "agot:Baratheon_9": {
    "characterId": "agot:Baratheon_9",
    "summary": "君临跳蚤窝出身的年轻铁匠学徒，在名匠托博·莫特的作坊学习锻造。身材高大结实，黑发蓝眼，在锻铁与使用战锤方面很有天赋。",
    "publicRoles": [
      "铁匠学徒",
      "平民私生子"
    ],
    "aliases": [
      "牛儿詹德利"
    ],
    "appearance": "身材极为高大结实强壮，一头浓密粗硬的乌黑卷发，下巴坚毅，深蓝眼眸与年轻时的劳勃·拜拉席恩如出一辙。",
    "personality": "耿直倔强，自尊心强；吃苦耐劳，对复杂人情与贵族政治一窍不通，只专注于锤炼精钢盔甲与兵刃。",
    "reputation": "钢铁街上力气最大、手艺最扎实的青年铁匠学徒。",
    "experiences": [
      {
        "date": "8293",
        "title": "入托博·莫特铁匠铺学徒",
        "description": "某位神秘贵族支付了巨额学费将其送入君临顶尖铁匠大师门下学习锻造秘艺。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Gendry",
        "participantIds": []
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Gendry",
      "https://asoiaf.fandom.com/zh/wiki/Gendry"
    ]
  },
  "agot:Tully_1": {
    "characterId": "agot:Tully_1",
    "summary": "奔流城公爵兼三叉戟河最高领主。曾通过将双女联姻北境与谷地奠定篡夺者战争胜利，晚年深受重病折磨卧床不起，将政务托付独子艾德慕。",
    "publicRoles": [
      "奔流城公爵",
      "三叉戟河最高领主"
    ],
    "aliases": [
      "霍斯特公爵",
      "老鳟鱼"
    ],
    "appearance": "晚年饱受水肿病痛折磨，身材枯瘦萎缩，灰红长须稀疏，面容枯槁憔悴，长年卧于奔流城主塔病榻。",
    "personality": "精明老练，以家族利益为第一准则；年轻时果断霸道，晚年在谵妄中对当年逼迫莱莎堕胎深感悔恨自责。",
    "reputation": "河间地备受爱戴的古老统治者与三叉戟河联盟的缔造者。",
    "experiences": [
      {
        "date": "8283",
        "title": "缔结三叉戟河反叛同盟",
        "description": "在鸣钟之役后将长女凯特琳许配艾德、次女莱莎许配琼恩·艾林，带领河间地全境起兵加入反抗疯王联军。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Hoster_Tully",
        "participantIds": [
          "agot:Stark_3",
          "agot:Arryn_3"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Hoster_Tully",
      "https://asoiaf.fandom.com/zh/wiki/Hoster_Tully"
    ]
  },
  "agot:Tully_7": {
    "characterId": "agot:Tully_7",
    "summary": "奔流城继承人兼河间地代掌领主。性格热忱和善、体恤领民，渴望成为受人敬仰的英雄领主，但作战指挥上偶显急躁缺乏深谋远虑。",
    "publicRoles": [
      "奔流城继承人",
      "河间地统领"
    ],
    "aliases": [
      "艾德慕爵士",
      "小鳟鱼"
    ],
    "appearance": "身材高大英挺，浓密的红棕色卷发与修剪整齐的胡子，湛蓝眼眸闪烁热情，身穿饰有跳跃银鳟鱼的精美铠甲。",
    "personality": "心地善良，同情弱小；深切关心平民死活，极重家族荣誉与面子，容易因冲动而做出战术失误。",
    "reputation": "河间地百姓口中仁慈亲民的少主，在军事贵族眼中则稍欠老练火候。",
    "experiences": [
      {
        "date": "8295",
        "title": "代掌奔流城政务",
        "description": "在父亲霍斯特公爵病重后接管河间地封臣调遣与城堡日常防御事务。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Edmure_Tully",
        "participantIds": [
          "agot:Tully_1"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Edmure_Tully",
      "https://asoiaf.fandom.com/zh/wiki/Edmure_Tully"
    ]
  },
  "agot:Tully_9": {
    "characterId": "agot:Tully_9",
    "summary": "霍斯特·徒利的亲弟兼血门骑士，因拒绝包办联姻而自称“黑鱼”。武艺娴熟，熟悉斥候与山地防务，是经历过多场战争的老将。",
    "publicRoles": [
      "血门骑士",
      "谷地防务大将"
    ],
    "aliases": [
      "黑鱼"
    ],
    "appearance": "身材高大矫健，满头灰白短发，线条如刀削般冷硬刚毅，深蓝眼眸如鹰隼般锐利，披风上绣有黑色跃水鳟鱼徽记。",
    "personality": "桀骜不驯，刚烈正直；富有极高军事战术天赋与领导力，鄙视政治算计，一生未娶。",
    "reputation": "全七国公认的顶级战术大师与顽强勇将，深受谷地与河间地骑士的崇敬。",
    "experiences": [
      {
        "date": "8260",
        "title": "九铜板王之战成名",
        "description": "年轻时随军远征石阶列岛立下奇功，以过人勇武与战术指挥扬名维斯特洛。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Brynden_Tully",
        "participantIds": [
          "agot:Tully_1"
        ]
      },
      {
        "date": "8283",
        "title": "出任艾林谷血门骑士",
        "description": "随侄女莱莎前往艾林谷，被琼恩·艾林委以重任任命为扼守谷地天险的血门骑士统帅。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Brynden_Tully",
        "participantIds": [
          "agot:Arryn_3",
          "agot:Tully_6"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Tully_4",
        "kind": "最疼爱的侄女",
        "description": "自幼将凯特琳视若己出，在凯特琳遇到任何危难时都会毫不犹豫拔剑相助。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Catelyn_Stark"
      },
      {
        "targetId": "agot:Arryn_3",
        "kind": "赏识信任的至交",
        "description": "琼恩·艾林生前最倚重的军事防务大将。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jon_Arryn"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Brynden_Tully",
      "https://asoiaf.fandom.com/zh/wiki/Brynden_Tully"
    ]
  },
  "agot:Frey_1": {
    "characterId": "agot:Frey_1",
    "summary": "孪河城侯爵兼绿叉河渡口领主。年近九旬，拥有庞大无比的子孙后裔家族群，掌控扼守南北交通要道的孪河城石桥，贪婪记仇、极重家族利益。",
    "publicRoles": [
      "孪河城侯爵",
      "渡口领主"
    ],
    "aliases": [
      "迟到的佛雷大人",
      "老佛雷"
    ],
    "appearance": "九十岁高龄的秃顶枯瘦老者，下巴无牙凹陷，长着黄褐斑点与如黄鼠狼般警惕的小眼睛，常年坐于轮椅或高椅上。",
    "personality": "敏感多疑，睚眦必报；对他人的一丝轻慢怀恨在心，极度看重渡口过路费与为庞大子嗣谋求贵族联姻利益。",
    "reputation": "维斯特洛诸侯私下鄙夷嘲笑的自私老滑头，因三叉戟河战后才赶到被劳勃讥为‘迟到的佛雷’。",
    "experiences": [
      {
        "date": "8283",
        "title": "三叉戟河迟到参战",
        "description": "在篡夺者决战大局已定后才率佛雷全军慢吞吞赶到战场，招致各方诸侯的鄙视嘲笑。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Walder_Frey",
        "participantIds": [
          "agot:Tully_1",
          "agot:Baratheon_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Tully_1",
        "kind": "心怀不满的封君",
        "description": "痛恨霍斯特公爵多年来对佛雷家族暴发户身份的傲慢与轻慢。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Hoster_Tully"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Walder_Frey",
      "https://asoiaf.fandom.com/zh/wiki/Walder_Frey"
    ]
  },
  "agot:Frey_2": {
    "characterId": "agot:Frey_2",
    "summary": "孪河城继承人，瓦德·佛雷侯爵的长子。年过六旬，性格谨慎稳重，极力维系庞大而勾心斗角的佛雷家族内部和睦与对外名誉。",
    "publicRoles": [
      "孪河城继承人",
      "骑士"
    ],
    "aliases": [
      "史提夫隆爵士"
    ],
    "appearance": "满头白发的老骑士，容貌亦带有些许佛罗家族典型的黄鼠狼相貌，神态疲惫沉稳，身穿实用锁甲。",
    "personality": "温和谨慎，顾全大局；恪守骑士操守与长子职责，时刻提醒子侄们‘家和万事兴’。",
    "reputation": "佛雷家族中极少数真正赢得外族诸侯尊重与信任的正派长辈。",
    "experiences": [
      {
        "date": "8283",
        "title": "随军参战三叉戟河",
        "description": "作为佛雷家族前锋指挥官随父亲出征，协助维系河间地后方防线秩序。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Stevron_Frey",
        "participantIds": [
          "agot:Frey_1"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Stevron_Frey",
      "https://asoiaf.fandom.com/zh/wiki/Stevron_Frey"
    ]
  },
  "agot:Blackwood_6": {
    "characterId": "agot:Blackwood_6",
    "summary": "鸦树城伯爵，河间地先民后裔与旧神信仰守护者。与邻近的布雷肯家族世仇延续数千年，治军严明，精明强干，深得部众拥戴。",
    "publicRoles": [
      "鸦树城伯爵",
      "河间地诸侯"
    ],
    "aliases": [
      "泰陀斯伯爵"
    ],
    "appearance": "身材高大削瘦，蓄着修长的灰须，身披标志性的乌鸦黑羽毛华丽大氅，腰佩精钢长剑，神态冷峻威严。",
    "personality": "坚毅傲岸，忠诚重诺；恪守先民古神信仰与传统，在家族世仇面前寸步不让。",
    "reputation": "河间地公认最骁勇忠诚、富有威严的古老旧神诸侯领袖。",
    "experiences": [
      {
        "date": "8283",
        "title": "血战三叉戟河",
        "description": "随徒利家族全力投入篡夺者战争，在战场上以乌鸦羽大氅扬名四方。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Tytos_Blackwood",
        "participantIds": [
          "agot:Tully_1"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Bracken_3",
        "kind": "世代死敌领主",
        "description": "两大家族因领地边界、宗教信仰与古老血仇互不相让争斗千年。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jonos_Bracken"
      },
      {
        "targetId": "agot:Tully_1",
        "kind": "忠诚效顺的封君",
        "description": "虽然自豪于先民古神传统，但对奔流城徒利家族的号令始终忠贞不二。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Hoster_Tully"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Tytos_Blackwood",
      "https://asoiaf.fandom.com/zh/wiki/Tytos_Blackwood"
    ]
  },
  "agot:Bracken_3": {
    "characterId": "agot:Bracken_3",
    "summary": "石篱城伯爵，河间地古老的大诸侯之一。信奉七神，长年与邻近的布莱伍德家族就土地、林地与世仇纷争不断，武勇好斗、心高气傲。",
    "publicRoles": [
      "石篱城伯爵",
      "河间地诸侯"
    ],
    "aliases": [
      "布雷肯大人"
    ],
    "appearance": "身材魁梧粗壮，红棕色头发，浓密的大胡子，身披饰有红底黑马纹章的厚实战甲。",
    "personality": "傲慢好斗，脾气暴躁；极度重视个人与家族利益，在军事上勇猛但偶显短视与投机。",
    "reputation": "河间地威名赫赫的悍勇领主，石篱城铁骑的强悍统帅。",
    "experiences": [
      {
        "date": "8283",
        "title": "随军征战篡夺者之役",
        "description": "响应奔流城征召出兵参战，在多场围城战中立下赫赫战功。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jonos_Bracken",
        "participantIds": [
          "agot:Tully_1"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Blackwood_6",
        "kind": "仇深似海的死敌",
        "description": "与泰陀斯·布莱伍德针锋相对，两家族在每一寸交界土地上皆爆发过流血冲突。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Tytos_Blackwood"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Jonos_Bracken",
      "https://asoiaf.fandom.com/zh/wiki/Jonos_Bracken"
    ]
  },
  "agot:Mallister_4": {
    "characterId": "agot:Mallister_4",
    "summary": "海疆城伯爵，河间地西海岸门户统帅。在葛雷乔伊叛乱中亲手斩杀巴隆·葛雷乔伊长子罗德利克，以英武、高贵与坚定防御铁民闻名遐迩。",
    "publicRoles": [
      "海疆城伯爵",
      "河间地防御大将"
    ],
    "aliases": [
      "杰森勋爵"
    ],
    "appearance": "身材高大英武，面容端正高贵，灰白相间的头发与锐利深蓝眼眸，身披绘有展翅紫海鹰的华丽银甲。",
    "personality": "英勇高贵，极重荣誉；治军严密，对抵御铁群岛劫掠怀有崇高责任心，是一位无可挑剔的骑士典范。",
    "reputation": "河间地享有崇高威望的老牌名将，海疆城坚不可摧的守护神。",
    "experiences": [
      {
        "date": "8289",
        "title": "海疆城城下斩将",
        "description": "在葛雷乔伊叛乱中率部击退铁民抢滩，在城墙下单挑斩杀铁群岛王储罗德利克·葛雷乔伊并击溃铁民大军。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jason_Mallister",
        "participantIds": [
          "agot:Tully_1"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Tully_1",
        "kind": "效忠的封君",
        "description": "徒利家族最忠诚有力的柱石封臣之一。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Hoster_Tully"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Jason_Mallister",
      "https://asoiaf.fandom.com/zh/wiki/Jason_Mallister"
    ]
  },
  "agot:Blackwater_1": {
    "characterId": "agot:Blackwater_1",
    "summary": "出身底层的无名佣兵剑客。剑法阴险实用、身手极度敏捷，唯利是图、实用主义至上，在维斯特洛各地的战乱与商道中讨生活。",
    "publicRoles": [
      "佣兵剑客"
    ],
    "aliases": [
      "黑水河的波隆"
    ],
    "appearance": "身材精瘦矫健，黑发黑眼，下巴留着杂乱硬胡茬，眼神冷酷敏锐如狼，身着破旧但保养极佳的皮甲与锁甲。",
    "personality": "冷酷务实，毫无道德包袱；不讲骑士虚礼，唯以金钱与自身生存为第一考量，战斗中极善抓住对手破绽一击毙命。",
    "reputation": "酒馆与佣兵营地中令人不敢招惹的致命游侠剑客。",
    "experiences": [
      {
        "date": "8295",
        "title": "游荡河间地与王领",
        "description": "长年在三叉戟河、国王大道与君临周边承接贵族护卫与佣兵任务。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Bronn",
        "participantIds": []
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Bronn",
      "https://asoiaf.fandom.com/zh/wiki/Bronn"
    ]
  },
  "agot:Tyrell_8": {
    "characterId": "agot:Tyrell_8",
    "summary": "高庭公爵、河湾地最高领主兼南境守护。坐拥全维斯特洛最庞大的军队与最富庶的粮仓，野心勃勃但军事才能平庸，决策多依赖母亲奥莲娜夫人指导。",
    "publicRoles": [
      "高庭公爵",
      "南境守护",
      "河湾地最高领主"
    ],
    "aliases": [
      "充气鱼",
      "高庭公爵"
    ],
    "appearance": "身材高大但体态微胖，留着修剪成卷曲黑桃形状的栗色胡须，红润满面，喜穿饰有金色玫瑰的华贵天鹅绒礼服。",
    "personality": "虚荣自大，渴望战场功名与王室联姻；性格好大喜功但并不残暴，极度重视提利尔家族的显赫门面。",
    "reputation": "全境诸侯眼中富有但缺乏真才实学的‘充气鱼’公爵，靠庞大军力和母亲智谋维持威势。",
    "experiences": [
      {
        "date": "8283",
        "title": "风息堡长年围城",
        "description": "在篡夺者战争中统帅河湾地大军围困风息堡近一年，最终在奈德率军解围后向劳勃屈膝归降。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Mace_Tyrell",
        "participantIds": [
          "agot:Baratheon_3",
          "agot:Stark_3"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Mace_Tyrell",
      "https://asoiaf.fandom.com/zh/wiki/Mace_Tyrell"
    ]
  },
  "agot:Redwyne_2": {
    "characterId": "agot:Redwyne_2",
    "summary": "高庭公爵太夫人，梅斯·提利尔之母。人称‘荆棘女王’，以尖酸刻薄的毒舌、老辣深邃的政治洞察力和对家族前程的绝对掌控力闻名于七大王国。",
    "publicRoles": [
      "高庭公爵太夫人",
      "提利尔家族幕后掌门人"
    ],
    "aliases": [
      "荆棘女王",
      "奥莲娜夫人"
    ],
    "appearance": "身材娇小干瘪如干枣的老妇人，白发苍苍，戴着精致的白色无沿帽，眼神锐利如刀，拄着拐杖但步履稳健。",
    "personality": "机智刻薄，一针见血；极度厌恶愚蠢与虚伪，对家族利益与孙辈前程呵护备至，手段老辣果决。",
    "reputation": "全维斯特洛公认最不能招惹的政坛老祖母，无人能在言语交锋中从其手中占得便宜。",
    "experiences": [
      {
        "date": "8250",
        "title": "巧妙摆脱坦格利安王室联姻",
        "description": "年轻时凭借机智巧妙避开了与戴隆·坦格利安王子的政治婚约，后改嫁高庭公爵路瑟·提利尔。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Olenna_Tyrell",
        "participantIds": []
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Tyrell_14",
        "kind": "悉心栽培的掌上明珠",
        "description": "将最心爱的孙女玛格丽视作家族未来的无价之宝并亲授其宫廷权谋与生存之道。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Margaery_Tyrell"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Olenna_Tyrell",
      "https://asoiaf.fandom.com/zh/wiki/Olenna_Redwyne"
    ]
  },
  "agot:Hightower_9": {
    "characterId": "agot:Hightower_9",
    "summary": "高庭公爵夫人，旧镇雷顿·海塔尔伯爵长女。端庄高贵、血统极其显赫，是提利尔四位杰出子女的母亲，在河湾地内廷深受尊崇。",
    "publicRoles": [
      "高庭公爵夫人",
      "旧镇贵女"
    ],
    "aliases": [
      "艾勒莉夫人"
    ],
    "appearance": "容貌高雅秀丽，拥有一头银灰色的长发与典雅的贵族仪态，身穿绣有海塔尔白塔与提利尔玫瑰的华丽丝袍。",
    "personality": "温婉端庄，恪尽母职；在婆婆奥莲娜的强势面前保持谦逊平和，全心料理高庭内廷与子女教养。",
    "reputation": "河湾地贵妇阶层中极具威望与教养的楷模主母。",
    "experiences": [
      {
        "date": "8275",
        "title": "联姻高庭提利尔家族",
        "description": "由旧镇海塔尔家族嫁入高庭，促成河湾地两大最强古老豪门的强强联合。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Alerie_Hightower",
        "participantIds": [
          "agot:Tyrell_8",
          "agot:Hightower_5"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Alerie_Hightower",
      "https://asoiaf.fandom.com/zh/wiki/Alerie_Hightower"
    ]
  },
  "agot:Tyrell_11": {
    "characterId": "agot:Tyrell_11",
    "summary": "高庭继承人，梅斯·提利尔长子。在比武中被奥柏伦·马泰尔误伤致残一腿，从此潜心研读古籍与训鹰育马，以睿智、博学与温和在封臣中享有盛誉。",
    "publicRoles": [
      "高庭继承人",
      "学者型贵族"
    ],
    "aliases": [
      "瘸子维拉斯"
    ],
    "appearance": "身材高大俊雅，留着修剪整齐的棕发与温和明亮的眼睛，右腿残疾行走需拄拐杖，着装简素优雅。",
    "personality": "睿智博学，心胸宽广；未因伤残而怨恨奥柏伦，反而与其保持书信往来，是提利尔家族中最具战略头脑的继承人。",
    "reputation": "河湾地诸侯一致钦佩的年轻智者与高庭未来的明主。",
    "experiences": [
      {
        "date": "8290",
        "title": "比武受创致残",
        "description": "在成年后的初次比武中长矛对决奥柏伦·马泰尔，坐骑受惊倒下压碎右腿落下终身残疾。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Willas_Tyrell",
        "participantIds": [
          "agot:Martell_8",
          "agot:Tyrell_8"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Martell_8",
        "kind": "不计前嫌的笔友",
        "description": "理解当年的意外伤残，两人常年互通书信交流培育猎鹰与良马心得。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Oberyn_Martell"
      },
      {
        "targetId": "agot:Redwyne_2",
        "kind": "最器重的长孙",
        "description": "深得祖母奥莲娜的赞赏与喜爱，被奥莲娜视为孙辈中最聪慧理智之人。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Olenna_Redwyne"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Willas_Tyrell",
      "https://asoiaf.fandom.com/zh/wiki/Willas_Tyrell"
    ]
  },
  "agot:Tyrell_12": {
    "characterId": "agot:Tyrell_12",
    "summary": "梅斯·提利尔公爵次子。剑术造诣甚至超越胞弟洛拉斯，长年以一敌三练习剑法，性情谦逊豁达、正直坦荡，深得骑士阶层敬服。",
    "publicRoles": [
      "骑士",
      "河湾地剑客"
    ],
    "aliases": [
      "勇武的加兰"
    ],
    "appearance": "身材高大魁梧匀称，容貌英武，蓄着浓密有型的短胡须，身着优质精钢战铠，气度沉稳自信。",
    "personality": "谦和宽厚，勇冠三军；从不张扬炫耀武艺，待人诚恳温和，是维斯特洛极少数兼具真正武德与高超剑术的完美骑士。",
    "reputation": "河湾地封臣眼中最低调却最具战斗力的顶尖骑士领袖。",
    "experiences": [
      {
        "date": "8295",
        "title": "受封骑士头衔",
        "description": "在比武场与操练中展现出惊人的群战剑术，被册封为正式骑士并由祖母赐予‘勇武’绰号。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Garlan_Tyrell",
        "participantIds": [
          "agot:Tyrell_8",
          "agot:Redwyne_2"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Garlan_Tyrell",
      "https://asoiaf.fandom.com/zh/wiki/Garlan_Tyrell"
    ]
  },
  "agot:Tyrell_13": {
    "characterId": "agot:Tyrell_13",
    "summary": "梅斯·提利尔公爵幼子，誉满七国的百花骑士。长枪比武技艺超群绝伦，英俊非凡，深受全境贵族小姐与年轻骑士的狂热追捧，与蓝礼·拜拉席恩关系极为密切。",
    "publicRoles": [
      "百花骑士",
      "比武冠军"
    ],
    "aliases": [
      "百花骑士"
    ],
    "appearance": "容貌绝美俊秀，一头闪耀的金色波浪卷发，深褐眼眸光彩照人，身穿镶嵌千百朵鲜花与宝石的精美银甲。",
    "personality": "骄傲热烈，敢爱敢恨；充满浪漫的骑士激情，在比武与战场上追求极速与荣耀，偶显年轻气盛。",
    "reputation": "全维斯特洛公认最耀眼迷人的少年骑士偶像与长枪比武王者。",
    "experiences": [
      {
        "date": "8294",
        "title": "奔流城比武大会夺冠",
        "description": "十六岁首次参加全境大型比武大会便挑落数十位资深骑士一举斩获长枪冠军。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Loras_Tyrell",
        "participantIds": [
          "agot:Baratheon_4"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Baratheon_4",
        "kind": "挚友与侍从骑士",
        "description": "曾任蓝礼的侍从，两人维持着超越常人的亲密情谊与牢固的政治同盟。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Renly_Baratheon"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Loras_Tyrell",
      "https://asoiaf.fandom.com/zh/wiki/Loras_Tyrell"
    ]
  },
  "agot:Tyrell_14": {
    "characterId": "agot:Tyrell_14",
    "summary": "高庭公爵梅斯·提利尔独女。容貌娇艳动人，深得祖母奥莲娜亲传，天生擅长赢得民心与宫廷社交，是河湾地最耀眼的名门贵女。",
    "publicRoles": [
      "高庭贵女",
      "河湾地明珠"
    ],
    "aliases": [
      "高庭小玫瑰"
    ],
    "appearance": "一头浓密的棕色长卷发，鹿一般灵动的棕色大眼睛，身材婀娜多姿，笑容温暖甜美，举止优雅绝伦。",
    "personality": "聪慧敏锐，善解人意；极具政治直觉与亲和力，善于伪装野心，在民意经营与贵族交往上极有手腕。",
    "reputation": "七大王国最具魅力与好评的贵族少女，河湾地上下倾倒的完美名媛。",
    "experiences": [
      {
        "date": "8283",
        "title": "降生高庭城堡",
        "description": "作为提利尔家族最小的孩子兼独女在高庭诞生，自幼接受严格的贵族统治者熏陶。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Margaery_Tyrell",
        "participantIds": [
          "agot:Tyrell_8",
          "agot:Redwyne_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Redwyne_2",
        "kind": "言传身教的祖母导师",
        "description": "随祖母奥莲娜学习洞察人心与政治博弈，两人情同心腹盟友。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Olenna_Redwyne"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Margaery_Tyrell",
      "https://asoiaf.fandom.com/zh/wiki/Margaery_Tyrell"
    ]
  },
  "agot:Tarly_1": {
    "characterId": "agot:Tarly_1",
    "summary": "角陵伯爵兼河湾地第一名将。治军极其冷酷严苛，手握瓦雷利亚钢巨剑碎心，曾在篡夺者战争中于岑树滩之战击败劳勃·拜拉席恩。",
    "publicRoles": [
      "角陵伯爵",
      "河湾地统帅",
      "边疆地诸侯"
    ],
    "aliases": [
      "蓝道大人"
    ],
    "appearance": "身材高瘦挺拔如铁枪，面颊削瘦无肉，目光冰冷严酷，身背双手巨剑碎心，浑身散发着森然肃杀之气。",
    "personality": "铁血严酷，崇尚纯粹的武力与服从；对软弱与读书深恶痛绝，极度专横无情。",
    "reputation": "全维斯特洛公认治军最严明、最令敌军生畏的铁血战术大将。",
    "experiences": [
      {
        "date": "8282",
        "title": "岑树滩之战击败劳勃",
        "description": "在岑树滩战役中率河湾地先锋彻底击溃劳勃·拜拉席恩的叛军，取得篡夺者战争中王室军唯一的陆战大捷。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Randyll_Tarly",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Tyrell_8"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Tyrell_8",
        "kind": "效忠的封君",
        "description": "虽然看不起梅斯·提利尔的军事才能，但恪守封臣职责为高庭效命。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Mace_Tyrell"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Randyll_Tarly",
      "https://asoiaf.fandom.com/zh/wiki/Randyll_Tarly"
    ]
  },
  "agot:Redwyne_4": {
    "characterId": "agot:Redwyne_4",
    "summary": "青亭岛伯爵兼青亭岛舰队司令。掌控维斯特洛规模最庞大富庶的海上贸易商队与武装战舰，与高庭提利尔家族有着紧密的血亲盟约。",
    "publicRoles": [
      "青亭岛伯爵",
      "青亭岛舰队司令"
    ],
    "aliases": [
      "雷德温伯爵"
    ],
    "appearance": "身材高大结实，带有浓郁航海人特色的红润饱经风霜面庞，红发微卷，身穿华贵的深蓝航海丝袍与甲胄。",
    "personality": "精明老练，擅长海战与航运垄断；在七国内战中长于审时度势，牢牢守护家族的海上霸权与财富。",
    "reputation": "全境最具实力的海上霸主诸侯，掌控七国最重要的葡萄酒航运与舰队。",
    "experiences": [
      {
        "date": "8283",
        "title": "海路封锁风息堡",
        "description": "在篡夺者战争期间率青亭岛舰队封锁破船湾，完全切断风息堡的海上补给达一年之久。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Paxter_Redwyne",
        "participantIds": [
          "agot:Tyrell_8",
          "agot:Baratheon_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Redwyne_2",
        "kind": "亲姑姑与家族智囊",
        "description": "与奥莲娜夫人保持紧密的家族政治协商，始终与高庭保持同进同退。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Olenna_Redwyne"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Paxter_Redwyne",
      "https://asoiaf.fandom.com/zh/wiki/Paxter_Redwyne"
    ]
  },
  "agot:Hightower_5": {
    "characterId": "agot:Hightower_5",
    "summary": "旧镇之声、参天塔伯爵、港口之主兼绿之领域卫士。多年隐居于数百尺高的参天塔顶层研究星象法术，极少踏出高塔一步，旧镇诸事交由儿女治理。",
    "publicRoles": [
      "旧镇伯爵",
      "参天塔领主",
      "学城守护者"
    ],
    "aliases": [
      "旧镇疯老头",
      "参天塔的雷顿伯爵"
    ],
    "appearance": "常年未露面的苍老隐士领主，相传留着如雪长须，身披法师般的厚重斗篷，在塔顶俯瞰回音湾。",
    "personality": "神秘古怪，深居简出；沉醉于古老预言、星象与法术古卷，对世俗争端冷眼旁观但底蕴极深。",
    "reputation": "河湾地最神秘且最具历史威望的古老领主，旧镇繁荣的基石。",
    "experiences": [
      {
        "date": "8289",
        "title": "退隐参天塔顶",
        "description": "在葛雷乔伊叛乱后彻底搬入参天塔顶楼潜心闭关研读古卷，已有十年不曾下塔。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Leyton_Hightower",
        "participantIds": []
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Leyton_Hightower",
      "https://asoiaf.fandom.com/zh/wiki/Leyton_Hightower"
    ]
  },
  "agot:Rowan_1": {
    "characterId": "agot:Rowan_1",
    "summary": "金树城伯爵，河湾地最有声望与实力的资深诸侯之一。性格稳重正直、长于谋略统军，是高庭公爵梅斯最核心的军事智囊与大将。",
    "publicRoles": [
      "金树城伯爵",
      "河湾地诸侯重臣"
    ],
    "aliases": [
      "罗宛大人"
    ],
    "appearance": "身材修长挺拔，面容沉静威严，留着整齐的短髭，身披绣有金色大树纹章的华丽深绿天鹅绒披风。",
    "personality": "沉着冷静，深谋远虑；富有正义感，做事顾全大局，在河湾地军事会议中极有分量与威信。",
    "reputation": "河湾地公认最值得信赖与才干过人的骨干领主将领。",
    "experiences": [
      {
        "date": "8283",
        "title": "随军参战篡夺者之役",
        "description": "统领金树城精锐骑兵随梅斯·提利尔参与围城，始终维持军纪严明。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Mathis_Rowan",
        "participantIds": [
          "agot:Tyrell_8"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Tyrell_8",
        "kind": "效忠的封君统帅",
        "description": "梅斯·提利尔在战役谋划中最依赖与倾听意见的诸侯大将。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Mace_Tyrell"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Mathis_Rowan",
      "https://asoiaf.fandom.com/zh/wiki/Mathis_Rowan"
    ]
  },
  "agot:Martell_4": {
    "characterId": "agot:Martell_4",
    "summary": "阳戟城公爵兼多恩亲王，因严重痛风行动不便。性情沉静审慎，习惯在流水花园远离喧闹，以耐心、克制和避免无谓冲突治理多恩。",
    "publicRoles": [
      "多恩亲王",
      "阳戟城领主"
    ],
    "aliases": [
      "道朗亲王",
      "痛风亲王"
    ],
    "appearance": "体态苍老憔悴，双腿与关节因痛风红肿变形，需依靠轮椅代步，但双眼深邃如墨，沉着冷静。",
    "personality": "极度隐忍，谋定后动；深通政治长线棋局，自比‘静待成熟落地的血橙’，宁愿承受软弱骂名也绝不轻举妄动致使人民流血。",
    "reputation": "多恩境内激进派封臣眼中软弱可欺的轮椅亲王，实则为天下至深之阴谋家。",
    "experiences": [
      {
        "date": "8283",
        "title": "妹妹惨死隐忍媾和",
        "description": "在妹妹伊莉亚公主遭兰尼斯特军队残忍杀害后，与琼恩·艾林签署和平协议，将怒火压入心底。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Doran_Martell",
        "participantIds": [
          "agot:Arryn_3",
          "agot:Martell_8"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Doran_Martell",
      "https://asoiaf.fandom.com/zh/wiki/Doran_Martell"
    ]
  },
  "agot:Martell_8": {
    "characterId": "agot:Martell_8",
    "summary": "多恩亲王道朗之弟。精通枪术、毒物、学问与自由城邦游击战术，性格狂放不羁、嗜血复仇，为给惨死的姐姐伊莉亚讨还公道而誓死与兰尼斯特为敌。",
    "publicRoles": [
      "多恩亲王",
      "红毒蛇",
      "次子团前指挥官"
    ],
    "aliases": [
      "红毒蛇",
      "奥柏伦亲王"
    ],
    "appearance": "身材修长精悍如黑豹，黑发如蛇信卷曲，浓眉下长着一双黑曜石般深邃狂傲的黑眸，身穿轻便金鳞软甲，手持长枪。",
    "personality": "狂野桀骜，锋芒毕露；极度重情重义，蔑视世俗规矩，对仇敌毫不留情，对自由与欢愉充满无尽渴望。",
    "reputation": "全七国令人闻风丧胆的剧毒骑士与决斗死神，多恩人民崇拜的热血英雄。",
    "experiences": [
      {
        "date": "8274",
        "title": "旧镇学城铸链与流亡佣兵",
        "description": "年轻时在学城铸造多枚学士环后游历厄索斯，加入并创建佣兵团转战自由城邦。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Oberyn_Martell",
        "participantIds": []
      },
      {
        "date": "8283",
        "title": "誓血为伊莉亚复仇",
        "description": "在得知伊莉亚公主与外甥惨遭魔山杀害后，欲在多恩起兵为韦赛里斯复辟，后被道朗按捺转入潜伏。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Oberyn_Martell",
        "participantIds": [
          "agot:Martell_4"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Uller_6",
        "kind": "挚爱伴侣与灵魂知己",
        "description": "地狱修道院领主私生女，与奥柏伦相伴多年育有四女，彼此深爱忠贞。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Ellaria_Sand"
      },
      {
        "targetId": "agot:Clegane_3",
        "kind": "誓杀的血海仇敌",
        "description": "发誓一定要亲手将淬毒长矛刺入魔山胸膛为姐姐伊莉亚复仇。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Gregor_Clegane"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Oberyn_Martell",
      "https://asoiaf.fandom.com/zh/wiki/Oberyn_Martell"
    ]
  },
  "agot:Martell_9": {
    "characterId": "agot:Martell_9",
    "summary": "阳戟城继承人兼多恩大公主，道朗亲王长女。美艳热烈、野心勃勃，因误以为父亲偏心弟弟昆廷欲剥夺其继承权而对父亲心存叛逆戒备。",
    "publicRoles": [
      "多恩继承人大公主"
    ],
    "aliases": [
      "亚莲恩公主"
    ],
    "appearance": "身材娇小丰满曼妙，拥有如丝缎般的浓密黑卷发与橄榄色肌肤，一双黑色大眼睛充满诱惑与果决神采。",
    "personality": "热情奔放，敢作敢当；极具自信与野心，行事偶显急躁冒险，对多恩的继承传统誓死捍卫。",
    "reputation": "多恩全境最美艳迷人的大公主，无数南方骑士倾慕的对象。",
    "experiences": [
      {
        "date": "8276",
        "title": "降生阳戟城",
        "description": "作为道朗亲王与梅拉莉欧夫人的长女诞生，依据多恩律法成为无可争议的第一继承人。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Arianne_Martell",
        "participantIds": [
          "agot:Martell_4"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Martell_14",
        "kind": "最亲密的沙蛇姐妹",
        "description": "与特蕾妮·沙德情同闺中密友，两人无话不谈共同策划行动。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Tyene_Sand"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Arianne_Martell",
      "https://asoiaf.fandom.com/zh/wiki/Arianne_Martell"
    ]
  },
  "agot:Martell_10": {
    "characterId": "agot:Martell_10",
    "summary": "道朗亲王次子。自幼被送往伊伦伍德家族抚养作为政治质子，性情内向质朴、尽忠职守，在伊伦伍德伯爵麾下受封骑士。",
    "publicRoles": [
      "多恩王子",
      "骑士"
    ],
    "aliases": [
      "青蛙王子",
      "昆廷王子"
    ],
    "appearance": "相貌平平，身材矮胖敦实，棕发扁鼻，神态拘谨严肃，缺乏乃叔奥柏伦的潇洒俊逸但神情极其坚毅。",
    "personality": "忠厚老实，责任感极强；渴望履行王子义务获得父亲认可，即便面对凶险绝境也绝不临阵退缩。",
    "reputation": "多恩封臣眼中低调务实、毫无骄纵之气的年轻王子。",
    "experiences": [
      {
        "date": "8288",
        "title": "送往伊伦伍德寄养",
        "description": "为弥补奥柏伦决斗杀死前任伊伦伍德伯爵的过节，被道朗亲王送往伊伦伍德堡充当养子侍从。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Quentyn_Martell",
        "participantIds": [
          "agot:Martell_4"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Quentyn_Martell",
      "https://asoiaf.fandom.com/zh/wiki/Quentyn_Martell"
    ]
  },
  "agot:Martell_11": {
    "characterId": "agot:Martell_11",
    "summary": "道朗亲王幼子。年幼懵懂，性格温和乖巧纯真，常年在流水花园的喷泉与柑橘林间无忧无虑玩耍戏水，深受仆从喜爱。",
    "publicRoles": [
      "多恩幼子王子"
    ],
    "aliases": [
      "崔斯丹王子"
    ],
    "appearance": "面容清秀俊朗，留着多恩人典型的柔顺黑卷发与清亮眼睛，衣着轻快华丽。",
    "personality": "天真单纯，性情温柔；对宫廷权谋一无所知，深受侍从与宫廷侍女们的喜爱。",
    "reputation": "流水花园里备受呵护的小王子。",
    "experiences": [
      {
        "date": "8287",
        "title": "降生阳戟城",
        "description": "作为道朗亲王最小的孩子在阳戟城诞生。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Trystane_Martell",
        "participantIds": [
          "agot:Martell_4"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Trystane_Martell",
      "https://asoiaf.fandom.com/zh/wiki/Trystane_Martell"
    ]
  },
  "agot:Uller_6": {
    "characterId": "agot:Uller_6",
    "summary": "地狱修道院哈曼·乌勒伯爵的私生女，奥柏伦·马泰尔亲王毕生挚爱的伴侣。性格狂野坦荡，与奥柏伦共同育有四位年幼的沙蛇女儿。",
    "publicRoles": [
      "多恩贵妇",
      "亲王情妇"
    ],
    "aliases": [
      "艾拉莉亚"
    ],
    "appearance": "相貌虽然并非传统绝美但极具异域风情与野性吸引力，黑发浓密，眼神深邃多情，举止奔放从容。",
    "personality": "崇尚自由与真爱，痛恨毫无意义的战争与杀戮；在狂野外表下拥有极其清醒仁慈的母性内心。",
    "reputation": "多恩公认深受奥柏伦亲王专宠的非凡女人，在阳戟城享有崇高地位。",
    "experiences": [
      {
        "date": "8290",
        "title": "与奥柏伦结为终生伴侣",
        "description": "不顾世俗私生子名分偏见，公开作为奥柏伦的终生正伴侣出入多恩王廷与流水花园。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Ellaria_Sand",
        "participantIds": [
          "agot:Martell_8"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Martell_8",
        "kind": "至爱亲王伴侣",
        "description": "两人心心相印，共同享受生命自由与激情，情深意笃。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Oberyn_Martell"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Ellaria_Sand",
      "https://asoiaf.fandom.com/zh/wiki/Ellaria_Sand"
    ]
  },
  "agot:Martell_12": {
    "characterId": "agot:Martell_12",
    "summary": "‘沙蛇’长女，奥柏伦·马泰尔与旧镇妓女所生。性格凶悍刚烈，精通长矛、短鞭与马术，以男子自居，热切渴望为父亲向兰尼斯特开战。",
    "publicRoles": [
      "沙蛇长女",
      "多恩女战士"
    ],
    "aliases": [
      "大沙蛇"
    ],
    "appearance": "身材高大粗壮无甚姿色，面容线条硬朗紧绷，黑发杂乱挽起，身穿粗糙皮甲，随身携带长矛与带刺皮鞭。",
    "personality": "狂暴凶猛，好勇斗狠；崇尚纯粹的杀戮与复仇，行事雷厉风行，极度鄙视软弱妥协。",
    "reputation": "多恩全境最剽悍善战的女杀手战士，令多恩守军将领敬畏三分。",
    "experiences": [
      {
        "date": "8272",
        "title": "选择长矛随父",
        "description": "幼年在母亲哭泣争夺时毅然选择父亲扔在脚下的长矛，从此跟随奥柏伦受训成长为冷酷战士。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Obara_Sand",
        "participantIds": [
          "agot:Martell_8"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Obara_Sand",
      "https://asoiaf.fandom.com/zh/wiki/Obara_Sand"
    ]
  },
  "agot:Martell_13": {
    "characterId": "agot:Martell_13",
    "summary": "‘沙蛇’次女，奥柏伦·马泰尔与瓦兰提斯贵妇所生。容貌高贵冷艳，精通暗器飞刀与宫廷礼仪，举止优雅迷人但暗藏致命杀机。",
    "publicRoles": [
      "沙蛇次女",
      "贵族名媛刺客"
    ],
    "aliases": [
      "娜姆夫人"
    ],
    "appearance": "身材修长高挑，黑发编成长辫，皮肤白皙，深黑眼眸冷艳逼人，裙下藏着数十把淬毒精钢飞刀。",
    "personality": "优雅沉静，阴狠毒辣；言语温和得体但杀伐极其决绝，擅长在贵族社交中无形夺人性命。",
    "reputation": "多恩贵族公认最优雅危险的绝色毒蝎美人。",
    "experiences": [
      {
        "date": "8279",
        "title": "受教厄索斯宫廷",
        "description": "随生母接受了自由城邦瓦兰提斯最高等贵族礼仪与暗杀技艺教导后返回多恩。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Nymeria_Sand",
        "participantIds": [
          "agot:Martell_8"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Nymeria_Sand",
      "https://asoiaf.fandom.com/zh/wiki/Nymeria_Sand"
    ]
  },
  "agot:Martell_14": {
    "characterId": "agot:Martell_14",
    "summary": "‘沙蛇’三女，奥柏伦·马泰尔与修女所生。外表纯洁圣洁如修女，实则深谙世间各种致命剧毒与草药学，手段极其阴毒致命。",
    "publicRoles": [
      "沙蛇三女",
      "药剂与毒物大师"
    ],
    "aliases": [
      "白蛇特蕾妮"
    ],
    "appearance": "金发如瀑，大蓝眼睛清澈纯真无邪，面容甜美娇弱，常穿圣洁素雅的修女长袍，袖中藏着剧毒金针与药瓶。",
    "personality": "外表乖巧柔顺，内心毒如蛇蝎；最擅长用人畜无害的天真微笑麻痹对手并将其无声鸩杀。",
    "reputation": "多恩上下深知其致命毒术的狠角色，被称为‘最甜美也最危险的沙蛇’。",
    "experiences": [
      {
        "date": "8279",
        "title": "研习草药与毒物",
        "description": "跟随奥柏伦研习古籍中记载的数百种剧毒配方，调制出无色无味的致命毒剂。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Tyene_Sand",
        "participantIds": [
          "agot:Martell_8"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Martell_9",
        "kind": "莫逆之交堂姐",
        "description": "与亚莲恩大公主形影不离，是亚莲恩最信赖的心腹智囊。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Arianne_Martell"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Tyene_Sand",
      "https://asoiaf.fandom.com/zh/wiki/Tyene_Sand"
    ]
  },
  "agot:Greyjoy_5": {
    "characterId": "agot:Greyjoy_5",
    "summary": "派克岛收割者、铁群岛大王兼盐王与岩王。死硬信奉铁民古道‘强取胜于苦耕’，曾掀起叛乱称王被劳勃击溃，十年来在海崖孤城暗中窥伺重起战端的时机。",
    "publicRoles": [
      "派克岛收割者",
      "铁群岛领主"
    ],
    "aliases": [
      "巴隆九世",
      "铁岛大王"
    ],
    "appearance": "身材高瘦佝偻，面容枯干如风化岩石，灰白乱发垂落，双眼阴冷如灰色坚冰，身披粗糙海豹皮斗篷。",
    "personality": "狂妄顽固，执拗残忍；对大陆安达尔人文明充满仇视，一心恢复铁民四处烧杀劫掠的古老荣耀。",
    "reputation": "七大王国眼中死不悔改的叛逆海盗王，铁群岛狂热信徒的暴戾首领。",
    "experiences": [
      {
        "date": "8289",
        "title": "掀起铁群岛叛乱",
        "description": "自立为铁群岛之王发动叛变，烧毁兰尼斯特舰队，后遭劳勃与史塔克联军合围攻破派克城屈膝归降。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Balon_Greyjoy",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Stark_3",
          "agot:Greyjoy_14"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Balon_Greyjoy",
      "https://asoiaf.fandom.com/zh/wiki/Balon_Greyjoy"
    ]
  },
  "agot:Greyjoy_14": {
    "characterId": "agot:Greyjoy_14",
    "summary": "巴隆·葛雷乔伊仅存的幼子兼派克岛法定继承人。十年前作为人质被带回临冬城抚养，在史塔克家中锦衣玉食受教，性格浮华骄傲但内心极度缺乏归属感。",
    "publicRoles": [
      "派克岛继承人",
      "临冬城贵族人质兼侍从"
    ],
    "aliases": [
      "席恩王子"
    ],
    "appearance": "身材修长匀称，黑发微卷，面容英俊且常带有一丝轻浮嘲弄的微笑，箭术超群，身着华美北方丝缎与皮衣。",
    "personality": "虚荣傲慢，渴望被认可；内心常年在铁民狂暴血脉与临冬城养育之恩间撕裂摇摆，极度缺乏安全感。",
    "reputation": "临冬城内外箭术第一的帅气侍从，但北境老人常戒备其叛逆铁种血统。",
    "experiences": [
      {
        "date": "8289",
        "title": "作为人质入质临冬城",
        "description": "在葛雷乔伊叛乱平定后被艾德·史塔克带离铁群岛，作为保证巴隆恭顺的政治人质抚养。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Theon_Greyjoy",
        "participantIds": [
          "agot:Stark_3",
          "agot:Greyjoy_5"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Stark_6",
        "kind": "并肩成长的挚友兄弟",
        "description": "视罗柏为唯一的知心兄弟，甘愿为罗柏执旗冲锋。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Robb_Stark"
      },
      {
        "targetId": "agot:Stark_3",
        "kind": "敬畏的养父兼处刑威胁者",
        "description": "奈德虽然待其如子但席恩始终知晓若生父再反自己将被奈德依法斩首。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Eddard_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Theon_Greyjoy",
      "https://asoiaf.fandom.com/zh/wiki/Theon_Greyjoy"
    ]
  },
  "agot:Greyjoy_13": {
    "characterId": "agot:Greyjoy_13",
    "summary": "巴隆·葛雷乔伊的长女与黑风号船长，自幼随长船出海，熟悉航海、掠袭与飞斧。她凭实际能力在轻视女性的铁民社会中赢得一席之地。",
    "publicRoles": [
      "黑风号船长",
      "铁群岛女战士"
    ],
    "aliases": [
      "阿莎"
    ],
    "appearance": "身材高挑矫健如母豹，黑发短促利落，面容英气勃勃，双眼锐利如刀，腰间常插两柄沉重飞斧。",
    "personality": "大胆直率，善于在粗野玩笑与强硬姿态之间掌握主动；富有船长的判断力，也清楚铁民对女性领袖的成见。",
    "reputation": "以善于航海、敢于亲自登船作战和治下船员服从命令闻名，是铁群岛少见的女性船长。",
    "experiences": [
      {
        "date": "8294",
        "title": "掌舵黑风号远洋掠夺",
        "description": "十六岁获赐长船黑风号，率领亡命海盗转战落日之海屡立奇功树立威名。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Asha_Greyjoy",
        "participantIds": [
          "agot:Greyjoy_5"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Harlaw_9",
        "kind": "睿智博学的二舅",
        "description": "读书人罗德利克是阿莎最信任的幕后顾问与家族亲人。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Rodrik_Harlaw"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Asha_Greyjoy",
      "https://asoiaf.fandom.com/zh/wiki/Asha_Greyjoy"
    ]
  },
  "agot:Greyjoy_6": {
    "characterId": "agot:Greyjoy_6",
    "summary": "宁静号船长与遭放逐的铁群岛亲王，因侵犯弟媳而被巴隆逐出群岛。此后在远海劫掠，并散布自己到过瓦雷利亚等危险海域的说法。",
    "publicRoles": [
      "宁静号船长",
      "流亡海盗王"
    ],
    "aliases": [
      "鸦眼",
      "疯子攸伦"
    ],
    "appearance": "相貌英俊却透着邪异，黑发如鸦羽，左眼戴着皮眼罩，右眼呈狂热深蓝，嘴唇因常年饮用夜影之水而泛出诡异深蓝幽光。",
    "personality": "冷酷大胆，擅长以神秘传闻和不可预测的暴力震慑他人；对禁忌知识抱有兴趣，但其远航经历多来自本人宣称。",
    "reputation": "以残忍、冒险和船上水手皆被割去舌头而令人畏惧；关于其远航收获与巫术经历的说法真假难辨。",
    "experiences": [
      {
        "date": "8289",
        "title": "策划火烧兰尼斯特舰队",
        "description": "在葛雷乔伊叛乱初期亲自谋划并率长船突袭兰尼斯港，纵火将泰温·兰尼斯特的整支舰队焚毁在锚地。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Euron_Greyjoy",
        "participantIds": [
          "agot:Greyjoy_5",
          "agot:Greyjoy_7",
          "agot:Lannister_1"
        ]
      },
      {
        "date": "8297",
        "title": "遭巴隆放逐流亡深海",
        "description": "因通奸丑闻遭兄长下令放逐，乘宁静号拔锚扬帆消失在落日之海深处。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Euron_Greyjoy",
        "participantIds": [
          "agot:Greyjoy_5",
          "agot:Greyjoy_7"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Euron_Greyjoy",
      "https://asoiaf.fandom.com/zh/wiki/Euron_Greyjoy"
    ]
  },
  "agot:Greyjoy_7": {
    "characterId": "agot:Greyjoy_7",
    "summary": "铁舰队总司令，巴隆·葛雷乔伊二弟。身穿全套精钢重铠跳帮作战的铁民无敌猛将，恪守淹神古道与服从兄长号令，勇猛无比但在政治谋略上极其呆板。",
    "publicRoles": [
      "铁舰队总司令",
      "派克岛统帅"
    ],
    "aliases": [
      "铁舰队总司令"
    ],
    "appearance": "身材高大粗壮如公牛，满头灰发，满脸风霜皱纹，常年披挂重达几十斤的带刺全覆式板甲与巨盾战斧。",
    "personality": "虔诚刚毅，死板忠勇；恪守淹神教义与铁民秩序，极重武力威仪，脑筋固执缺乏变通。",
    "reputation": "铁群岛公认海上接舷战第一猛将，铁舰队所有铁民战士最畏服的长官。",
    "experiences": [
      {
        "date": "8289",
        "title": "仙民岛海战惨败",
        "description": "在葛雷乔伊叛乱海战中指挥铁舰队遭遇史坦尼斯王家舰队伏击合围，损失惨重但凭借一身重铠血战脱险。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Victarion_Greyjoy",
        "participantIds": [
          "agot:Baratheon_3",
          "agot:Greyjoy_5"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Victarion_Greyjoy",
      "https://asoiaf.fandom.com/zh/wiki/Victarion_Greyjoy"
    ]
  },
  "agot:Greyjoy_9": {
    "characterId": "agot:Greyjoy_9",
    "summary": "淹神最高祭司，巴隆·葛雷乔伊幼弟。年轻时荒唐好酒，在仙民岛海难溺水被冲上海滩后自称得淹神启示重生，从此身披海草披发赤足，以狂热布道震慑铁岛。",
    "publicRoles": [
      "淹神先知",
      "淹神主祭"
    ],
    "aliases": [
      "湿发伊伦"
    ],
    "appearance": "身材枯瘦高大，黑发杂乱如海草般长垂至腰际且编入发丝海草，身着破烂粗麻布袍，赤足行走岩石海岸，目光狂热幽深。",
    "personality": "狂热虔诚，清心寡欲；不近女色不饮美酒只饮海水，将整个人生奉献给淹神的潮汐与古道圣战。",
    "reputation": "铁群岛上下顶礼膜拜的圣者与活先知，其口中所念淹神圣谕能轻易煽动全岛民众。",
    "experiences": [
      {
        "date": "8289",
        "title": "溺水获救皈依淹神",
        "description": "在仙民岛海难中战舰沉没溺死重生，从此顿悟神启，成为铁群岛最具威望的淹神先知。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Aeron_Greyjoy",
        "participantIds": [
          "agot:Greyjoy_5",
          "agot:Greyjoy_7"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Aeron_Greyjoy",
      "https://asoiaf.fandom.com/zh/wiki/Aeron_Greyjoy"
    ]
  },
  "agot:Harlaw_9": {
    "characterId": "agot:Harlaw_9",
    "summary": "哈劳岛十塔城伯爵，铁群岛最富庶显赫的诸侯领袖。酷爱搜集古籍与读书思考，在崇尚武力的铁群岛独树一帜，是铁民中罕见的明智长者。",
    "publicRoles": [
      "十塔城伯爵",
      "哈劳家族族长"
    ],
    "aliases": [
      "读书人罗德利克"
    ],
    "appearance": "身材高瘦文雅，满头银发，目光深邃睿智，鼻梁上偶尔架着老花镜，身着精致而低调的黑色羊毛长袍。",
    "personality": "博学理智，务实清醒；深知铁群岛落后封闭的弊端，反对盲目侵略大陆，酷爱哲学与历史典籍。",
    "reputation": "铁群岛唯一因嗜书如命被称为‘读书人’的异类智者伯爵，受各岛诸侯普遍敬重。",
    "experiences": [
      {
        "date": "8289",
        "title": "痛失爱子稳守十塔城",
        "description": "在葛雷乔伊叛乱中失去两名长子，从此更加坚信盲目劫掠战争乃自取灭亡之道。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Rodrik_Harlaw",
        "participantIds": [
          "agot:Greyjoy_5"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Greyjoy_13",
        "kind": "最关爱的外甥女",
        "description": "视阿莎为自己家族未来的希望，常年在十塔城为其提供军费与明智指引。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Asha_Greyjoy"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Rodrik_Harlaw",
      "https://asoiaf.fandom.com/zh/wiki/Rodrik_Harlaw"
    ]
  },
  "agot:Mormont_2": {
    "characterId": "agot:Mormont_2",
    "summary": "守夜人军团第997任总司令，原熊岛伯爵。为让位给儿子乔拉而自愿披上黑衣北上长城，以铁腕治军、坚毅威严维系着衰微军团的最后尊严与防线。",
    "publicRoles": [
      "守夜人军团总司令",
      "前熊岛伯爵"
    ],
    "aliases": [
      "熊老"
    ],
    "appearance": "身材极其魁梧强壮，白发苍苍，秃顶，留着如大扫帚般的浓密白须，肩头常年停着一只会说话的黑羽老渡鸦。",
    "personality": "刚毅坚毅，公正严明；深通军务与长城局势，将全部心血倾注于守卫生者疆界，威严而富长者关怀。",
    "reputation": "绝境长城军民上下共同爱戴敬畏的最高领袖与不朽长城支柱。",
    "experiences": [
      {
        "date": "8288",
        "title": "当选守夜人总司令",
        "description": "凭借在军团中的卓越威望被全体黑衣守夜人兄弟推选为第997任总司令官。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jeor_Mormont",
        "participantIds": [
          "agot:Targaryen_120",
          "agot:Stark_4"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Targaryen_120",
        "kind": "倚重的智者长者",
        "description": "遇有军团重大难题必向伊蒙学士求教，两人维系着黑城堡数十年稳定。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Aemon"
      },
      {
        "targetId": "agot:Stark_4",
        "kind": "最信任的巡逻先锋",
        "description": "将塞外最关键的侦察任务全权托付给班扬·史塔克。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Benjen_Stark"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Jeor_Mormont",
      "https://asoiaf.fandom.com/zh/wiki/Jeor_Mormont"
    ]
  },
  "agot:Targaryen_120": {
    "characterId": "agot:Targaryen_120",
    "summary": "黑城堡驻城学士，坦格利安王朝戴隆二世之孙。百岁高龄，双目失明，曾主动放弃铁王座继承权披上黑衣北上长城，侍奉守夜人六十余载，是维斯特洛最古老的活历史。",
    "publicRoles": [
      "守夜人学士",
      "真龙宗亲亲王"
    ],
    "aliases": [
      "伊蒙学士",
      "盲眼伊蒙"
    ],
    "appearance": "年逾百岁，身形枯槁如干瘪果核，满头雪白细丝，双眼覆着白翳失明，身披质朴泛白的宽大黑袍。",
    "personality": "睿智仁慈，平静超然；早已看透世俗权力浮华，全心守护守夜人誓言与长夜传说中的古老秘密。",
    "reputation": "绝境长城内外所有游骑兵、平民乃至诸侯由衷敬仰的活圣贤。",
    "experiences": [
      {
        "date": "8233",
        "title": "拒绝铁王座北上长城",
        "description": "在御前会议意欲拥立其为七国之王时坚辞不受，主动前往绝境长城加入守夜人以让位其弟伊耿五世。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Aemon",
        "participantIds": []
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Mormont_2",
        "kind": "辅佐的总司令",
        "description": "以近百年的学识与政治远见辅佐莫尔蒙总司令治理绝境长城。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jeor_Mormont"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Aemon",
      "https://asoiaf.fandom.com/zh/wiki/Aemon_(son_of_Maekar_I)"
    ]
  },
  "agot:Tarly_2": {
    "characterId": "agot:Tarly_2",
    "summary": "角陵蓝道·塔利伯爵长子与继承人。体态肥胖，不喜武艺与狩猎，却博览群书、记忆力出众；温和怯懦的性格使他长期承受父亲的失望与严厉管束。",
    "publicRoles": [
      "角陵继承人"
    ],
    "aliases": [
      "山姆"
    ],
    "appearance": "体型异常肥胖如巨型酒桶，圆脸多肉，面色苍白，眼神怯弱恐慌，身着宽大厚重的黑布长袍。",
    "personality": "胆小自卑，善良诚恳；嗜书如命，富有同理心与求知欲，在逆境中展现出罕见的忠诚与坚韧内心。",
    "reputation": "在角陵以不擅武艺和酷爱读书闻名，常被父亲与武人轻视，但熟悉历史、家谱、地图和诸多学术知识。",
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Samwell_Tarly",
      "https://asoiaf.fandom.com/zh/wiki/Samwell_Tarly"
    ]
  },
  "agot:Thorne_3": {
    "characterId": "agot:Thorne_3",
    "summary": "黑城堡新兵总教头，王领前坦格利安效忠派骑士。篡夺者战争后被逼发配绝境长城，性格刻薄阴鸷、手段严苛残忍，专门负责折磨训练新兵。",
    "publicRoles": [
      "黑城堡教头",
      "守夜人骑士"
    ],
    "aliases": [
      "艾里沙爵士"
    ],
    "appearance": "身材精瘦削挺，黑发染灰，目光刻毒如蛇蝎，薄唇常挂嘲讽冷笑，身穿洗得泛白的黑色锁甲。",
    "personality": "尖酸刻薄，充满怨恨；对自身流放遭遇满腔怒火，极力用言语羞辱与皮鞭折磨新兵来宣泄怨念。",
    "reputation": "黑城堡新兵闻风丧胆的恶毒教头，在老兵中亦极不讨人喜欢。",
    "experiences": [
      {
        "date": "8283",
        "title": "君临被俘流放长城",
        "description": "作为王室守军在君临陷落后被泰温·兰尼斯特俘获，在斩首与长城黑衣之间被迫选择前往绝境长城。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Alliser_Thorne",
        "participantIds": [
          "agot:Lannister_1"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Alliser_Thorne",
      "https://asoiaf.fandom.com/zh/wiki/Alliser_Thorne"
    ]
  },
  "agot:Shadow_Tower_1": {
    "characterId": "agot:Shadow_Tower_1",
    "summary": "影子塔首席游骑兵指挥官。常年在塞外极北雪峰与野人死战，右手除两指外皆被野人斧头削断，改练左手剑后剑法更臻化境，是塞外野人最敬畏的黑衣死神。",
    "publicRoles": [
      "影子塔游骑兵统领",
      "传奇游骑兵"
    ],
    "aliases": [
      "断掌科林"
    ],
    "appearance": "身材高大精瘦如铁桩，黑发灰眼，下巴剃得精光，残缺的右手戴着厚皮手套，浑身散发着冰原野兽般的警觉。",
    "personality": "冷酷刚毅，牺牲精神至高无上；视守夜人誓言高于一切个人生死荣誉，一切决断皆为击败异族守护长城。",
    "reputation": "长城外野人部落中人人闻名胆寒的游骑兵战神，守夜人战士心中的活传奇。",
    "experiences": [
      {
        "date": "8280",
        "title": "断掌重生苦练左手剑",
        "description": "在霜雪之牙遭遇野人精锐伏击，右手三指被削断后以惊人毅力改练左手重剑，武艺更胜从前。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Qhorin_Halfhand",
        "participantIds": []
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Mallister_6",
        "kind": "效忠的影子塔指挥官",
        "description": "丹尼斯·梅利斯特爵士麾下最无可替代的前线尖刀重臣。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Denys_Mallister"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Qhorin_Halfhand",
      "https://asoiaf.fandom.com/zh/wiki/Qhorin_Halfhand"
    ]
  },
  "agot:Marsh_5": {
    "characterId": "agot:Marsh_5",
    "summary": "守夜人军团首席事务官。颈泽名门出身，精通算术、粮秣调配与后勤储备，恪守军团条例，在莫尔蒙总司令麾下总管长城各要塞物资运转。",
    "publicRoles": [
      "守夜人首席事务官"
    ],
    "aliases": [
      "波文大人",
      "老石榴"
    ],
    "appearance": "身材圆滚微胖，红扑扑的面庞如熟透石榴，留着稀疏棕须，常年在黑城堡库房翻阅厚重账簿与清单。",
    "personality": "刻板严谨，按部就班；极度重视军粮储备与规章制度，对超出规制的冒险行为持坚决反对态度。",
    "reputation": "守夜人军团无可替代的优秀大管家，以严守库房底线著称。",
    "experiences": [
      {
        "date": "8292",
        "title": "统筹全长城补给防务",
        "description": "在长夜将至寒冬逼近前，以高超算术重新整肃十九座要塞废墟与黑城堡全部粮秣配额。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Bowen_Marsh",
        "participantIds": [
          "agot:Mormont_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Mormont_2",
        "kind": "辅佐的总司令",
        "description": "尽忠职守协助总司令管理后勤与城堡内务。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jeor_Mormont"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Bowen_Marsh",
      "https://asoiaf.fandom.com/zh/wiki/Bowen_Marsh"
    ]
  },
  "agot:Eastwatch_By_The_Sea_1": {
    "characterId": "agot:Eastwatch_By_The_Sea_1",
    "summary": "东海望指挥官，铁群岛私生子出身。性情粗暴野蛮、精通海战航运，统领守夜人仅存的战船巡弋海豹湾，常年捕杀走私犯与塞外野人。",
    "publicRoles": [
      "东海望指挥官",
      "守夜人海军统帅"
    ],
    "aliases": [
      "卡特·派克大人"
    ],
    "appearance": "身材精瘦硬朗，相貌粗陋凶悍，长着铁民典型的硬脸与断齿，长年身着海盐浸渍的防潮皮甲与黑斗篷。",
    "personality": "粗暴凶悍，直来直去；讨厌繁文缛节与贵族虚礼，在海上指挥果决狠辣。",
    "reputation": "东海望黑衣水手与游骑兵畏服的强悍首领，海豹湾走私者的克星。",
    "experiences": [
      {
        "date": "8285",
        "title": "出任东海望指挥官",
        "description": "凭借出色的铁民航海武艺被推举为东海望要塞指挥官，统领守夜人战船防线。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Cotter_Pyke",
        "participantIds": [
          "agot:Mormont_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Mallister_6",
        "kind": "针锋相对的竞争对手",
        "description": "与影子塔的贵族老将丹尼斯·梅利斯特互相看不起，常年因军费调配产生摩擦争吵。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Denys_Mallister"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Cotter_Pyke",
      "https://asoiaf.fandom.com/zh/wiki/Cotter_Pyke"
    ]
  },
  "agot:Mallister_6": {
    "characterId": "agot:Mallister_6",
    "summary": "影子塔指挥官，海疆城老梅利斯特伯爵之弟。三十年来镇守绝境长城西段峡谷天堑，贵族风范高雅、威严沉稳，在守夜人军团享有崇高威望。",
    "publicRoles": [
      "影子塔指挥官",
      "资深守夜人骑士"
    ],
    "aliases": [
      "丹尼斯爵士"
    ],
    "appearance": "身材高大削瘦挺拔，满头银发修剪整齐，蓝眼睛温和清亮，身披质地极佳的厚重纯黑丝绒披风与洗得发亮的精钢甲。",
    "personality": "温文尔雅，严正自律；恪守传统贵族骑士道，治军严明得体，极具大局观与外交风度。",
    "reputation": "守夜人军团中最具贵族威仪与长者声望的资深统帅之一。",
    "experiences": [
      {
        "date": "8267",
        "title": "受命镇守影子塔",
        "description": "三十年前接管长城最西端的险隘影子塔，数十年如一日挡住野人翻越峭壁峡谷的一切进攻。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Denys_Mallister",
        "participantIds": [
          "agot:Mormont_2"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Shadow_Tower_1",
        "kind": "倚重的首席游骑兵",
        "description": "对断掌科林的骁勇与忠诚深信不疑，全权托付其前线巡逻重任。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Qhorin_Halfhand"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Denys_Mallister",
      "https://asoiaf.fandom.com/zh/wiki/Denys_Mallister"
    ]
  },
  "agot:Rayder_1": {
    "characterId": "agot:Rayder_1",
    "summary": "塞外之王，前守夜人军团精锐游骑兵。因厌恶黑衣戒律叛出长城，凭借非凡武艺、鲁特琴歌声与王者魅力将数百个水火不容的野人部落统一为庞大大军。",
    "publicRoles": [
      "塞外之王",
      "守夜人叛誓者"
    ],
    "aliases": [
      "塞外之王",
      "吟游诗人曼斯"
    ],
    "appearance": "相貌平平、中等身材，灰发蓬乱，眼神敏锐机警带笑，身穿缝补着红色丝绸破布的褪色黑斗篷。",
    "personality": "崇尚自由，极富个人魅力与谋略；热爱诗歌与音乐，并非盲目嗜杀之辈，旨在带领十万自由民南渡长城逃避远古凛冬严寒。",
    "reputation": "绝境长城黑衣军团眼中的头号叛徒大敌，塞外数十万自由民共同拥戴的传奇王者。",
    "experiences": [
      {
        "date": "8288",
        "title": "叛离守夜人军团",
        "description": "在塞外巡逻负伤被野人妇女用红丝绸缝补黑斗篷后，因抗拒长官责令换掉斗篷而决然翻越长城投奔自由民。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Mance_Rayder",
        "participantIds": []
      },
      {
        "date": "8295",
        "title": "击败野人诸酋加冕塞外之王",
        "description": "在霜雪之牙与瑟恩高地先后击败马格拿与托蒙德等强悍酋长，以琴声与武力统一塞外诸部。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Mance_Rayder",
        "participantIds": []
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Mormont_2",
        "kind": "对抗的旧日总司令",
        "description": "昔日曾是莫尔蒙麾下最优秀的游骑兵之一，如今成为长城两端殊死博弈的统帅对手。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jeor_Mormont"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Mance_Rayder",
      "https://asoiaf.fandom.com/zh/wiki/Mance_Rayder"
    ]
  },
  "agot:Lowborn_Wildling_1": {
    "characterId": "agot:Lowborn_Wildling_1",
    "summary": "塞外自由民女矛妇。长着被野人视为鸿运当头的火红头发，擅长弓箭与雪地伏击，性格泼辣狂野、向往真正的自由与南方的温暖土地。",
    "publicRoles": [
      "自由民女矛妇",
      "斥候神射手"
    ],
    "aliases": [
      "火吻而生",
      "红发耶哥蕊特"
    ],
    "appearance": "身材娇小矫健，一头如烈火般蓬乱卷曲的火红长发，雀斑小脸，牙齿洁白微斜，身披厚重海豹皮与粗劣皮甲，手握硬木短弓。",
    "personality": "野性难驯，热情泼辣；崇尚自由与爱情，蔑视南方人虚伪的贵族跪拜礼节，口头禅为‘你什么都不懂’。",
    "reputation": "塞外自由民中箭法最刁钻机敏的年轻女矛妇。",
    "experiences": [
      {
        "date": "8295",
        "title": "加入曼斯大军斥候队",
        "description": "追随曼斯·雷德集结南征，担任穿梭于峡谷密林中的先锋斥候射手。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Ygritte",
        "participantIds": [
          "agot:Rayder_1"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Rayder_1",
        "kind": "追随的塞外之王",
        "description": "坚定追随曼斯跨越长城寻求生路。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Mance_Rayder"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Ygritte",
      "https://asoiaf.fandom.com/zh/wiki/Ygritte"
    ]
  },
  "agot:Targaryen_8": {
    "characterId": "agot:Targaryen_8",
    "summary": "坦格利安王朝的流亡王子，自称铁王座合法继承人。家族覆灭后辗转东大陆诸城邦，长期依靠旧日支持者与富商接济，性格日益暴躁偏执。",
    "publicRoles": [
      "流亡真龙合法继承人",
      "自封七国之王"
    ],
    "aliases": [
      "乞丐王",
      "唤醒真龙者"
    ],
    "appearance": "身材瘦削挺拔，留着坦格利安标志性的银金色长发，浅紫色眼眸中闪烁着狂躁不安的神经质光芒，衣衫华贵但磨损严重。",
    "personality": "残暴狂躁，傲慢自大；在长年流亡屈辱中精神日渐扭曲偏执，动辄以‘唤醒真龙之怒’虐待威吓妹妹丹妮莉丝。",
    "reputation": "厄索斯自由城邦权贵酒宴间被当做笑柄的落魄‘乞丐王’。",
    "experiences": [
      {
        "date": "8283",
        "title": "逃离君临避难龙石岛",
        "description": "在篡夺者战争末期由母亲蕾拉王后带离君临避难龙石岛，在王室倾覆后开始了颠沛流离的流亡生涯。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Viserys_Targaryen",
        "participantIds": [
          "agot:Targaryen_9"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Mopatis_1",
        "kind": "赞助商人与野心合伙人",
        "description": "依附于伊利里欧的豪宅与财富，对其虚假承诺深信不疑。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Illyrio_Mopatis"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Viserys_Targaryen",
      "https://asoiaf.fandom.com/zh/wiki/Viserys_Targaryen"
    ]
  },
  "agot:Mormont_3": {
    "characterId": "agot:Mormont_3",
    "summary": "熊岛前伯爵兼流亡骑士，杰奥·莫尔蒙独子。因贩卖偷猎者为奴而逃离维斯特洛，在厄索斯辗转担任佣兵，熟悉狭海两岸的道路与势力。",
    "publicRoles": [
      "流亡骑士",
      "前熊岛领主",
      "佣兵"
    ],
    "aliases": [
      "乔拉爵士"
    ],
    "appearance": "身材高大结实粗壮，胸毛浓密如熊，发际线后退但体魄极其强悍，身披磨损严重的维斯特洛绿色锁甲与战袍。",
    "personality": "坚忍务实，熟悉战斗与流亡生活；对失去的领地和名誉怀有复杂悔意，也仍保留维斯特洛骑士的骄傲。",
    "reputation": "维斯特洛诸侯眼中畏罪潜逃的耻辱贩奴犯，厄索斯大陆经验丰富的老牌骑士雇佣兵。",
    "experiences": [
      {
        "date": "8289",
        "title": "派克城先锋立功受封骑士",
        "description": "在葛雷乔伊叛乱中跟随劳勃与奈德率先攻破派克城城墙立下奇功，由劳勃国王亲手册封为骑士。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jorah_Mormont",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Stark_3"
        ]
      },
      {
        "date": "8293",
        "title": "贩奴畏罪流亡狭海",
        "description": "为满足妻子琳妮丝的奢靡生活私贩偷猎者为奴，被奈德公爵追捕前夕携妻仓皇登船逃亡厄索斯。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Jorah_Mormont",
        "participantIds": [
          "agot:Stark_3"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Jorah_Mormont",
      "https://asoiaf.fandom.com/zh/wiki/Jorah_Mormont"
    ]
  },
  "agot:Mopatis_1": {
    "characterId": "agot:Mopatis_1",
    "summary": "潘托斯富商兼总督议会议员，经营香料、丝绸等跨海贸易，拥有庞大宅邸、船只与商业人脉。待客热情而精于算计，是自由贸易城邦中颇具影响力的权贵。",
    "publicRoles": [
      "潘托斯总督",
      "巨商权贵"
    ],
    "aliases": [
      "伊利里欧总督"
    ],
    "appearance": "身躯极其肥胖庞大，满头黄发，留着分叉的金黄色长须，十指戴满硕大宝石金戒，身披华美绚烂的东方丝绸长袍。",
    "personality": "圆滑精明，擅长以美食、礼物和恭维建立人情，也习惯把政治庇护与商业投资结合起来衡量得失。",
    "reputation": "潘托斯最富有且消息灵通的商人之一，狭海两岸许多流亡者、船主和权贵都与他保持往来。",
    "experiences": [
      {
        "date": "8279",
        "title": "与瓦里斯结盟发迹",
        "description": "年轻时在潘托斯与瓦里斯联手建立起遍布狭海的盗窃与情报网络，一跃成为富可敌国的城邦总督。",
        "visibility": "secret",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Illyrio_Mopatis",
        "participantIds": [
          "agot:Eunuch_1"
        ]
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Illyrio_Mopatis",
      "https://asoiaf.fandom.com/zh/wiki/Illyrio_Mopatis"
    ]
  },
  "agot:Brotherhood_8": {
    "characterId": "agot:Brotherhood_8",
    "summary": "来自自由城邦密尔的拉赫洛红袍僧兼劳勃国王的比武酒友。常年沉溺于烈酒与妓院，在比武场上手持浸泡野火燃烧的长剑冲锋夺冠，深得劳勃宠爱。",
    "publicRoles": [
      "红袍僧",
      "比武骑士",
      "宫廷酒友"
    ],
    "aliases": [
      "密尔的索罗斯",
      "红袍索罗斯"
    ],
    "appearance": "身材高大但因酗酒发福，一头杂乱黑发，常穿一件洗得发白褪色的油腻宽大红袍，腰间挂着大酒囊与长剑。",
    "personality": "豪爽不羁，嗜酒如命；早已将祭司清规戒律抛在脑后，但生性重义气，打起仗来悍不畏死狂热无比。",
    "reputation": "君临比武场与酒馆里的传奇狂僧，以挥舞烈火之剑劈开敌阵闻名。",
    "experiences": [
      {
        "date": "8282",
        "title": "出使君临传教",
        "description": "受密尔红神庙派遣前往君临试图感化疯王，失败后转而在劳勃朝廷中混迹成为比武冠军。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Thoros_of_Myr",
        "participantIds": [
          "agot:Baratheon_2"
        ]
      },
      {
        "date": "8289",
        "title": "手持火剑先登派克城",
        "description": "在葛雷乔伊叛乱攻城战中，挥舞燃烧的烈火宝剑第一个顺着城墙缺口杀入派克城立下头功。",
        "visibility": "public",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Thoros_of_Myr",
        "participantIds": [
          "agot:Baratheon_2",
          "agot:Stark_3"
        ]
      }
    ],
    "notableRelations": [
      {
        "targetId": "agot:Baratheon_2",
        "kind": "投契的国王酒友",
        "description": "经常陪伴劳勃畅饮狂欢，深受劳勃国王的恩宠与纵容。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Robert_I_Baratheon"
      },
      {
        "targetId": "agot:Dondarrion_2",
        "kind": "比武结识的莫逆之交",
        "description": "在君临多次比武盛会中与年轻的闪电伯爵贝里结下深厚骑士友谊。",
        "sourceUrl": "https://awoiaf.westeros.org/index.php/Beric_Dondarrion"
      }
    ],
    "sourceUrls": [
      "https://awoiaf.westeros.org/index.php/Thoros_of_Myr",
      "https://asoiaf.fandom.com/zh/wiki/Thoros_of_Myr"
    ]
  }
} as const;

export function getCharacterDossierSupplement(characterId: CharacterId | string | null | undefined): CharacterDossierSupplement | undefined {
  if (!characterId || typeof characterId !== 'string') return undefined;
  return CHARACTER_DOSSIER_SUPPLEMENTS[characterId as CharacterId];
}
