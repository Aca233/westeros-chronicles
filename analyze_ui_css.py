import os, re

def analyze_css(css_path):
    print(f"\n================ CSS Analysis: {os.path.basename(css_path)} ================")
    with open(css_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Extract color palettes (hex, hsl, rgb, var)
    colors = set(re.findall(r'#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|hsl\([^)]+\)|rgba?\([^)]+\)', content))
    print(f"Total color definitions found: {len(colors)}")
    print("Sample colors:", list(colors)[:10])
    
    # Extract layout classes, card styles, chat bubbles, fonts
    font_families = set(re.findall(r'font-family:[^;]+', content))
    print("Font families:", font_families)
    
    selectors = re.findall(r'(\.[a-zA-Z0-9_\-\:]+(?:\s*,\s*\.[a-zA-Z0-9_\-\:]+)*)\s*\{', content)
    dialogue_selectors = [s for s in selectors if any(k in s.lower() for k in ['chat', 'message', 'bubble', 'dialog', 'speak', 'narrat', 'think', 'player', 'npc', 'story', 'branch', 'input', 'action', 'avatar', 'portrait', 'card'])]
    print(f"Dialogue related CSS selectors: {len(dialogue_selectors)}")
    for s in dialogue_selectors[:15]:
        print("  -", s[:80])

analyze_css('scratch/fanren/index-BorK93n9.css')
analyze_css('scratch/yishijie/App-BaYklK13.css')
analyze_css('scratch/yishijie/BattleSystem-98QPHXZA.css')
