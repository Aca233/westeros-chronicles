import urllib.request
import re
import os

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def download_chunks(base_url, out_dir, chunks):
    for c in chunks:
        url = base_url.rstrip('/') + '/' + c.lstrip('/')
        fn = os.path.basename(c)
        dest = os.path.join(out_dir, fn)
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()
            with open(dest, 'wb') as fp:
                fp.write(data)
            print(f"Downloaded {fn} ({len(data)} bytes)")
            
            # Check if this downloaded chunk contains more chunks
            if fn.endswith('.js'):
                text = data.decode('utf-8', errors='ignore')
                sub_chunks = re.findall(r'["\'](assets/[a-zA-Z0-9_\-\.]+\.(?:js|css|json|wasm))["\']', text)
                for sc in set(sub_chunks):
                    sc_fn = os.path.basename(sc)
                    if not os.path.exists(os.path.join(out_dir, sc_fn)):
                        download_chunks(base_url, out_dir, [sc])
        except Exception as e:
            print(f"Failed {c}: {e}")

yishijie_chunks = [
    'assets/BattleSystem-BD0LTHvO.js',
    'assets/App-BaYklK13.css',
    'assets/videoDb-Dk0lIhWK.js',
    'assets/BattlePreview-BVzdpIRm.js',
    'assets/useApi-D6QZP36C.js',
    'assets/BattlePreview-ClbqT8ka.css',
    'assets/useCharacterPortrait-DyNIL8V7.js',
    'assets/useMemorySystem-DpAUM1nE.js',
    'assets/BattleSystem-98QPHXZA.css',
    'assets/App-wn0yK7F0.js',
    'assets/imageDb-VSh2iWJs.js'
]

download_chunks('https://yishijie-ten.vercel.app', 'scratch/yishijie', yishijie_chunks)
