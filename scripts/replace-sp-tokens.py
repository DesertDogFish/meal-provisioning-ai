#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Batch replacement of arbitrary padding/gap/margin with design tokens.

Tasks:
1. Replace padding: <px> → padding: var(--sp-*)
2. Replace gap: <px> → gap: var(--sp-*)
3. Replace margin: <px> → margin: var(--sp-*)
"""

import re
import sys
from pathlib import Path

# Token mapping
SP_TOKENS = {
    "0": "--sp-0",
    "0.5": "--sp-0.5",
    "1": "--sp-1",
    "1.5": "--sp-1.5",
    "2": "--sp-2",
    "2.5": "--sp-2.5",
    "3": "--sp-3",
    "3.5": "--sp-3.5",
    "4": "--sp-4",
    "5": "--sp-5",
    "6": "--sp-6",
    "8": "--sp-8",
    "10": "--sp-10",
    "12": "--sp-12",
    "14": "--sp-14",
    "16": "--sp-16",
    "20": "--sp-20",
    "24": "--sp-24",
    "32": "--sp-32",
    "40": "--sp-40",
    "48": "--sp-48",
    "64": "--sp-64",
}

def px_to_sp(px_str: str) -> str:
    """Converts px value to --sp- token."""
    px_str = px_str.strip().replace("px", "").strip()
    if px_str in SP_TOKENS:
        return f"var(--{SP_TOKENS[px_str]})"
    try:
        val = float(px_str)
        closest = min(SP_TOKENS.keys(), key=lambda k: abs(float(k) - val))
        return f"var(--{SP_TOKENS[closest]})"
    except ValueError:
        return px_str

def replace_spacing(match: re.Match) -> str:
    """Replaces padding/gap/margin values with tokens."""
    prop = match.group(1).lower()
    value = match.group(2).strip()
    
    if prop in ("padding", "padding-top", "padding-right", "padding-bottom", "padding-left"):
        return f"padding: {px_to_sp(value)};"
    elif prop in ("gap", "gap-x", "gap-y"):
        return f"gap: {px_to_sp(value)};"
    elif prop in ("margin", "margin-top", "margin-right", "margin-bottom", "margin-left"):
        return f"margin: {px_to_sp(value)};"
    return match.group(0)

def process_file(filepath: Path) -> None:
    """Processes one file."""
    print(f"Processing: {filepath}")
    
    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception as e:
        print(f"  Error reading: {e}", file=sys.stderr)
        return
    
    # Replace spacing values
    content = re.sub(
        r'\b(padding|gap|margin)(\s*[:=])\s*([\d.]+(?:px|em|rem|vh|vw)?)\s*;?',
        replace_spacing,
        content,
        flags=re.IGNORECASE
    )
    
    # Write back
    filepath.write_text(content, encoding="utf-8")
    print(f"  Written")

def main():
    """Main function."""
    SRC_DIR = Path("src")
    PAGES_DIR = SRC_DIR / "pages"
    COMPONENTS_DIR = SRC_DIR / "components"
    
    files = list(PAGES_DIR.glob("*.tsx")) + list(COMPONENTS_DIR.glob("*.tsx"))
    print(f"Found files: {len(files)}")
    
    for filepath in files:
        process_file(filepath)
    
    print("Done!")

if __name__ == "__main__":
    main()
