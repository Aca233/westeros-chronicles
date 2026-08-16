import os, re, json

def inspect_fanren_dialogue_ui():
    print("================== FANREN DIALOGUE UI ==================")
    # Look for dialogue, message, chat, speak, think, branch, action bar UI components
    for f in os.listdir('scratch/fanren'):
        if f.endswith('.js'):
            path = os.path.join('scratch/fanren', f)
            with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                content = fp.read()
                # Find CSS classes or JSX elements related to messages/chat
                ui_matches = re.findall(r'(?:className|class)["\']:\s*["\']([^"\']*(?:chat|message|dialogue|bubble|think|narrate|speak|portrait|action|input|avatar|scroll-area)[^"\']*)["\']', content)
                if ui_matches:
                    print(f"File {f} matches: {len(ui_matches)}")
                    for m in set(ui_matches[:8]):
                        print("  Class:", m)

def inspect_yishijie_dialogue_ui():
    print("\n================== YISHIJIE DIALOGUE UI ==================")
    for f in os.listdir('scratch/yishijie'):
        if f.endswith('.js'):
            path = os.path.join('scratch/yishijie', f)
            with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                content = fp.read()
                ui_matches = re.findall(r'(?:class|className)=["\']([^"\']*(?:chat|message|dialogue|bubble|narrative|content|avatar|input|action|status|panel)[^"\']*)["\']', content)
                if ui_matches:
                    print(f"File {f} matches: {len(ui_matches)}")
                    for m in set(ui_matches[:8]):
                        print("  Class:", m)

inspect_fanren_dialogue_ui()
inspect_yishijie_dialogue_ui()
