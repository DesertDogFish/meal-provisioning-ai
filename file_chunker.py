import sys
import os
import re

def get_file_outline(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    lines = []
    
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        for i, line in enumerate(f, 1):
            # Для Markdown: собираем заголовки
            if ext == '.md' and line.startswith('#'):
                lines.append(f"Line {i}: {line.strip()}")
            # Для Java/JS/TS/Python: собираем объявления классов и методов
            elif ext in ['.java', '.py', '.js', '.ts', '.tsx']:
                if any(kwd in line for kwd in ['class ', 'public ', 'private ', 'protected ', 'void ', 'def ', 'function ']):
                    if '{' in line or ')' in line or ':' in line:
                        lines.append(f"Line {i}: {line.strip()}")
                        
    return "\n".join(lines[:300]) # Ограничение, чтобы не перегрузить контекст

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python file_chunker.py <path_to_file>")
        sys.exit(1)
    print(get_file_outline(sys.argv[1]))