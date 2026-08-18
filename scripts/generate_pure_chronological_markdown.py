# -*- coding: utf-8 -*-
"""
Generate markdown chronicle for pure chronological timeline.
"""
import json
import os

def generate_markdown():
    with open('public/data/tv-timeline/westeros_chronological_timeline.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    art_dir = r"C:\Users\Aca\.gemini\antigravity\brain\42f9f24f-7979-4eea-87f3-fb1780357430"
    os.makedirs(art_dir, exist_ok=True)
    out_file = os.path.join(art_dir, "pure_chronological_timeline.md")

    md = []
    md.append(f"# {data['title']}")
    md.append(f"\n> **纪年体系**：{data['calendar_system']}")
    md.append(f"> **时间跨度**：{data['timeline_span']}")
    md.append(f"> **核心大历史节点**：共 {data['total_events']} 项重大编年转折节点（无剧集制，纯时间线驱动）\n")

    for year in data['years']:
        md.append(f"## 【{year['year_title']}】")
        md.append(f"> *“{year['tagline']}”*\n")
        md.append(f"**年度时代总论**：{year['overview']}\n")

        for evt in year['events']:
            md.append(f"### ❖ {evt['date_display']} ｜ {evt['title']}")
            md.append(f"- **分类**：`{evt['category_name']}` ｜ **发生地域**：`{evt['region']}`")
            md.append(f"- **涉及核心人物**：{'、'.join(evt['characters'])}")
            md.append(f"- **事件精要**：{evt['summary']}")
            md.append(f"\n#### 【历史详实剧情纪事】\n{evt['full_narrative']}\n")

            if evt['key_consequences']:
                md.append("**历史转折与深远影响**：")
                for cons in evt['key_consequences']:
                    md.append(f"- {cons}")
                md.append("")

            if evt['fatalities']:
                md.append("**阵亡与牺牲名单**：")
                for fat in evt['fatalities']:
                    md.append(f"- {fat}")
                md.append("")

            if evt.get('iconic_quote'):
                md.append(f"> **传世名言/誓言**：“{evt['iconic_quote']}”\n")

            md.append("---\n")

    with open(out_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(md))

    print(f"Generated pure chronological markdown at: {out_file}")

if __name__ == '__main__':
    generate_markdown()
