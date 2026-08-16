import os, glob, re

for f in sorted(glob.glob('scratch/fanren/*.js')):
    with open(f, 'r', encoding='utf-8', errors='ignore') as fp:
        text = fp.read()
        # Find matches for Chinese text blocks that look like instructions
        instructions = re.findall(r'[\'"`]([^\'"`]{40,})[\'"`]', text)
        interesting = []
        for inst in instructions:
            if any(k in inst for k in ['【', '】', '指令', '规则', 'Prompt', '输出', 'JSON', '修仙', '灵石', '回合', '结算', '洞府', '突破', '大境界', '神识']):
                interesting.append(inst)
        if interesting:
            print(f"File: {os.path.basename(f)} (found {len(interesting)} interesting strings)")
            for s in interesting[:5]:
                print("   * ", s.replace('\n', ' ')[:120])
