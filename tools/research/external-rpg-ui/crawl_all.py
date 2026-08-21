import urllib.request
import re
import os
import glob

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def crawl_all_chunks(base_url, target_dir):
    os.makedirs(target_dir, exist_ok=True)
    known = set(os.listdir(target_dir))
    
    while True:
        new_found = set()
        for f in os.listdir(target_dir):
            if f.endswith('.js') or f.endswith('.html') or f.endswith('.css'):
                with open(os.path.join(target_dir, f), 'r', encoding='utf-8', errors='ignore') as fp:
                    content = fp.read()
                    matches = re.findall(r'["\'](?:./|/assets/)?([a-zA-Z0-9_\-\.]+\.(?:js|css|json|wasm))["\']', content)
                    for m in matches:
                        clean = os.path.basename(m)
                        if clean not in known and ('-' in clean or clean.endswith('.js') or clean.endswith('.css') or clean.endswith('.json')):
                            new_found.add(clean)
        
        if not new_found:
            print(f"[{base_url}] No more new chunks found.")
            break
            
        print(f"[{base_url}] Found {len(new_found)} new chunks: {new_found}")
        for chunk in new_found:
            known.add(chunk)
            url = base_url.rstrip('/') + '/assets/' + chunk
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                with open(os.path.join(target_dir, chunk), 'wb') as fp:
                    fp.write(data)
                print(f"  + Downloaded {chunk} ({len(data)} bytes)")
            except Exception as e:
                # Try direct root url
                try:
                    url2 = base_url.rstrip('/') + '/' + chunk
                    req = urllib.request.Request(url2, headers=headers)
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        data = resp.read()
                    with open(os.path.join(target_dir, chunk), 'wb') as fp:
                        fp.write(data)
                    print(f"  + Downloaded (root) {chunk} ({len(data)} bytes)")
                except Exception as e2:
                    print(f"  - Failed {chunk}: {e}")

crawl_all_chunks('https://fanren-remake.pages.dev', 'scratch/fanren')
crawl_all_chunks('https://yishijie-ten.vercel.app', 'scratch/yishijie')
