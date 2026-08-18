import urllib.request
import urllib.parse
import json
import re
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

def fetch_url(url):
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode('utf-8')

def fetch_wiki_pages_batch(titles):
    titles_str = '|'.join(titles)
    url = f"https://asoiaf.fandom.com/zh/api.php?action=query&format=json&prop=revisions&titles={urllib.parse.quote(titles_str)}&rvprop=content"
    try:
        raw = fetch_url(url)
        data = json.loads(raw)
        return data.get('query', {}).get('pages', {})
    except Exception as e:
        print(f"Error fetching batch: {e}")
        return {}

def clean_wikitext(text):
    if not text:
        return ""

    # Remove ref tags
    text = re.sub(r'<ref[^>]*>.*?</ref>', '', text, flags=re.DOTALL)
    text = re.sub(r'<ref[^>]*/>', '', text)
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)

    # Clean links [[Page|Text]] -> Text, [[Page]] -> Page
    text = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', text)

    # Clean templates {{...}}
    for _ in range(5):
        text = re.sub(r'\{\{[^{}]*\}\}', '', text)

    # Clean bold / italic markup
    text = re.sub(r"'''?", '', text)

    # Clean html tags
    text = re.sub(r'<[^>]+>', '', text)

    # Clean multiple empty lines
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()

def parse_episode_wikitext(title, raw_wikitext):
    if not raw_wikitext:
        return None

    # Extract infobox data
    episode_title_match = re.search(r'\|\s*episode_title\s*=\s*(.+)', raw_wikitext)
    episode_num_match = re.search(r'\|\s*episode_number\s*=\s*(.+)', raw_wikitext)
    airdate_match = re.search(r'\|\s*airdate\s*=\s*(.+)', raw_wikitext)
    director_match = re.search(r'\|\s*director\s*=\s*(.+)', raw_wikitext)
    writer_match = re.search(r'\|\s*writter\s*=\s*(.+)', raw_wikitext) or re.search(r'\|\s*writer\s*=\s*(.+)', raw_wikitext)

    ep_title = clean_wikitext(episode_title_match.group(1)) if episode_title_match else ""
    ep_num = clean_wikitext(episode_num_match.group(1)) if episode_num_match else ""
    airdate = clean_wikitext(airdate_match.group(1)) if airdate_match else ""
    director = clean_wikitext(director_match.group(1)) if director_match else ""
    writer = clean_wikitext(writer_match.group(1)) if writer_match else ""

    sections = []
    lines = raw_wikitext.split('\n')
    current_section = None
    current_text = []
    in_plot = False
    overview = []

    for line in lines:
        stripped = line.strip()

        # Check main header
        h2 = re.match(r'^==\s*([^=]+)\s*==$', stripped)
        if h2:
            h2_name = h2.group(1).strip()
            if '剧情' in h2_name or '故事' in h2_name or '情节' in h2_name:
                in_plot = True
                current_section = "概述"
                current_text = []
                continue
            elif any(k in h2_name for k in ['演员', '原著', '差异', '参考', '制作', '收视', '幕后', '评价', '参见']):
                if in_plot and current_section and current_text:
                    cleaned_sec = clean_wikitext('\n'.join(current_text))
                    if cleaned_sec:
                        sections.append({
                            "location": current_section,
                            "content": cleaned_sec
                        })
                    current_section = None
                    current_text = []
                in_plot = False
                continue

        h3 = re.match(r'^===\s*([^=]+)\s*===$', stripped)
        if h3 and in_plot:
            if current_section and current_text:
                cleaned_sec = clean_wikitext('\n'.join(current_text))
                if cleaned_sec:
                    sections.append({
                        "location": current_section,
                        "content": cleaned_sec
                    })
            current_section = h3.group(1).strip()
            current_text = []
            continue

        h4 = re.match(r'^====\s*([^=]+)\s*====$', stripped)
        if h4 and in_plot:
            if current_section and current_text:
                cleaned_sec = clean_wikitext('\n'.join(current_text))
                if cleaned_sec:
                    sections.append({
                        "location": current_section,
                        "content": cleaned_sec
                    })
            current_section = h4.group(1).strip()
            current_text = []
            continue

        if in_plot and current_section:
            current_text.append(line)
        elif not in_plot and not stripped.startswith('{{') and not stripped.startswith('|') and not stripped.startswith('}}') and not stripped.startswith('==') and stripped:
            overview.append(line)

    if in_plot and current_section and current_text:
        cleaned_sec = clean_wikitext('\n'.join(current_text))
        if cleaned_sec:
            sections.append({
                "location": current_section,
                "content": cleaned_sec
            })

    # If sections only has "概述" or empty, but there is plot text, make sure it's preserved
    if not sections and raw_wikitext:
        # try to extract whatever plot text is there
        cleaned_full = clean_wikitext(raw_wikitext)
        sections = [{"location": "剧情全貌", "content": cleaned_full[:2000]}]

    intro_summary = clean_wikitext('\n'.join(overview[:5]))

    return {
        "page_title": title,
        "episode_title": ep_title,
        "episode_number": ep_num,
        "airdate": airdate,
        "director": director,
        "writer": writer,
        "intro_summary": intro_summary,
        "sections": sections,
        "raw_length": len(raw_wikitext)
    }

def main():
    seasons_meta = [
        ('第一季', 1, 10),
        ('第二季', 2, 10),
        ('第三季', 3, 10),
        ('第四季', 4, 10),
        ('第五季', 5, 10),
        ('第六季', 6, 10),
        ('第七季', 7, 7),
    ]

    num_zh = ['一','二','三','四','五','六','七','八','九','十']

    all_titles = []
    for s_name, s_num, ep_count in seasons_meta:
        for ep in range(1, ep_count + 1):
            ep_zh = num_zh[ep-1]
            title = f"TV:{s_name}第{ep_zh}集"
            all_titles.append(title)

    print(f"Total titles to fetch: {len(all_titles)}")

    batch_size = 10
    batches = [all_titles[i:i+batch_size] for i in range(0, len(all_titles), batch_size)]

    results = {}
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(fetch_wiki_pages_batch, batch): batch for batch in batches}
        for future in as_completed(futures):
            pages = future.result()
            for pid, pdata in pages.items():
                if pid != '-1':
                    title = pdata.get('title', '')
                    content = pdata.get('revisions', [{}])[0].get('*', '')
                    results[title] = content

    print(f"Fetched {len(results)} pages successfully.")

    parsed_episodes = []
    overall_num = 1
    for s_name, s_num, ep_count in seasons_meta:
        for ep in range(1, ep_count + 1):
            ep_zh = num_zh[ep-1]
            title = f"TV:{s_name}第{ep_zh}集"
            raw = results.get(title, "")
            parsed = parse_episode_wikitext(title, raw)
            if not parsed:
                parsed = {
                    "page_title": title,
                    "episode_title": "",
                    "episode_number": str(ep),
                    "airdate": "",
                    "director": "",
                    "writer": "",
                    "intro_summary": "",
                    "sections": [],
                    "raw_length": 0
                }

            parsed["season"] = s_num
            parsed["episode"] = ep
            parsed["overall_episode"] = overall_num
            overall_num += 1
            parsed_episodes.append(parsed)

    os.makedirs('scratch', exist_ok=True)
    with open('scratch/fandom_tv_episodes_raw.json', 'w', encoding='utf-8') as f:
        json.dump(parsed_episodes, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(parsed_episodes)} parsed episodes to scratch/fandom_tv_episodes_raw.json")

if __name__ == '__main__':
    main()
