import os, re, json

def mine_fanren():
    print("================== FANREN DETAILS ==================")
    # Look into schemas, cultivation, stores
    target_files = [
        'schemas-CVoef6Zr.js',
        'cultivationRealm-C0Jzt2Tv.js',
        'db-DQ8467s-.js',
        'shenshiCapacity-CLxvDRaj.js',
        'talismanTreasureNumeric-xaVdmySP.js',
        'store-BKNHACiF.js',
        'store-BMwd4yAZ.js',
        'store-BqXON4xA.js',
        'api-gnqZK2SN.js',
        'persistenceV2-CsuI40JC.js',
        'customBackground-Bt8I8fqK.js',
        'splashBgmPlayer-DB_bUY9F.js'
    ]
    for fn in target_files:
        path = os.path.join('scratch/fanren', fn)
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                print(f"\n--- {fn} ({len(content)} bytes) ---")
                
                # Check for prompts / rules
                prompts = re.findall(r'(?:systemPrompt|prompt|rules|role|directive|修仙|境界|神识|灵根|法宝|丹药|机缘)[\'\":\s=]{1,20}([^\'\";\n]{20,300})', content)
                if prompts:
                    print("  Sample Prompts/Rules:")
                    for p in prompts[:5]:
                        print("   *", p.strip()[:150])
                        
                # Check for model/api configurations
                models = re.findall(r'(?:deepseek|openai|claude|gemini|moonshot|qwen|siliconflow|zhipu|glm)[a-zA-Z0-9_\-\:\.]*', content, re.I)
                if models:
                    print("  Supported Models/APIs:", set(models))
                
                # Check for storage keys or state names
                state_keys = re.findall(r'localStorage\.(?:getItem|setItem)\([\'\"]([^\'\"]+)[\'\"]', content)
                if state_keys:
                    print("  Storage Keys:", set(state_keys))

def mine_yishijie():
    print("\n================== YISHIJIE DETAILS ==================")
    target_files = [
        'useApi-D6QZP36C.js',
        'useMemorySystem-DpAUM1nE.js',
        'BattleSystem-BD0LTHvO.js',
        'useCharacterPortrait-DyNIL8V7.js',
        'save-bundle-DIwRe2ss.js',
        'App-wn0yK7F0.js'
    ]
    for fn in target_files:
        path = os.path.join('scratch/yishijie', fn)
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                print(f"\n--- {fn} ({len(content)} bytes) ---")
                
                # Check for prompt content
                prompts = re.findall(r'(?:system|prompt|role|memory|世界观|转生|属性|好感度|状态)[\'\":\s=]{1,20}([^\'\";\n]{20,300})', content)
                if prompts:
                    print("  Sample Prompts/Rules:")
                    for p in prompts[:5]:
                        print("   *", p.strip()[:150])
                
                models = re.findall(r'(?:deepseek|openai|claude|gemini|moonshot|qwen|siliconflow|zhipu|glm)[a-zA-Z0-9_\-\:\.]*', content, re.I)
                if models:
                    print("  Supported Models/APIs:", set(models))

                state_keys = re.findall(r'localStorage\.(?:getItem|setItem)\([\'\"]([^\'\"]+)[\'\"]', content)
                if state_keys:
                    print("  Storage Keys:", set(state_keys))

if __name__ == '__main__':
    mine_fanren()
    mine_yishijie()
