# -*- coding: utf-8 -*-
"""
Generate complete markdown chronicle artifact for Game of Thrones TV series.
"""
import json
import os

def generate_markdown():
    with open('public/data/tv-timeline/got_tv_timeline.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    art_dir = r"C:\Users\Aca\.gemini\antigravity\brain\42f9f24f-7979-4eea-87f3-fb1780357430"
    os.makedirs(art_dir, exist_ok=True)
    out_file = os.path.join(art_dir, "game_of_thrones_tv_complete_timeline.md")

    md = []
    md.append("# 《权力的游戏》TV 剧集全剧情史诗时间线与编年总录")
    md.append("\n> **来源收录**：冰与火之歌中文维基 (asoiaf.fandom.com/zh) 与 HBO 官方剧集档案")
    md.append(f"> **全剧跨度**：{data['timeline_span']}（征服历 298 AC — 305 AC · 共 8 季 73 集）")
    md.append(f"> **总集数与大事件**：全剧共 73 集 · 269 项重大转折战役 · 8 大地域全线贯通\n")

    md.append("## 维斯特洛八年宏观时代纪年表 (298 AC - 305 AC)\n")
    md.append("| 季度 | 时代与阶段 | AC 纪年 | 核心主题与历史分水岭 | 关键战役与转折点 |")
    md.append("| :--- | :--- | :--- | :--- | :--- |")
    md.append("| **第 1 季** | 五王之乱前夕 | 298 AC | 劳勃驾崩、奈德被斩首、北境起兵称王、真龙出世 | 呓语森林之战、贝勒圣堂之刑、真龙浴火诞生 |")
    md.append("| **第 2 季** | 五王之战爆发 | 299 AC | 蓝礼遇刺、席恩陷临冬城、黑水河野火焚江 | 黑水河之战、先民拳峰异鬼现世、不朽之殿焚巫 |")
    md.append("| **第 3 季** | 冰雨的风暴(上) | 299-300 AC | 詹姆断手、丹妮智取无垢者、血色婚礼屠杀少狼主 | 绝壁攀爬、血色婚礼惨案、阿斯塔波大解放 |")
    md.append("| **第 4 季** | 冰雨的风暴(下) | 300 AC | 紫色婚礼乔佛里暴毙、红毒蛇碎颅、提利昂弑父 | 黑城堡保卫战、红毒蛇决斗魔山、提利昂弑父 |")
    md.append("| **第 5 季** | 魔龙狂舞(前篇) | 301-302 AC | 信仰武装清洗君临、瑟曦游街、艰难屯亡灵天灾、雪诺遇刺 | 艰难屯战役、角斗场飞龙救母、雪诺雪地遇刺 |")
    md.append("| **第 6 季** | 凛冬的风声 | 302-303 AC | 雪诺复活、阿多抵门、私生子之战光复北境、野火焚圣堂 | 私生子之战、贝勒圣堂大爆炸、雪诺称北境王 |")
    md.append("| **第 7 季** | 龙石岛与陷落 | 304 AC | 龙狼会盟、怒火燎原、塞外冰湖血战、夜王冰龙塌长城 | 怒火燎原之战、冰湖血战、东海望长城崩塌 |")
    md.append("| **第 8 季** | 漫漫长夜与终局 | 305 AC | 临冬城决战夜王灭亡、龙母黑化屠城、铁王座熔毁与新纪元 | 漫漫长夜战役、君临之劫、铁王座熔毁与分治 |")
    md.append("\n---\n")

    for season in data['seasons']:
        s_num = season['season']
        md.append(f"## {season['title_zh']} ({season['title_en']})")
        md.append(f"- **时代背景**：{season['year_ac']}")
        md.append(f"- **核心题眼**：*{season['tagline']}*")
        md.append(f"- **季度全貌概述**：{season['overview']}")
        md.append(f"- **核心故事线**：{' · '.join(season['major_arcs'])}\n")

        for ep in season['episodes']:
            e_num = ep['episode']
            ov_num = ep['overall_episode']
            md.append(f"### 第 {s_num} 季 第 {e_num} 集（总第 {ov_num} 集）：《{ep['title_zh']}》 ({ep['title_en']})")
            md.append(f"- **首播日期**：{ep['air_date']} ｜ **导演**：{ep['director']} ｜ **编剧**：{ep['writer']}")
            md.append(f"- **时间线定位**：`{ep['timeline_context']}`")
            md.append(f"- **剧情速览**：{ep['summary']}")

            md.append("\n#### 分地域多线详实剧情：")
            for plot in ep['plot_lines']:
                md.append(f"##### 【{plot['location']}】")
                md.append(f"{plot['narrative']}\n")

            if ep['key_events']:
                md.append("#### 本集重大转折与历史事件：")
                for evt in ep['key_events']:
                    md.append(f"- {evt}")
                md.append("")

            if ep['major_deaths']:
                md.append("#### 本集阵亡与牺牲名单：")
                for death in ep['major_deaths']:
                    md.append(f"- {death}")
                md.append("")

            if ep['character_debuts']:
                md.append("#### 重要初登场角色：")
                for debut in ep['character_debuts']:
                    md.append(f"- {debut}")
                md.append("")

            if ep.get('iconic_quote'):
                md.append(f"> **经典台词**：“{ep['iconic_quote']}”\n")

            md.append("---\n")

    content = '\n'.join(md)
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"Generated comprehensive markdown chronicle at: {out_file}")
    print(f"Total size: {len(content)} characters, {len(content.splitlines())} lines.")

if __name__ == '__main__':
    generate_markdown()
