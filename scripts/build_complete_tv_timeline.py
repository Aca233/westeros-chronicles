# -*- coding: utf-8 -*-
"""
Build complete 8-season 73-episode Game of Thrones TV Timeline dataset.
Synthesizes scraped data from asoiaf fandom zh wiki with verified canonical details.
"""

import json
import os
import re

def clean_text(t):
    if not t:
        return ""
    t = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', t)
    t = re.sub(r'<[^>]+>', '', t)
    t = re.sub(r'\{\{[^{}]*\}\}', '', t)
    t = re.sub(r"'''?", '', t)
    return t.strip()

def build_dataset():
    # Load raw scraped data if exists
    raw_data = {}
    if os.path.exists('scratch/fandom_tv_episodes_raw.json'):
        with open('scratch/fandom_tv_episodes_raw.json', 'r', encoding='utf-8') as f:
            raw_list = json.load(f)
            for r in raw_list:
                key = (r['season'], r['episode'])
                raw_data[key] = r

    # We now build the complete, encyclopedic, 8-season 73-episode dataset
    # We will write the full data structure into public/data/tv-timeline/got_tv_timeline.json

    # Import the timeline builder module or build in place
    import sys
    sys.path.append(os.path.dirname(__file__))
    import tv_episodes_data_builder

    timeline = tv_episodes_data_builder.get_full_timeline(raw_data)

    out_dir = 'public/data/tv-timeline'
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'got_tv_timeline.json')

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(timeline, f, ensure_ascii=False, indent=2)

    print(f"Successfully generated TV timeline with {len(timeline['seasons'])} seasons and {timeline['total_episodes']} episodes!")
    print(f"File saved at: {out_path}")

if __name__ == '__main__':
    build_dataset()
