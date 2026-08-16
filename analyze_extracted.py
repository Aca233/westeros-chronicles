import os, glob, re, json

def search_keywords(dir_path, keywords):
    print(f"\n========================================\nSearching in {dir_path}\n========================================")
    for f in sorted(os.listdir(dir_path)):
        if f.endswith('.js') or f.endswith('.json') or f.endswith('.html'):
            filepath = os.path.join(dir_path, f)
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as fp:
                content = fp.read()
                matches = {}
                for kw in keywords:
                    found = re.findall(rf'.{{0,60}}{kw}.{{0,100}}', content, re.IGNORECASE)
                    if found:
                        matches[kw] = found[:3]
                if matches:
                    print(f"\n--- File: {f} (size: {len(content)} bytes) ---")
                    for kw, snippets in matches.items():
                        print(f"  [KW: {kw}] count: {len(snippets)}")
                        for s in snippets:
                            clean_s = s.replace('\n', ' ').strip()
                            print(f"    -> {clean_s}")

print("=== Fanren Analysis ===")
search_keywords('scratch/fanren', ['prompt', 'system', 'apiKey', 'deepseek', 'openai', 'model', '灵石', '炼气', '筑基', '战斗', 'battle', 'inventory', 'health', 'cultivation'])

print("\n\n=== Yishijie Analysis ===")
search_keywords('scratch/yishijie', ['prompt', 'system', 'apiKey', 'deepseek', 'openai', 'model', 'memory', 'battle', 'status', '转生', '属性', 'hp', 'inventory'])
