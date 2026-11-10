#!/usr/bin/env python3
"""Bundle src/ into single-file builds.

dist/index.html       standalone page, open it directly or host it anywhere
dist/throughline.html body-only fragment for publishing as a claude.ai artifact
"""
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
JS = ["kb", "engine", "store", "seed", "ui", "views-a", "views-b", "views-c"]
FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">'

css = (SRC / "styles.css").read_text()
js = "\n".join((SRC / "js" / f"{n}.js").read_text() for n in JS)
assert "</script" not in js.lower(), "a script-closing tag inside the bundle would end it early"

body = f'<div id="app"></div>\n<div id="toasts" aria-live="polite"></div>\n<script>\n(function(){{\n"use strict";\n{js}\n}})();\n</script>\n'
head = f"<title>Throughline Audit</title>\n{FONTS}\n<style>\n{css}</style>\n"

(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist" / "index.html").write_text(
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    f"{head}</head>\n<body>\n{body}</body>\n</html>\n"
)
(ROOT / "dist" / "throughline.html").write_text(
    f'<meta name="claude:viewport-fit-sides" content="cover">\n{head}{body}'
)
print(f"built dist/index.html and dist/throughline.html ({len(js) // 1024} KB of script)")
