import re, os, json

def analyze_bundle(base_path, base_url):
    print("="*40)
    print(f"Analyzing {base_path}")
    print("="*40)
    for root, dirs, files in os.walk(base_path):
        for f in files:
            path = os.path.join(root, f)
            print(f"File: {f} ({os.path.getsize(path)} bytes)")
            if f.endswith('.js') or f.endswith('.html') or f.endswith('.json'):
                with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                    content = fp.read()
                    
                    # Check for chunk references
                    chunks = re.findall(r'["\']([a-zA-Z0-9_\-\./]+\.(?:js|json|css|wasm))["\']', content)
                    interesting_chunks = [c for c in chunks if 'assets/' in c or 'chunk' in c or 'vendor' in c or 'data' in c or 'json' in c]
                    if interesting_chunks:
                        print(f"  Referenced chunks in {f}: {set(interesting_chunks)}")

analyze_bundle('scratch/fanren', 'https://fanren-remake.pages.dev')
analyze_bundle('scratch/yishijie', 'https://yishijie-ten.vercel.app')
