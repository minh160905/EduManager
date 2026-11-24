"""Build a local, reviewable search index from the supplied THPT DOCX.

Only chapters 1–8 contain subject matter for answers. Chapters 9–11 describe
the proposed chatbot and explicitly mark several school procedures as drafts.
No student records or API credentials are included in this index.
"""

import json
import hashlib
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
MAIN = re.compile(r"^([1-8])\.\s+\S")
SUB = re.compile(r"^[1-8]\.\d+\.\s+\S")


def paragraphs(docx: Path):
    with zipfile.ZipFile(docx) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    for number, node in enumerate(root.findall(".//w:body//w:p", NS), 1):
        content = "".join(t.text or "" for t in node.findall(".//w:t", NS)).strip()
        if content:
            yield number, content


def build(docx: Path):
    chunks = []
    section = None
    lines = []
    start = None

    def flush():
        nonlocal lines, start
        if lines:
            chunks.append({
                "id": f"KB-{len(chunks) + 1:03d}",
                "section": section,
                "paragraph_start": start,
                "paragraph_end": lines[-1][0],
                "content": "\n".join(text for _, text in lines),
            })
            lines = []
            start = None

    active = False
    for number, text in paragraphs(docx):
        if re.match(r"^9\.\s+", text):
            break
        if MAIN.match(text):
            flush()
            active = True
            section = text
            continue
        if not active:
            continue
        if SUB.match(text):
            flush()
            section = text
            continue
        if lines and sum(len(item[1]) for item in lines) + len(text) > 1800:
            flush()
        if start is None:
            start = number
        lines.append((number, text))
    flush()
    return {
        "source": docx.name,
        "source_sha256": hashlib.sha256(docx.read_bytes()).hexdigest(),
        "review_status": "draft_needs_school_and_legal_review",
        "note": "School procedures and forms in this document are proposals; legal claims need date-specific review.",
        "chunks": chunks,
    }


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python build_knowledge.py <source.docx> <output.json>")
    source, output = map(Path, sys.argv[1:])
    if source.suffix.lower() != ".docx" or not source.is_file():
        raise SystemExit("Source must be an existing .docx file")
    data = build(source)
    if not data["chunks"]:
        raise SystemExit("No knowledge chapters found in source")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Indexed {len(data['chunks'])} chunks from {source.name} into {output}")
