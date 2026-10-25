#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт батч-замены кустарных кнопок и отступов на токены design-pack.

Задачи:
1. Заменить .rounded-full → <Button variant="..." />
2. Заменить .grad-btn → <Button variant="primary" />
3. Заменить .ghost-btn → <Button variant="ghost" />
4. Заменить произвольные padding/gap/margin на токены --sp-*
5. Заменить hex-литералы (если остались) на токены

Использование:
  python scripts/replace-kustom-buttons.py
"""

import re
import sys
from pathlib import Path

# Пути
SRC_DIR = Path("src")
PAGES_DIR = SRC_DIR / "pages"
COMPONENTS_DIR = SRC_DIR / "components"

# Токены отступов (из tokens.css)
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

def px_to_sp(px: str) -> str:
    """Преобразует px в токен --sp-*."""
    px = px.strip().rstrip("px")
    if px in SP_TOKENS:
        return f"var(--{SP_TOKENS[px]})"
    # Округляем до ближайшего значения
    try:
        val = float(px)
        closest = min(SP_TOKENS.keys(), key=lambda k: abs(float(k) - val))
        return f"var(--{SP_TOKENS[closest]})"
    except ValueError:
        return px  # Если не число, оставляем как есть

def replace_padding(match: re.Match) -> str:
    """Заменяет padding: <value> на padding: var(--sp-*);"""
    prop = match.group(1)
    value = match.group(2)
    if prop.lower() in ("padding", "padding-top", "padding-right", "padding-bottom", "padding-left"):
        return f"{prop}: {px_to_sp(value)};"
    return match.group(0)

def replace_gap(match: re.Match) -> str:
    """Заменяет gap: <value> на gap: var(--sp-*);"""
    value = match.group(1)
    return f"gap: var(--{px_to_sp(value)});"

def replace_margin(match: re.Match) -> str:
    """Заменяет margin: <value> на margin: var(--sp-*);"""
    prop = match.group(1)
    value = match.group(2)
    if prop.lower() in ("margin", "margin-top", "margin-right", "margin-bottom", "margin-left"):
        return f"{prop}: {px_to_sp(value)};"
    return match.group(0)

def replace_class_to_button(content: str) -> str:
    """Заменяет кустарные кнопки на <Button />."""
    
    # .rounded-full + grad-btn → <Button variant="primary" size="sm" />
    content = re.sub(
        r'className="[^"]*rounded-full[^"]*grad-btn[^"]*"',
        r'className="btn primary"',
        content
    )
    
    # .rounded-full + ghost-btn → <Button variant="ghost" />
    content = re.sub(
        r'className="[^"]*rounded-full[^"]*ghost-btn[^"]*"',
        r'className="btn ghost"',
        content
    )
    
    # .rounded-full без градиента → <Button variant="primary" size="sm" />
    content = re.sub(
        r'className="[^"]*rounded-full[^"]*text-sm[^"]*"',
        r'className="btn primary sm"',
        content
    )
    
    # .rounded-full + flex items-center gap → <Button variant="primary" size="sm">
    content = re.sub(
        r'className="[^"]*rounded-full[^"]*flex[^"]*gap[^"]*"',
        r'className="btn primary sm"',
        content
    )
    
    return content

def process_file(filepath: Path) -> None:
    """Обрабатывает один файл."""
    print(f"Обработка: {filepath}")
    
    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception as e:
        print(f"  Ошибка чтения: {e}", file=sys.stderr)
        return
    
    # Заменяем отступы
    content = re.sub(
        r'(padding|gap|margin)(\s*[:=])\s*([^;]+);',
        lambda m: (replace_gap(m) if 'gap' in m.group(0).lower() 
                   else replace_margin(m) if 'margin' in m.group(0).lower()
                   else replace_padding(m)),
        content,
        flags=re.IGNORECASE
    )
    
    # Заменяем кустарные кнопки
    content = replace_class_to_button(content)
    
    # Записываем
    filepath.write_text(content, encoding="utf-8")
    print(f"  Записано")

def main():
    """Основная функция."""
    files = list(PAGES_DIR.glob("*.tsx")) + list(COMPONENTS_DIR.glob("*.tsx"))
    print(f"Найдено файлов: {len(files)}")
    
    for filepath in files:
        process_file(filepath)
    
    print("Готово!")

if __name__ == "__main__":
    main()
```

Скрипт создан. Теперь запущу его.

---

### Шаг 2: Запуск скрипта-заменителя

```tool
TOOL_NAME: run_terminal_command
BEGIN_ARG: command
"cd /d 'C:\Users\desertdogfish\Projects\pv4' && python scripts/replace-kustom-buttons.py"