import os, re, json

def inspect_fanren_core():
    print("================== FANREN CORE SYSTEMS ==================")
    files_to_read = [
        'promptPreset-DdZWy5il.js',
        'itemPromptContract-BxZU6H4r.js',
        'directorService-CA4wcOts.js',
        'caveContextBuilder-BWI-HskX.js',
        'schemas-CVoef6Zr.js',
        'cultivationRealm-C0Jzt2Tv.js',
        'dailyPaperHtmlStorage-fHqm22LV.js',
        'npcPackage-Djfj8OVw.js',
        'service-DzzqHiNj.js',
        'service-BnChe-Y_.js',
        'cave-8_FGUT9-.js'
    ]
    for fn in files_to_read:
        path = os.path.join('scratch/fanren', fn)
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                print(f"\n--- {fn} (len: {len(content)}) ---")
                # Look for comments or Chinese descriptive text
                chinese_blocks = re.findall(r'[\u4e00-\u9fa5a-zA-Z0-9_\-，。！？：、“”《》（）]{10,}', content)
                print(f"Chinese snippets ({len(chinese_blocks)}):")
                for s in chinese_blocks[:10]:
                    if any(w in s for w in ['导演', '洞府', '突破', '灵石', '丹药', '系统', '提示词', '模型', '修仙', '剧情', '回合', '角色', 'NPC']):
                        print("  >", s)

def inspect_yishijie_core():
    print("\n\n================== YISHIJIE CORE SYSTEMS ==================")
    files_to_read = [
        'useMemorySystem-DpAUM1nE.js',
        'BattleSystem-BD0LTHvO.js',
        'useApi-D6QZP36C.js',
        'useCharacterPortrait-DyNIL8V7.js'
    ]
    for fn in files_to_read:
        path = os.path.join('scratch/yishijie', fn)
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                print(f"\n--- {fn} (len: {len(content)}) ---")
                chinese_blocks = re.findall(r'[\u4e00-\u9fa5a-zA-Z0-9_\-，。！？：、“”《》（）]{10,}', content)
                print(f"Chinese snippets ({len(chinese_blocks)}):")
                for s in chinese_blocks[:10]:
                    if any(w in s for w in ['转生', '战斗', '记忆', '属性', '好感', '状态', '技能', '系统', '模型', '世界观']):
                        print("  >", s)

inspect_fanren_core()
inspect_yishijie_core()
