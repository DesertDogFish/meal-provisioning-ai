#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Batch replacement of custom buttons with Button components.

Tasks:
1. Replace .rounded-full + grad-btn → <Button variant="primary" size="sm" />
2. Replace .rounded-full + ghost-btn → <Button variant="ghost" />
3. Replace .rounded-full without gradient → <Button variant="primary" size="sm" />
"""

import re
import sys
from pathlib import Path

SRC_DIR = Path("src")
PAGES_DIR = SRC_DIR / "pages"
COMPONENTS_DIR = SRC_DIR / "components"

def replace_button_classes(content: str) -> str:
    """Replaces custom buttons with <Button />."""
    
    # .rounded-full + grad-btn → <Button variant="primary" size="sm" />
    content = re.sub(
        r'className="[^"]*rounded-full[^"]*grad-btn[^"]*"',
        r'className="btn primary sm"',
        content
    )
    
    # .rounded-full + ghost-btn → <Button variant="ghost" />
    content = re.sub(
        r'className="[^"]*rounded-full[^"]*ghost-btn[^"]*"',
        r'className="btn ghost"',
        content
    )
    
    # .rounded-full without gradient → <Button variant="primary" size="sm" />
    content = re.sub(
        r'className="[^"]*rounded-full[^"]*text-sm[^"]*"',
        r'className="btn primary sm"',
        content
    )
    
    # .rounded-full + flex items-center gap → <Button variant="primary" size="sm">
    content = re.sub(
        r'className="[^"]*rounded-full[^"]*flex[^\"]*gap[^\"]*"',
        r'className="btn primary sm"',
        content
    )
    
    return content

def process_file(filepath: Path) -> None:
    """Processes one file."""
    print(f"Processing: {filepath}")
    
    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception as e:
        print(f"  Error reading: {e}", file=sys.stderr)
        return
    
    # Replace custom buttons
    content = replace_button_classes(content)
    
    # Write back
    filepath.write_text(content, encoding="utf-8")
    print(f"  Written")

def main():
    """Main function."""
    files = list(PAGES_DIR.glob("*.tsx")) + list(COMPONENTS_DIR.glob("*.tsx"))
    print(f"Found files: {len(files)}")
    
    for filepath in files:
        process_file(filepath)
    
    print("Done!")

if __name__ == "__main__":
    main()
