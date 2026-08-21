import os, re, json

def print_section(title, text):
    print("\n" + "="*50)
    print(f"  {title}")
    print("="*50)
    print(text)

# 1. Inspect Fanren Prompts & Director System
with open('scratch/fanren/promptPreset-DdZWy5il.js', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()
    # Extract string literals
    literals = re.findall(r'["\']([^"\']{40,})["\']', text)
    print_section("FANREN: Prompt Presets / System Rules", "\n---\n".join(literals[:10]))

with open('scratch/fanren/directorService-CA4wcOts.js', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()
    literals = re.findall(r'["\']([^"\']{40,})["\']', text)
    print_section("FANREN: Director Service (导演系统 / 剧情演化)", "\n---\n".join(literals[:10]))

with open('scratch/fanren/schemas-CVoef6Zr.js', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()
    literals = re.findall(r'["\']([^"\']{40,})["\']', text)
    print_section("FANREN: Schemas / Character / Realm / Item Data Structure", "\n---\n".join(literals[:10]))

# 2. Inspect Yishijie Memory System & Battle System
with open('scratch/yishijie/useMemorySystem-DpAUM1nE.js', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()
    literals = re.findall(r'["\']([^"\']{40,})["\']', text)
    print_section("YISHIJIE: Memory System (记忆系统 / 冲突仲裁 / 压缩检索)", "\n---\n".join(literals[:10]))

with open('scratch/yishijie/BattleSystem-BD0LTHvO.js', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()
    literals = re.findall(r'["\']([^"\']{40,})["\']', text)
    print_section("YISHIJIE: Battle & World System (战斗 / 世界书 / 状态 / 骰子)", "\n---\n".join(literals[:10]))
