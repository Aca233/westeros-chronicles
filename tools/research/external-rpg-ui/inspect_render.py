import os, re, json

def inspect_dialogue_rendering():
    # 1. Fanren message rendering
    print("=== FANREN MESSAGE & UI STRUCTURE ===")
    with open('scratch/fanren/store-BqXON4xA.js', 'r', encoding='utf-8', errors='ignore') as f:
        fanren_store = f.read()
    
    # Find message rendering or JSX structure
    msg_render = re.findall(r'(\bfunction\s+[a-zA-Z0-9_]+\([^)]*\)\s*\{[^}]{0,300}(?:narrate|speak|think|message|bubble|portrait|avatar)[^}]{0,300}\})', fanren_store)
    print("Fanren message render functions found:", len(msg_render))
    for mr in msg_render[:3]:
        print("  - Func:", mr[:200])
        
    # Search for layout structure in fanren main
    with open('scratch/fanren/main-B16lJlD5.js', 'r', encoding='utf-8', errors='ignore') as f:
        fanren_main = f.read()
    print("Fanren main size:", len(fanren_main))

    # 2. Yishijie message rendering
    print("\n=== YISHIJIE MESSAGE & UI STRUCTURE ===")
    with open('scratch/yishijie/App-wn0yK7F0.js', 'r', encoding='utf-8', errors='ignore') as f:
        y_app = f.read()
    
    # Find story feed / chat list rendering in yishijie
    story_feed = re.findall(r'(?:story-inline|ysj-action|dialogue|chat-box|message-item)[^\'\"]{0,100}', y_app)
    print("Yishijie story feed classes:", set(story_feed[:10]))
    
    # Extract branch button / action dock rendering
    action_dock = re.findall(r'(\bfunction\s+[a-zA-Z0-9_]+\([^)]*\)\s*\{[^}]{0,300}(?:action-list|quick-action|branch|regenerate|sendMessage)[^}]{0,300}\})', y_app)
    print("Yishijie action dock functions:", len(action_dock))

inspect_dialogue_rendering()
