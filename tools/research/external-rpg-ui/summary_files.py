import os, glob

def summarize_dir(d):
    print(f"=== Directory: {d} ===")
    files = sorted(os.listdir(d))
    print(f"Total files: {len(files)}")
    total_size = sum(os.path.getsize(os.path.join(d, f)) for f in files)
    print(f"Total size: {total_size / 1024 / 1024:.2f} MB")
    for f in files:
        size = os.path.getsize(os.path.join(d, f))
        print(f"  {f:40s} {size/1024:8.2f} KB")

summarize_dir('scratch/fanren')
summarize_dir('scratch/yishijie')
