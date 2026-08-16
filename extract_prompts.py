import os, re, json

def inspect_fanren_prompts():
    print("================== EXTRACTING FANREN PROMPTS & ARCHITECTURE ==================")
    # Look for large text / template strings in fanren
    for root, dirs, files in os.walk('scratch/fanren'):
        for f in files:
            if f.endswith('.js'):
                path = os.path.join(root, f)
                with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                    text = fp.read()
                    # Find long template strings or chinese paragraphs
                    long_texts = re.findall(r'`([^`]{150,})`', text)
                    if long_texts:
                        print(f"\n[Fanren File: {f}] found {len(long_texts)} long template strings:")
                        for idx, lt in enumerate(long_texts[:3]):
                            if any(k in lt for k in ['角色', '修仙', 'Prompt', '输出', 'JSON', '规则', '剧情', '回合', '状态', '【', '指令']):
                                print(f"  --- Template #{idx} (len {len(lt)}) ---")
                                print(lt[:500] + "...\n")

def inspect_yishijie_prompts():
    print("================== EXTRACTING YISHIJIE PROMPTS & ARCHITECTURE ==================")
    for root, dirs, files in os.walk('scratch/yishijie'):
        for f in files:
            if f.endswith('.js'):
                path = os.path.join(root, f)
                with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                    text = fp.read()
                    long_texts = re.findall(r'`([^`]{150,})`', text)
                    if long_texts:
                        print(f"\n[Yishijie File: {f}] found {len(long_texts)} long template strings:")
                        for idx, lt in enumerate(long_texts[:3]):
                            if any(k in lt for k in ['角色', '转生', 'Prompt', '输出', 'JSON', '规则', '剧情', '回合', '状态', '【', '指令', '世界', '记忆']):
                                print(f"  --- Template #{idx} (len {len(lt)}) ---")
                                print(lt[:500] + "...\n")

if __name__ == '__main__':
    inspect_fanren_prompts()
    inspect_yishijie_prompts()
