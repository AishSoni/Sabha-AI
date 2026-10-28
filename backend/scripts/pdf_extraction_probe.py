"""Deployment probe for the Spec 16 PDF/OCR fallback.

This intentionally does not touch the network. It verifies that the pip
dependencies are importable, that the bundled OCR models exist, and that a
small in-memory render can be recognized. Run it in the target worker
environment before advertising scanned-PDF support:

    venv\\Scripts\\python.exe scripts\\pdf_extraction_probe.py
"""

from __future__ import annotations

import importlib.metadata
import io
import json
import sys
from pathlib import Path

REQUIRED_MODELS = (
    "PP-OCRv6_det_small.onnx",
    "PP-OCRv6_rec_small.onnx",
    "ch_ppocr_mobile_v2.0_cls_mobile.onnx",
)
PACKAGES = (
    "pypdf",
    "pypdfium2",
    "Pillow",
    "rapidocr",
    "onnxruntime",
    "psutil",
)


def _models_dir() -> Path:
    import rapidocr

    root = Path(rapidocr.__file__).resolve().parent
    return root / "models"


def _probe_image() -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    image = Image.new("RGB", (1000, 240), "white")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("arial.ttf", 56)
    except OSError:
        font = ImageFont.load_default(size=56)
    draw.text((40, 80), "SABHA PDF PROBE 2026", fill="black", font=font)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def main() -> int:
    versions: dict[str, str] = {}
    for package in PACKAGES:
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError as exc:
            print(f"probe failed: package not installed: {exc.name}", file=sys.stderr)
            return 2

    models = _models_dir()
    missing = [name for name in REQUIRED_MODELS if not (models / name).is_file()]
    if missing:
        print(
            "probe failed: bundled OCR models missing: " + ", ".join(missing),
            file=sys.stderr,
        )
        return 3

    import numpy as np
    from PIL import Image
    from rapidocr import RapidOCR

    try:
        engine = RapidOCR(params={"Global.log_level": "warning"})
        image = Image.open(io.BytesIO(_probe_image())).convert("RGB")
        result = engine(np.asarray(image))
    except Exception as exc:  # pragma: no cover - environment-specific failure
        print(f"probe failed: OCR execution error: {exc}", file=sys.stderr)
        return 4

    texts = [str(text).strip() for text in (result.txts or []) if str(text).strip()]
    if not texts:
        print("probe failed: OCR returned no text", file=sys.stderr)
        return 5

    print(
        json.dumps(
            {
                "status": "ok",
                "packages": versions,
                "models_dir": str(models),
                "models": list(REQUIRED_MODELS),
                "ocr_text": texts,
                "ocr_scores": [round(float(score), 3) for score in (result.scores or [])],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
