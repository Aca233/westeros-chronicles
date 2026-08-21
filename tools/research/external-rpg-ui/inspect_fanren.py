import os, glob

print("=== Fanren Files ===")
for f in glob.glob("scratch/fanren/*"):
    print(f, os.path.getsize(f))

with open("scratch/fanren/index.html", "r", encoding="utf-8", errors="ignore") as f:
    html = f.read()
    print("Fanren HTML length:", len(html))
    print("Fanren HTML head/scripts:")
    lines = html.split('\n')
    for line in lines[:30]:
        print("  ", line)

print("\n=== Fanren JS ===")
with open("scratch/fanren/index-CYGdmQ4J.js", "r", encoding="utf-8", errors="ignore") as f:
    js = f.read()
    print("Fanren JS length:", len(js))
    print(js[:1000])

