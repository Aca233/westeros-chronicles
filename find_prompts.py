import os, re, json

def find_prompts_in_file(filepath, max_items=10):
    if not os.path.exists(filepath):
        return
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    print(f"\n==================== File: {os.path.basename(filepath)} ====================")
    
    # Extract long string constants or JSON objects
    # 1. System prompt matches
    system_prompts = re.findall(r'(?:role|system|prompt|instruction|设定|规则|指南)[\s\S]{0,30}?["`\']([\u4e00-\u9fa5][^"`\']{40,})["`\']', content)
    if system_prompts:
        print(f"Found {len(system_prompts)} prompt segments:")
        for sp in system_prompts[:max_items]:
            print("  >>>", sp.replace('\n', ' ').strip()[:200])

find_prompts_in_file('scratch/fanren/promptPreset-DdZWy5il.js')
find_prompts_in_file('scratch/fanren/directorService-CA4wcOts.js')
find_prompts_in_file('scratch/fanren/itemPromptContract-BxZU6H4r.js')
find_prompts_in_file('scratch/fanren/schemas-CVoef6Zr.js')
find_prompts_in_file('scratch/yishijie/useMemorySystem-DpAUM1nE.js')
find_prompts_in_file('scratch/yishijie/BattleSystem-BD0LTHvO.js')
find_prompts_in_file('scratch/yishijie/useApi-D6QZP36C.js')
