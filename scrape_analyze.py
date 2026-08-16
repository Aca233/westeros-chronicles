import urllib.request
import re
import os
import json

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def fetch_url(url):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()

def scrape_site(name, base_url, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    try:
        raw_html = fetch_url(base_url)
        html = raw_html.decode('utf-8', errors='ignore')
        with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"[{name}] index.html fetched ({len(html)} bytes)")

        # Find all script src and link href
        urls = re.findall(r'(?:src|href)=["\']([^"\']+)["\']', html)
        # Also find any js file mentioned in js bundles or html
        js_files = re.findall(r'["\']([^"\']+\.(?:js|json|css|wasm))["\']', html)
        all_refs = set(urls + js_files)

        for ref in all_refs:
            if ref.startswith('//'):
                ref_url = 'https:' + ref
            elif ref.startswith('http://') or ref.startswith('https://'):
                ref_url = ref
            elif ref.startswith('/'):
                ref_url = base_url.rstrip('/') + ref
            else:
                ref_url = base_url.rstrip('/') + '/' + ref

            # Check if domain matches base_url
            if base_url in ref_url or not ref_url.startswith('http'):
                clean_name = re.sub(r'[\?#].*$', '', ref.split('/')[-1])
                if not clean_name:
                    continue
                try:
                    data = fetch_url(ref_url)
                    file_path = os.path.join(out_dir, clean_name)
                    with open(file_path, 'wb') as f:
                        f.write(data)
                    print(f"[{name}] Downloaded {clean_name} ({len(data)} bytes)")

                    # If it's a JS file, find any additional chunks or imported assets
                    if clean_name.endswith('.js'):
                        text = data.decode('utf-8', errors='ignore')
                        sub_chunks = re.findall(r'["\'](/assets/[a-zA-Z0-9_\-\.]+\.(?:js|css|json|wasm))["\']', text)
                        for chunk in set(sub_chunks):
                            chunk_url = base_url.rstrip('/') + chunk
                            chunk_name = chunk.split('/')[-1]
                            if not os.path.exists(os.path.join(out_dir, chunk_name)):
                                try:
                                    c_data = fetch_url(chunk_url)
                                    with open(os.path.join(out_dir, chunk_name), 'wb') as cf:
                                        cf.write(c_data)
                                    print(f"[{name}] -> Downloaded chunk {chunk_name} ({len(c_data)} bytes)")
                                except Exception as ce:
                                    print(f"[{name}] -> Failed chunk {chunk}: {ce}")
                except Exception as e:
                    print(f"[{name}] Error downloading {ref_url}: {e}")
    except Exception as e:
        print(f"[{name}] Error: {e}")

if __name__ == '__main__':
    scrape_site('fanren', 'https://fanren-remake.pages.dev', 'scratch/fanren')
    scrape_site('yishijie', 'https://yishijie-ten.vercel.app', 'scratch/yishijie')
