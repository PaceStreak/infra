#!/usr/bin/env python3
"""Fail the build on output the CSP would break silently, or that is missing.

This site's policy is stricter than the blog's: `style-src 'self'` and
`script-src 'self'`, with no 'unsafe-inline' and no hashes. A browser enforcing
it drops a `style` attribute, an inline <style> or an inline script without a
sound, so it looks fine in `astro dev` and is broken in production. Hence:

  - no `style=` attribute anywhere (Shiki's colours are classes, see
    src/lib/render.ts and /code.css);
  - no inline <style> element;
  - no <script> with a body (JSON-LD would be exempt, but none is used);
  - no resource loaded from another origin (src=, <link href=>, srcset=);
  - no data: URI outside images (img-src allows data:, nothing else does);
  - every Shiki class used in a page is defined in code.css;
  - 404.html, robots.txt (Disallow: /), _headers, code.css, search.json exist.

Also kept from the blog: Astro collapsing whitespace between text and an
inline tag ("Write tohello@…"), checked outside rendered Markdown.

    python3 check-html.py dist
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ALLOWED_ABUT = {"e<span>"}  # Pace<span>Streak</span>: the wordmark is one word
INLINE_BEFORE = re.compile(r"[A-Za-z0-9,;:)·—–&]<(?:a|em|strong|span|code)\b[^>]*>")
INLINE_AFTER = re.compile(r"</(?:a|em|strong|span|code)>[A-Za-z0-9(·—–]")

STYLE_ATTR = re.compile(r"<[^>]+\sstyle\s*=", re.I)
STYLE_TAG = re.compile(r"<style\b", re.I)
LD_JSON = re.compile(r"<script[^>]*type=\"application/ld\+json\"[^>]*>.*?</script>", re.S)
INLINE_SCRIPT = re.compile(r"<script\b[^>]*>\s*[^<\s]", re.I)
SCRIPT_NO_SRC = re.compile(r"<script\b(?![^>]*\ssrc=)[^>]*>", re.I)
EXT_SRC = re.compile(r"\s(?:src|srcset|poster|data)\s*=\s*\"(?:https?:)?//", re.I)
EXT_LINK = re.compile(r"<link\b[^>]*\shref=\"(?:https?:)?//[^\"]*\"[^>]*>", re.I)
DATA_URI = re.compile(r"(?:src|href)=\"data:(?!image/)", re.I)
SHIKI_CLASS = re.compile(r"\bsk-[a-z0-9]+\b")
EVENT_HANDLER = re.compile(r"<[^>]+\son[a-z]+\s*=", re.I)
JS_URL = re.compile(r"href=\"\s*javascript:", re.I)

# Rendered Markdown: whitespace there comes from the Markdown, not from Astro.
PROSE = re.compile(r"<!--md-->.*?<!--/md-->", re.S)
PRE = re.compile(r"<pre\b.*?</pre>", re.S)


def check(path: pathlib.Path, root: pathlib.Path, shiki_defined: set[str]) -> list[str]:
    html = path.read_text()
    name = str(path.relative_to(root))
    problems: list[str] = []

    if STYLE_ATTR.search(html):
        problems.append(f"{name}: style= attribute (style-src 'self' drops it)")
    if STYLE_TAG.search(html):
        problems.append(f"{name}: inline <style> (style-src 'self' blocks it)")
    stripped = LD_JSON.sub("", html)
    if INLINE_SCRIPT.search(stripped) or SCRIPT_NO_SRC.search(stripped):
        problems.append(f"{name}: inline <script> (script-src 'self' blocks it)")
    if EVENT_HANDLER.search(html) or JS_URL.search(html):
        problems.append(f"{name}: inline event handler or javascript: URL")
    for m in EXT_SRC.finditer(html):
        problems.append(f"{name}: resource from another origin: {m.group(0).strip()}")
    for m in EXT_LINK.finditer(html):
        problems.append(f"{name}: <link> to another origin: {m.group(0)[:120]}")
    if DATA_URI.search(html):
        problems.append(f"{name}: data: URI in src/href that the CSP blocks")

    used = set(SHIKI_CLASS.findall(html))
    missing = used - shiki_defined
    if missing:
        problems.append(f"{name}: Shiki classes missing from code.css: {sorted(missing)[:5]}")

    outside = PRE.sub("", PROSE.sub("", html))
    for m in INLINE_BEFORE.finditer(outside):
        frag = m.group(0)
        if any(frag.startswith(a[:-1]) for a in ALLOWED_ABUT):
            continue
        problems.append(f"{name}: text runs into an inline tag: …{frag}")
    for m in INLINE_AFTER.finditer(outside):
        problems.append(f"{name}: inline tag runs into text: {m.group(0)}…")
    return problems


def main() -> int:
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
    problems: list[str] = []

    for required in ["404.html", "index.html", "robots.txt", "_headers", "code.css", "search.json"]:
        if not (root / required).is_file():
            problems.append(f"{required} missing from {root}")
    robots = root / "robots.txt"
    if robots.is_file() and "Disallow: /" not in robots.read_text():
        problems.append("robots.txt must say `Disallow: /`: this site is noindex")
    headers = root / "_headers"
    if headers.is_file():
        h = headers.read_text()
        for needle in ["unsafe-inline", "unsafe-eval"]:
            if re.search(rf"Content-Security-Policy:[^\n]*{needle}", h):
                problems.append(f"_headers: CSP contains {needle}")
        if "X-Robots-Tag: noindex" not in h:
            problems.append("_headers: X-Robots-Tag noindex missing")
    search = root / "search.json"
    if search.is_file():
        try:
            if len(json.loads(search.read_text())) < 20:
                problems.append("search.json has suspiciously few records")
        except json.JSONDecodeError as e:
            problems.append(f"search.json is not JSON: {e}")

    code_css = root / "code.css"
    shiki_defined = set(re.findall(r"\.(sk-[a-z0-9]+)\{", code_css.read_text())) if code_css.is_file() else set()
    if code_css.is_file() and "style=" in code_css.read_text():
        problems.append("code.css looks wrong")

    pages = sorted(root.rglob("*.html"))
    if not pages:
        problems.append(f"no HTML found in {root}")
    for page in pages:
        problems.extend(check(page, root, shiki_defined))

    for p in problems:
        print(f"  {p}", file=sys.stderr)
    if problems:
        print(f"\n{len(problems)} problem(s) in the built site.", file=sys.stderr)
        return 1
    print(f"checked {len(pages)} page(s): CSP, markup and required-file checks pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
