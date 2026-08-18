# -*- coding: utf-8 -*-
"""
Add 303 AC to the pure chronological timeline.
Covers the 1-year transition: Daenerys' Great Voyage, Euron building the Iron Fleet,
Arya meeting Hot Pie and Nymeria's wolf pack, Bran crossing the Wall,
Sam in Oldtown Citadel discovering dragonstone deposits and Rhaegar's legal marriage,
and healing Jorah Mormont's greyscale.
"""

import json
import os

def rebuild_with_303():
    with open('public/data/tv-timeline/westeros_chronological_timeline.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Define 303 AC
    year_303 = {
        "year_ac": 303,
        "year_title": "303 AC · 凛冬序曲：千帆远渡、全境备战与学城秘辛",
        "tagline": "千帆渡海跨越狭海，巨蝎弩暗铸红堡，学城古卷揭惊天秘辛，狼群重聚古道。",
        "overview": "这一年是维斯特洛暴风雨前夕的关键战略重组之年。丹妮莉丝率千艘战舰载十万大军与三龙历时数月横渡大洋；君临瑟曦四面楚歌，攸伦砍伐全岛建造一千艘无敌铁舰队并求婚瑟曦，科本研制反龙巨蝎弩；雪诺在北境推行全民练兵修缮长城防线；艾莉亚南下途中偶遇热派得知雪诺称王，勒马北返并重逢冰原狼娜梅莉亚庞大狼群；山姆在学城禁书区发现龙石岛龙晶宝藏与雷加合法婚姻记录，并冒死剥皮治愈乔拉灰鳞病！",
        "events": [
            {
                "id": "evt_303_02_10",
                "date_display": "303 AC · 2月中旬 (初春)",
                "title": "千帆大远航、巨蝎弩暗铸与攸伦造千舰",
                "category": "war",
                "category_name": "战前军备",
                "region": "狭海航道与君临红堡",
                "region_tag": "essos",
                "characters": ["丹妮莉丝·坦格利安", "提利昂·兰尼斯特", "瑟曦·兰尼斯特", "科本", "攸伦·葛雷乔伊"],
                "summary": "丹妮莉丝庞大船队历时数月横渡狭海大洋；瑟曦面临三面合围，攸伦建造千艘铁舰队进京求婚；科本研制反龙巨蝎弩。",
                "full_narrative": "丹妮莉丝率领由千艘战舰组成的庞大远征舰队，载着十万多斯拉克骑兵、八千无垢者军团以及并驾齐驱的三条成年巨龙，自厄斯索斯弥林港启航。横渡数千里大洋历时数月，船队途经瓦兰提斯海域与石阶群岛休整补给。君临城内，瑟曦面对北境自立、高庭多恩倒戈的绝境，任命科本为首相。科本在红堡地下龙骨地窖秘密测试研制出能够射穿巨龙颅骨的巨型精钢重弩——「巨蝎弩（Scorpion）」。铁群岛新王攸伦·葛雷乔伊倾全岛之力砍伐森林建造了一千艘无敌铁舰队，率舰队驶入黑水湾向瑟曦提亲，结成狼狮死敌同盟。",
                "key_consequences": ["丹妮莉丝大军逼近维斯特洛本土", "兰尼斯特获得攸伦无敌海上铁舰队盟友", "研制出克制巨龙的终极致命武器巨蝎弩"],
                "fatalities": [],
                "iconic_quote": "我手握一千艘战舰，还有一双健壮的双手……嫁给我，我为你荡平维斯特洛！ —— 攸伦·葛雷乔伊向瑟曦求婚"
            },
            {
                "id": "evt_303_05_15",
                "date_display": "303 AC · 5月中旬",
                "title": "艾莉亚客栈闻讯北返与重逢冰原狼群",
                "category": "intrigue",
                "category_name": "寻家与重逢",
                "region": "河间地·十字路口客栈与荒原森林",
                "region_tag": "riverlands",
                "characters": ["艾莉亚·史塔克", "热派", "冰原狼娜梅莉亚", "红袍僧兵团"],
                "summary": "艾莉亚南下君临刺杀瑟曦途中在客栈重逢热派，得知雪诺已光复临冬城称王，毅然勒马北返；途中遭遇已成为狼王的冰原狼娜梅莉亚。",
                "full_narrative": "艾莉亚单人匹马南下君临企图刺杀瑟曦。在十字路口客栈，艾莉亚偶遇昔日好友热派。热派为她烘烤了松软的狼头面包，并惊讶地告诉她：“你难道不知道吗？琼恩·雪诺在私生子之战中击败了波顿，现在他夺回了临冬城，被封为北境之王了！”听到雪诺和珊莎还活着并重掌家园，原本冷酷如冰的艾莉亚眼眶湿润，毫不犹豫地调转马头全速北上回乡。途中荒野篝火旁，成群的恶狼将艾莉亚包围，巨型狼王缓缓走近——正是她当年在红叉河忍痛赶走的冰原狼「娜梅莉亚」！娜梅莉亚认出了艾莉亚，舔了舔她的手，随后领着群狼傲然回归森林，艾莉亚微笑道：“那不是你（你已是属于荒野的自由狼王）。”",
                "key_consequences": ["艾莉亚放弃盲目刺杀瑟曦，重归史塔克核心阵营", "娜梅莉亚在河间地统领数百巨狼"],
                "fatalities": [],
                "iconic_quote": "那不是你 (That's not you) —— 艾莉亚向冰原狼娜梅莉亚微味道别"
            },
            {
                "id": "evt_303_08_20",
                "date_display": "303 AC · 8月下旬",
                "title": "学城禁书秘辛：龙晶宝藏、雷加合法婚礼与治愈灰鳞病",
                "category": "magic",
                "category_name": "历史真相与神迹",
                "region": "河湾地·旧镇学城与黑城堡",
                "region_tag": "reach",
                "characters": ["山姆威尔·塔利", "吉莉", "乔拉·莫尔蒙", "马尔温博士", "布兰·史塔克", "梅拉·黎德"],
                "summary": "山姆在学城禁书区发现龙石岛地底埋藏海量龙晶，并由吉莉发现雷加与莱安娜合法婚礼记录；山姆冒死剥皮治愈乔拉灰鳞病；布兰穿过长城大门抵北境。",
                "full_narrative": "山姆在旧镇学城禁书区盗取古老卷轴，发现龙石岛地下深处埋藏着整座海量的天然龙晶山脉，当即修书快马送往临冬城雪诺。吉莉在翻阅总主教梅纳德日记时念出一条惊天记录：“总主教为雷加·坦格利安王子在多恩合法废除了与伊莉亚的婚姻，并在同一天秘密主持了雷加与莱安娜·史塔克的合法大婚”——彻底证实琼恩·雪诺非私生子，而是王位第一正统顺位继承人！在隔离牢房，山姆不顾被感染驱逐的危险，用手术刀与药膏为全身石化的乔拉·莫尔蒙进行彻夜惨烈的剥皮除毒手术，创造医学神迹成功治愈乔拉。长城北端，布兰与梅拉穿过黑城堡冰闸大门，正式踏入北境境内。",
                "key_consequences": ["临冬城获知龙石岛龙晶藏量", "琼恩·雪诺正统合法身世在学城找到无可辩驳的铁证", "乔拉·莫尔蒙重获新生启程重投龙母"],
                "fatalities": [],
                "iconic_quote": "他叫伊耿·坦格利安。他不是私生子，他是七国铁王座唯一的合法继承人 —— 山姆与布兰的结论"
            },
            {
                "id": "evt_303_11_15",
                "date_display": "303 AC · 11月中旬",
                "title": "临冬城全民备战与全境战线结成",
                "category": "intrigue",
                "category_name": "全境同盟",
                "region": "北境·临冬城大厅",
                "region_tag": "north",
                "characters": ["琼恩·雪诺", "珊莎·史塔克", "莱安娜·莫尔蒙", "罗伊斯伯爵", "戴佛斯·席渥斯"],
                "summary": "雪诺在临冬城召开诸侯大会，下令十岁以上男女全员练习弓箭长矛，修缮卡林湾防御；雪诺收到山姆与龙母来信，决意南下龙石岛会盟。",
                "full_narrative": "凛冬的风声愈发凛冽。雪诺在临冬城大厅召开北境与谷地全体领主大会，宣布不分男女老幼，十岁以上所有人必须立即接受长矛与弓箭训练，并派出安柏与卡史塔克年轻家主加固最后壁炉城与卡霍城前哨防线。雪诺收到两封极其关键的渡鸦密信：一封来自学城山姆，报告龙石岛埋藏着能杀死异鬼的海量龙晶；另一封来自提利昂，代表刚刚抵达龙石岛的丹妮莉丝邀请北境之王赴海岛会盟。雪诺力排众议，将北境托付给珊莎摄政，决意与戴佛斯启程南下龙石岛！",
                "key_consequences": ["北境全面进入全民总动员战时状态", "促成琼恩·雪诺南下龙石岛与丹妮莉丝的历史性初遇"],
                "fatalities": [],
                "iconic_quote": "我不是为了王位南下，我是为了带回能够拯救我们所有人的龙晶！ —— 琼恩·雪诺"
            }
        ]
    }

    # Insert 303 AC between 302 and 304
    years_list = []
    for y in data["years"]:
        if y["year_ac"] == 304:
            years_list.append(year_303)
        years_list.append(y)

    data["years"] = years_list
    total_evts = sum(len(y["events"]) for y in data["years"])
    data["total_events"] = total_evts
    data["timeline_span"] = "298 AC 4月 — 305 AC 5月 (历时 7 年 1 个月 · 8 个年度全景编年)"

    out_file = 'public/data/tv-timeline/westeros_chronological_timeline.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Successfully integrated 303 AC! Total events now: {total_evts}")

if __name__ == '__main__':
    rebuild_with_303()
