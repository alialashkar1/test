#!/usr/bin/env python3
"""Bundle src/ into single-file builds.

dist/index.html       standalone page, open it directly or host it anywhere
dist/throughline.html body-only fragment for publishing as a claude.ai artifact
"""
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
JS = ["kb", "engine", "store", "seed", "ui", "library", "flow", "agent", "views-a", "views-b", "views-c"]
FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">'

css = (SRC / "styles.css").read_text()
js = "\n".join((SRC / "js" / f"{n}.js").read_text() for n in JS)
assert "</script" not in js.lower(), "a script-closing tag inside the bundle would end it early"

body = f'<div id="app"></div>\n<div id="toasts" aria-live="polite"></div>\n<script>\n(function(){{\n"use strict";\n{js}\n}})();\n</script>\n'
head = f"<title>Throughline Audit</title>\n{FONTS}\n<style>\n{css}</style>\n"

import re


def ascii_only(code: str) -> str:
    """Rewrite every control and non-ASCII character as a \\xNN or \\uNNNN escape.

    Minified libraries embed such characters inside string literals (codepage tables,
    binary signatures). An escape denotes the same character, and the published files
    then contain nothing but printable ASCII.
    """
    def esc(ch):
        o = ord(ch)
        if o < 0x100:
            return "\\x%02x" % o
        if o < 0x10000:
            return "\\u%04x" % o
        o -= 0x10000
        return "\\u%04x\\u%04x" % (0xD800 + (o >> 10), 0xDC00 + (o & 0x3FF))

    def sub(m):
        slashes, ch = m.group(1), m.group(2)
        # an odd run of backslashes already escapes the character: drop that one backslash
        return slashes[: len(slashes) - (len(slashes) % 2)] + esc(ch)
    return re.sub(r"(\\*)([^\x09\x0a\x0d\x20-\x7e])", sub, code)


(ROOT / "dist" / "vendor").mkdir(parents=True, exist_ok=True)
for lib in sorted((SRC / "vendor").glob("*.js")):
    (ROOT / "dist" / "vendor" / lib.name).write_text(ascii_only(lib.read_text(encoding="utf-8")), encoding="ascii")
(ROOT / "dist" / "index.html").write_text(
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    f"{head}</head>\n<body>\n{body}</body>\n</html>\n"
)
(ROOT / "dist" / "throughline.html").write_text(
    f'<meta name="claude:viewport-fit-sides" content="cover">\n{head}{body}'
)
print(f"built dist/index.html and dist/throughline.html ({len(js) // 1024} KB of script)")
