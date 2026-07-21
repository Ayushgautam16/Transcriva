"""
Clean Temporary and Uploaded Files script for Transcriva AI Summarizer.
Run this script to remove temporary audio downloads, converted chunks, byte-code caches (__pycache__),
and empty temporary folders to reduce overall repository size.
"""

import os
import shutil
import glob

def clean_downloads():
    """Remove temporary files from downloads/ and downloades/ folders."""
    count = 0
    bytes_freed = 0
    
    dirs_to_clean = ["downloads", "downloades"]
    for dir_name in dirs_to_clean:
        if os.path.exists(dir_name):
            for root, dirs, files in os.walk(dir_name):
                for f in files:
                    file_path = os.path.join(root, f)
                    try:
                        size = os.path.getsize(file_path)
                        os.remove(file_path)
                        bytes_freed += size
                        count += 1
                        print(f"[CLEANED] Removed file: {file_path} ({size / (1024*1024):.2f} MB)")
                    except Exception as e:
                        print(f"[WARN] Failed to remove {file_path}: {e}")
            
            # Remove empty directory if it's the typo folder 'downloades'
            if dir_name == "downloades":
                try:
                    shutil.rmtree(dir_name)
                    print(f"[CLEANED] Removed empty folder: {dir_name}")
                except Exception as e:
                    pass

    return count, bytes_freed

def clean_pycache():
    """Remove all __pycache__ directories and .pyc files in project source (excluding .venv, node_modules, .git)."""
    count = 0
    ignored_dirs = {".venv", "node_modules", ".git"}
    for root, dirs, files in os.walk("."):
        # Prevent walking into ignored directories
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        for dir_name in list(dirs):
            if dir_name == "__pycache__":
                cache_path = os.path.join(root, dir_name)
                try:
                    shutil.rmtree(cache_path)
                    count += 1
                    print(f"[CLEANED] Removed cache directory: {cache_path}")
                except Exception as e:
                    print(f"[WARN] Failed to remove cache directory {cache_path}: {e}")
    return count

def clean_db_temp():
    """Clean SQLite WAL/SHM temp files if not locked."""
    for f in ["tasks.db-shm", "tasks.db-wal"]:
        if os.path.exists(f):
            try:
                os.remove(f)
                print(f"[CLEANED] Removed DB temp file: {f}")
            except Exception as e:
                pass

if __name__ == "__main__":
    print("=== Transcriva AI Summarizer Cleanup ===")
    file_count, bytes_freed = clean_downloads()
    cache_count = clean_pycache()
    clean_db_temp()
    
    mb_freed = bytes_freed / (1024 * 1024)
    print(f"\nCleanup complete: Removed {file_count} temporary/uploaded file(s) ({mb_freed:.2f} MB freed) and {cache_count} pycache folder(s).")
