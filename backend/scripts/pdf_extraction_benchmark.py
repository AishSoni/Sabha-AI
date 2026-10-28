"""Measure the Spec 16 PDF extraction candidates on committed fixtures.

This is a decision-gate tool, not a production path. It compares the pypdf
plain/layout text layer with the selected pure-pip RapidOCR fallback and
prints a Markdown table plus a JSON summary. Run from ``backend``:

    venv\\Scripts\\python.exe scripts\\pdf_extraction_benchmark.py
"""

from __future__ import annotations

import argparse
import io
import json
import re
import statistics
import time
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path

import psutil
from pypdf import PdfReader

FIXTURES = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "pdf"
OCR_DPI = 200
OCR_MIN_SCORE = 0.75
MIN_NONSPACE = 24
MIN_WORDISH = 4


def normalize_text(text: str) -> str:
    """Normalize extraction artifacts without deleting ordinary word spaces."""
    text = unicodedata.normalize("NFC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\u00a0", " ").replace("\u00ad", "")
    text = (
        text.replace("\ufb01", "fi")
        .replace("\ufb02", "fl")
        .replace("\ufb00", "ff")
        .replace("\ufb03", "ffi")
        .replace("\ufb04", "ffl")
    )
    lines: list[str] = []
    for raw in text.split("\n"):
        line = "".join(
            char
            for char in raw
            if char == "\t" or not unicodedata.category(char).startswith("C")
        ).rstrip()
        tokens = line.split()
        singles = sum(
            1 for token in tokens if len(token.strip(".,;:()[]{}")) <= 1
        )
        # A text layer that emits one glyph per token usually separates words
        # with a wider gap. Join only the single-character runs; leave a line
        # with ordinary words untouched.
        if (
            len(tokens) >= 8
            and singles / len(tokens) >= 0.6
            and "  " in line.strip()
        ):
            words = [
                word.replace(" ", "")
                for word in line.strip().split("  ")
                if word.strip()
            ]
            line = " ".join(word for word in words if word)
        else:
            line = re.sub(r"[ \t]{2,}", " ", line).strip()
        lines.append(line)
    return "\n".join(lines).strip()


@dataclass
class Metrics:
    chars: int = 0
    nonspace: int = 0
    tokens: int = 0
    wordish: int = 0
    single_ratio: float = 0.0
    alnum_ratio: float = 0.0
    latin_ratio: float = 0.0


def metrics(text: str) -> Metrics:
    tokens = text.split()
    nonspace = sum(1 for char in text if not char.isspace())
    alnum = sum(1 for char in text if char.isalnum())
    alpha = sum(1 for char in text if char.isalpha())
    latin = sum(1 for char in text if char.isalpha() and char.isascii())
    singles = sum(1 for token in tokens if len(token) == 1)
    wordish = sum(1 for token in tokens if len(token) >= 2 and any(c.isalpha() for c in token))
    return Metrics(
        chars=len(text),
        nonspace=nonspace,
        tokens=len(tokens),
        wordish=wordish,
        single_ratio=round(singles / len(tokens), 3) if tokens else 0.0,
        alnum_ratio=round(alnum / nonspace, 3) if nonspace else 0.0,
        latin_ratio=round(latin / alpha, 3) if alpha else 0.0,
    )


def usable(m: Metrics) -> bool:
    return (
        m.nonspace >= MIN_NONSPACE
        and m.wordish >= MIN_WORDISH
        and m.single_ratio <= 0.35
        and m.alnum_ratio >= 0.55
        and m.latin_ratio >= 0.85
    )


