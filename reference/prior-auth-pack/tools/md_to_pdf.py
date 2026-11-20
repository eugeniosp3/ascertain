"""Turn a markdown file into a PDF using Python-Markdown and headless Chrome.

Usage: python3 tools/md_to_pdf.py docs/01_prior_auth_overview.md
Needs: the `markdown` package and Google Chrome installed on macOS.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import markdown

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

PAGE_CSS = """
@page { size: Letter; margin: 0.45in 0.55in; }
body { font: 9pt/1.32 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; }
h1 { font-size: 17pt; margin: 0 0 6pt; color: #12355b; }
h2 { font-size: 11pt; margin: 10pt 0 3pt; color: #12355b; border-bottom: 1px solid #c9d3df; padding-bottom: 1pt; }
p { margin: 3pt 0; }
ol, ul { margin: 3pt 0; padding-left: 16pt; }
li { margin: 1pt 0; }
table { border-collapse: collapse; width: 100%; margin: 4pt 0; font-size: 8.6pt; }
th, td { border: 1px solid #c9d3df; padding: 1.5pt 5pt; text-align: left; vertical-align: top; }
th { background: #eef2f7; }
a { color: #1b5fa8; text-decoration: none; }
code { font-size: 8.8pt; background: #f1f3f5; padding: 0 2pt; }
"""


def render_html(markdown_text: str) -> str:
    body = markdown.markdown(markdown_text, extensions=["tables", "sane_lists"])
    return f"<!doctype html><meta charset='utf-8'><style>{PAGE_CSS}</style>{body}"


def html_to_pdf(html: str, pdf_path: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        html_path = Path(tmp) / "page.html"
        html_path.write_text(html, encoding="utf-8")
        subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
             f"--print-to-pdf={pdf_path}", html_path.as_uri()],
            check=True, capture_output=True,
        )


def main(argv: list[str]) -> None:
    source = Path(argv[1])
    target = source.with_suffix(".pdf")
    html_to_pdf(render_html(source.read_text(encoding="utf-8")), target)
    print(target)


if __name__ == "__main__":
    main(sys.argv)
