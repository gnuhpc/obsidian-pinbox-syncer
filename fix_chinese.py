#!/usr/bin/env python3
import re
import glob

SKIP_COMMENT = "// /skip I need use Chinese due to the majority of the target users is Chinese."

def has_chinese(text):
    """Check if text contains Chinese characters"""
    return bool(re.search(r'[\u4e00-\u9fff]', text))

def process_file(filepath):
    """Process a single file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    modified = False
    result = []
    i = 0

    while i < len(lines):
        line = lines[i].rstrip('\n')

        # Check if this line is a standalone /skip comment
        if line.strip() == SKIP_COMMENT:
            # Check if the next line has Chinese
            if i + 1 < len(lines) and has_chinese(lines[i + 1]):
                # Skip this line, we'll add the comment to the next line
                modified = True
                i += 1
                continue

        # Check if this line contains Chinese and doesn't already have /skip comment
        if has_chinese(line) and SKIP_COMMENT not in line:
            # Add the /skip comment at the end of the line
            line = line.rstrip() + ' ' + SKIP_COMMENT
            modified = True

        result.append(line)
        i += 1

    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write('\n'.join(result) + '\n')
        return True
    return False

if __name__ == '__main__':
    files = ['main.ts'] + glob.glob('src/*.ts')

    for filepath in files:
        try:
            if process_file(filepath):
                print(f"✓ Fixed {filepath}")
            else:
                print(f"- No changes needed for {filepath}")
        except Exception as e:
            print(f"✗ Error processing {filepath}: {e}")

    print("\nDone!")
