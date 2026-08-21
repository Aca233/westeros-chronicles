import os, re, json

def deep_analyze():
    results = {}

    # 1. Analyze Yishijie Battle System & Memory System
    with open('scratch/yishijie/BattleSystem-BD0LTHvO.js', 'r', encoding='utf-8', errors='ignore') as f:
        y_battle = f.read()
    
    with open('scratch/yishijie/useMemorySystem-DpAUM1nE.js', 'r', encoding='utf-8', errors='ignore') as f:
        y_memory = f.read()

    with open('scratch/yishijie/useApi-D6QZP36C.js', 'r', encoding='utf-8', errors='ignore') as f:
        y_api = f.read()

    with open('scratch/yishijie/App-wn0yK7F0.js', 'r', encoding='utf-8', errors='ignore') as f:
        y_app = f.read()

    print("=== YISHIJIE SYSTEM DETAILS ===")
    # Find worldbook structure
    wb = re.findall(r'(worldBooks|worldBook|lorebook|memorySystem|conflictJudge|entryTypes|systemPrompt|mainPrompt)[^;]{0,200}', y_memory + y_battle)
    print("Memory/Worldbook cues:", len(wb))
    for item in wb[:10]:
        print("  -", item.strip())

    # Find Battle mechanics in Yishijie
    battle_cues = re.findall(r'(function\s+[a-zA-Z0-9_]+\([^)]*\)\s*\{[^}]{0,200}(?:hp|atk|def|damage|skill|dice|hit|crit|round|action)[^}]{0,200}\})', y_battle)
    print("Battle functions found:", len(battle_cues))

    # 2. Analyze Fanren Systems
    with open('scratch/fanren/schemas-CVoef6Zr.js', 'r', encoding='utf-8', errors='ignore') as f:
        f_schemas = f.read()
    
    with open('scratch/fanren/cultivationRealm-C0Jzt2Tv.js', 'r', encoding='utf-8', errors='ignore') as f:
        f_cult = f.read()

    with open('scratch/fanren/store-BqXON4xA.js', 'r', encoding='utf-8', errors='ignore') as f:
        f_store = f.read()

    with open('scratch/fanren/main-B16lJlD5.js', 'r', encoding='utf-8', errors='ignore') as f:
        f_main = f.read()

    print("\n=== FANREN SYSTEM DETAILS ===")
    cult_realms = re.findall(r'炼气|筑基|结丹|元婴|化神|炼虚|合体|大乘|渡劫|天仙|金仙|太乙|大罗|道祖', f_cult + f_schemas)
    print("Cultivation realms found:", set(cult_realms))

    # Check Zod or schema definitions in Fanren
    schema_defs = re.findall(r'(?:z\.object|schema|type)\(\{([^}]{30,300})\}\)', f_schemas)
    print("Zod schemas found in fanren:", len(schema_defs))
    for s in schema_defs[:5]:
        print("  * Schema:", s.strip()[:120])

deep_analyze()
