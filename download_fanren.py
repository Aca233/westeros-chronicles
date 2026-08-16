import urllib.request
import re
import os

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

downloaded = set()

def download_recursive(base_url, out_dir, files):
    os.makedirs(out_dir, exist_ok=True)
    queue = list(files)
    
    while queue:
        fn = queue.pop(0)
        clean_fn = fn.lstrip('/')
        if clean_fn.startswith('assets/'):
            clean_fn = clean_fn[7:]
        if clean_fn.startswith('./'):
            clean_fn = clean_fn[2:]
        if clean_fn in downloaded:
            continue
        downloaded.add(clean_fn)
        
        url = base_url.rstrip('/') + '/assets/' + clean_fn
        dest = os.path.join(out_dir, clean_fn)
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()
            with open(dest, 'wb') as fp:
                fp.write(data)
            print(f"Downloaded {clean_fn} ({len(data)} bytes)")
            
            if clean_fn.endswith('.js'):
                text = data.decode('utf-8', errors='ignore')
                found = re.findall(r'["\'](?:\./|/assets/)?([A-Za-z0-9_\-\.]+\.(?:js|css|json|wasm))["\']', text)
                for f in set(found):
                    if f not in downloaded and ('-' in f or f.endswith('.js') or f.endswith('.css') or f.endswith('.json')):
                        queue.append(f)
        except Exception as e:
            print(f"Failed {clean_fn} ({url}): {e}")

fanren_initial = [
    'bootGuard-D56TzOb8.js',
    'officialHosts-4pSXWj-i.js',
    'dynamicImportError-B64DIgGB.js',
    'preload-helper-BMwy4Dhw.js',
    'migrationMain-DPOlCwPg.js',
    'main-B16lJlD5.js'
]

download_recursive('https://fanren-remake.pages.dev', 'scratch/fanren', fanren_initial)