def render(page, dpi: int = OCR_DPI) -> bytes:
    import pypdfium2 as pdfium
    from PIL import Image

    scale = dpi / 72.0
    bitmap = page.render(scale=scale)
    image = bitmap.to_pil().convert("RGB")
    # Bound the long edge to the same pixel budget as the production path.
    max_side = 3500
    if max(image.size) > max_side:
        ratio = max_side / max(image.size)
        image = image.resize(
            (max(1, int(image.width * ratio)), max(1, int(image.height * ratio)))
        )
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def ocr_page(engine, png: bytes) -> tuple[str, float, float]:
    import numpy as np
    from PIL import Image

    image = Image.open(io.BytesIO(png)).convert("RGB")
    started = time.perf_counter()
    result = engine(np.asarray(image))
    elapsed = time.perf_counter() - started
    texts = list(getattr(result, "txts", []) or [])
    scores = list(getattr(result, "scores", []) or [])
    lines = [str(text).strip() for text in texts if str(text).strip()]
    accepted = [float(score) for score in scores if float(score) >= 0.5]
    mean_score = statistics.fmean(accepted) if accepted else 0.0
    return "\n".join(lines), mean_score, elapsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures", type=Path, default=FIXTURES)
    parser.add_argument("--limit-pages", type=int, default=3)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        from rapidocr import RapidOCR
    except Exception as exc:  # pragma: no cover - decision tool
        raise SystemExit(f"RapidOCR is not installed: {exc}") from exc

    rows: list[dict] = []
    engine = None
    process = psutil.Process()
    names = [
        "text.pdf",
        "letter-spaced.pdf",
        "image-only.pdf",
        "mixed.pdf",
        "non-latin.pdf",
    ]
    for name in names:
        path = args.fixtures / name
        if not path.exists():
            print(f"skip missing {name}")
            continue
        reader = PdfReader(str(path))
        if reader.is_encrypted:
            reader.decrypt("")
        import pypdfium2 as pdfium

        pdfium_doc = pdfium.PdfDocument(str(path))
        for index, page in enumerate(reader.pages[: args.limit_pages]):
            plain = normalize_text(page.extract_text() or "")
            layout = ""
            try:
                layout = normalize_text(
                    page.extract_text(extraction_mode="layout") or ""
                )
            except Exception:
                layout = ""
            plain_m = metrics(plain)
            layout_m = metrics(layout)
            row = {
                "fixture": name,
                "page": index + 1,
                "plain": asdict(plain_m),
                "layout": asdict(layout_m),
                "plain_usable": usable(plain_m),
                "layout_usable": usable(layout_m),
            }
            if not (usable(plain_m) or usable(layout_m)):
                if engine is None:
                    init_started = time.perf_counter()
                    engine = RapidOCR()
                    row["ocr_init_seconds"] = round(
                        time.perf_counter() - init_started, 3
                    )
                before_rss = process.memory_info().rss
                png = render(pdfium_doc[index])
                text, score, elapsed = ocr_page(engine, png)
                text = normalize_text(text)
                text_m = metrics(text)
                row.update(
                    {
                        "ocr": asdict(text_m),
                        "ocr_score": round(score, 3),
                        "ocr_seconds": round(elapsed, 3),
                        "ocr_png_bytes": len(png),
                        "rss_delta_mb": round(
                            (process.memory_info().rss - before_rss) / (1024 * 1024),
                            1,
                        ),
                        "ocr_usable": usable(text_m) and score >= OCR_MIN_SCORE,
                    }
                )
            rows.append(row)

    if args.json:
        print(json.dumps(rows, indent=2))
        return

    print(
        "| Fixture | Page | Plain chars | Plain usable | Layout chars | "
        "Layout usable | OCR score | OCR chars | OCR usable |"
    )
    print("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for row in rows:
        ocr_score = row.get("ocr_score", "-")
        ocr_chars = row.get("ocr", {}).get("chars", "-")
        ocr_usable = row.get("ocr_usable", "-")
        print(
            f"| {row['fixture']} | {row['page']} | {row['plain']['chars']} | "
            f"{row['plain_usable']} | {row['layout']['chars']} | "
            f"{row['layout_usable']} | {ocr_score} | {ocr_chars} | {ocr_usable} |"
        )


if __name__ == "__main__":
    main()
