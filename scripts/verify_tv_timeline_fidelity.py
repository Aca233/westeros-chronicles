# -*- coding: utf-8 -*-
"""
Verify fidelity of the timeline against HBO Game of Thrones canon.
"""
import json

def verify_timeline():
    with open('public/data/tv-timeline/westeros_chronological_timeline.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    print("=== TV Timeline Fidelity Verification ===")
    print(f"Title: {data['title']}")
    print(f"Calendar System: {data['calendar_system']}")
    print(f"Timeline Span: {data['timeline_span']}")
    print(f"Total Years: {len(data['years'])}")
    print(f"Total Events: {data['total_events']}")

    years = [y['year_ac'] for y in data['years']]
    print(f"Years Included: {years}")

    # Check key TV-exclusive plot points
    key_tv_checks = [
        ("Bran pushed by Jaime", False),
        ("Ned beheaded by Joffrey", False),
        ("Daenerys hatches 3 dragons", False),
        ("Shadow assassin kills Renly", False),
        ("Blackwater wildfire", False),
        ("Red Wedding Robb & Catelyn killed", False),
        ("Purple Wedding Joffrey poisoned", False),
        ("Oberyn head crushed by Mountain", False),
        ("Tyrion shoots Tywin on privy", False),
        ("Hardhome Night King raises dead", False),
        ("Jon Snow stabbed / resurrected", False),
        ("Hodor hold the door", False),
        ("Battle of the Bastards Ramsay fed to hounds", False),
        ("Cersei blows up Great Sept with wildfire", False),
        ("Tower of Joy reveals Jon is Rhaegar & Lyanna's son", False),
        ("Sam cures Jorah's greyscale in Citadel", False),
        ("Spoils of War Loot Train battle", False),
        ("Viserion killed by Night King and turned into ice dragon", False),
        ("Littlefinger executed by Arya at Winterfell", False),
        ("Eastwatch Wall breached by ice dragon", False),
        ("Jaime knights Brienne", False),
        ("Arya kills Night King with Valyrian dagger", False),
        ("Rhaegal shot down by Euron / Missandei beheaded", False),
        ("Dany burns King's Landing / Cleganebowl", False),
        ("Jon kills Dany, Drogon melts Iron Throne, Bran becomes King", False)
    ]

    all_text = ""
    for y in data['years']:
        for evt in y['events']:
            all_text += f" {evt['title']} {evt['summary']} {evt['full_narrative']} {' '.join(evt['fatalities'])}"

    verified_count = 0
    for idx, (check_item, _) in enumerate(key_tv_checks):
        keywords = {
            0: ["布兰", "残塔"],
            1: ["奈德", "斩首"],
            2: ["幼龙", "诞生"],
            3: ["暗影", "蓝礼"],
            4: ["黑水河", "野火"],
            5: ["血色婚礼", "罗柏"],
            6: ["紫色婚礼", "乔佛里"],
            7: ["奥柏伦", "碎颅"],
            8: ["泰温", "十字弓"],
            9: ["艰难屯", "复活"],
            10: ["复活", "雪诺"],
            11: ["阿多", "Hold the Door"],
            12: ["私生子之战", "恶犬"],
            13: ["贝勒圣堂", "野火"],
            14: ["极乐塔", "雷加"],
            15: ["剥皮", "灰鳞病"],
            16: ["怒火燎原", "车队"],
            17: ["韦赛利昂", "冰矛"],
            18: ["小指头", "割喉"],
            19: ["长城", "崩塌"],
            20: ["册封", "布蕾妮"],
            21: ["刺杀夜王", "艾莉亚"],
            22: ["雷哥", "弥桑黛"],
            23: ["屠城", "钟声"],
            24: ["熔毁铁王座", "布兰"]
        }
        kw = keywords.get(idx, [])
        if all(k in all_text for k in kw):
            verified_count += 1
            print(f"✓ Verified TV Canon Point: {check_item}")
        else:
            print(f"✗ FAILED check: {check_item} (Keywords missing: {kw})")

    print(f"\nVerification Result: {verified_count}/{len(key_tv_checks)} canonical checkpoints perfectly matched.")

if __name__ == '__main__':
    verify_timeline()
