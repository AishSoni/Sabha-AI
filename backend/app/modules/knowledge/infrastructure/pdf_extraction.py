"""Page-aware PDF extraction with a bounded local OCR fallback (Spec 16).

The module deliberately knows nothing about storage, databases, or the
knowledge ingestion lifecycle. It turns immutable PDF bytes into ordered page
text and reports which pages needed the fallback. Callers enforce the durable
operation contract.
"""

from __future__ import annotations

import io
import logging
import multiprocessing
import os
import re
import statistics
import time
import unicodedata
from dataclasses import dataclass
from typing import Literal, Protocol

logger = logging.getLogger(__name__)

EXTRACTION_VERSION = "1"
OCR_MIN_SCORE = 0.75
MIN_NONSPACE = 24
MIN_WORDISH = 4
MAX_SINGLE_CHARACTER_RATIO = 0.35
MIN_ALNUM_RATIO = 0.55
MIN_LATIN_RATIO = 0.85
MAX_CHARACTERS = 2_000_000

PageMethod = Literal["text", "layout", "ocr", "blank"]

_LIGATURES = {
    "\ufb00": "ff",
    "\ufb01": "fi",
    "\ufb02": "fl",
    "\ufb03": "ffi",
    "\ufb04": "ffl",
}


class PdfExtractionError(Exception):
    """Bounded, user-actionable PDF extraction failure."""


class PdfMalformedError(PdfExtractionError):
    pass


class PdfEncryptedError(PdfExtractionError):
    pass


class PdfLimitError(PdfExtractionError):
    pass


class PdfDeadlineExceeded(PdfExtractionError):
    pass


class PdfPageUnreadable(PdfExtractionError):
    pass


class PdfOcrUnavailable(PdfExtractionError):
    pass


@dataclass(frozen=True)
class OcrResult:
    text: str
    mean_score: float


class OcrEngine(Protocol):
    def recognize(self, image: bytes) -> OcrResult: ...


@dataclass(frozen=True)
class ExtractionOptions:
    max_pages: int = 200
    max_ocr_pages: int = 30
    dpi: int = 200
    max_render_pixels: int = 8_000_000
    ocr_min_score: float = OCR_MIN_SCORE
    page_timeout_seconds: float = 20.0
    deadline_seconds: float = 90.0
    blank_ink_ratio: float = 0.0002
    max_characters: int = MAX_CHARACTERS


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str
    method: PageMethod
    score: float | None = None

    @property
    def source_locator(self) -> str:
        return f"page:{self.page_number}"


@dataclass(frozen=True)
class PdfExtraction:
    pages: tuple[ExtractedPage, ...]
    page_count: int
    extraction_method: str
    extraction_version: str = EXTRACTION_VERSION
    ocr_page_numbers: tuple[int, ...] = ()

    @property
    def text(self) -> str:
        return "\n\n".join(page.text for page in self.pages if page.text.strip())


@dataclass(frozen=True)
class TextAssessment:
    nonspace: int
    tokens: int
    wordish: int
    single_ratio: float
    alnum_ratio: float
    latin_ratio: float
    reasons: tuple[str, ...]

    @property
    def usable(self) -> bool:
        return not self.reasons


def _clean_controls(text: str) -> str:
    kept = []
    for char in text:
        if char == "\n":
            kept.append(char)
        elif char == "\t":
            kept.append(" ")
        elif unicodedata.category(char).startswith("C"):
            continue
        elif char in {"\u2028", "\u2029", "\u0085"}:
            kept.append("\n")
        else:
            kept.append(char)
    return "".join(kept)


def normalize_extracted_text(text: str) -> str:
    """Normalize extraction artifacts without deleting ordinary word spaces.

    Letter-spaced PDF text layers emit one glyph per token and use a wider gap
    between words. Only lines that look like that artifact are repaired; other
    lines keep their word boundaries.
    """
    text = unicodedata.normalize("NFC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\u00a0", " ").replace("\u00ad", "")
    for ligature, replacement in _LIGATURES.items():
        text = text.replace(ligature, replacement)
    text = _clean_controls(text)

    lines: list[str] = []
    for raw in text.split("\n"):
        line = raw.rstrip()
        tokens = line.split()
        alnum_tokens = [token for token in tokens if any(c.isalnum() for c in token)]
        singles = sum(
            1
            for token in alnum_tokens
            if len([c for c in token if c.isalnum()]) == 1
        )
        single_ratio = singles / len(alnum_tokens) if alnum_tokens else 0.0
        if (
            len(alnum_tokens) >= 8
            and single_ratio >= 0.6
            and "  " in line.strip()
        ):
            words = [
                re.sub(r"\s+", "", word)
                for word in line.strip().split("  ")
                if word.strip()
            ]
            merged: list[str] = []
            digit_run = False
            for word in words:
                if word.isdigit() and digit_run and merged:
                    merged[-1] += word
                    continue
                merged.append(word)
                digit_run = word.isdigit() and len(word) == 1
            line = " ".join(merged)
        else:
            line = re.sub(r"[ \t]{2,}", " ", line).strip()
        lines.append(line)

    normalized = "\n".join(lines)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def assess_text(text: str, *, ocr_score: float | None = None) -> TextAssessment:
    tokens = text.split()
    nonspace = sum(1 for char in text if not char.isspace())
    alnum = sum(1 for char in text if char.isalnum())
    alpha = sum(1 for char in text if char.isalpha())
    latin = sum(1 for char in text if char.isalpha() and char.isascii())
    alnum_tokens = [token for token in tokens if any(c.isalnum() for c in token)]
    singles = sum(
        1
        for token in alnum_tokens
        if len([c for c in token if c.isalnum()]) == 1
    )
    wordish = sum(
        1
        for token in tokens
        if len([c for c in token if c.isalpha()]) >= 2
    )
    single_ratio = singles / len(alnum_tokens) if alnum_tokens else 0.0
    alnum_ratio = alnum / nonspace if nonspace else 0.0
    latin_ratio = latin / alpha if alpha else 1.0

    reasons: list[str] = []
    if nonspace < MIN_NONSPACE:
        reasons.append("too little text")
    if wordish < MIN_WORDISH:
        reasons.append("too few words")
    if single_ratio > MAX_SINGLE_CHARACTER_RATIO:
        reasons.append("letter-spaced text layer")
    if alnum_ratio < MIN_ALNUM_RATIO:
        reasons.append("too few letters or digits")
    if latin_ratio < MIN_LATIN_RATIO:
        reasons.append("not primarily Latin script")
    if ocr_score is not None and ocr_score < OCR_MIN_SCORE:
        reasons.append("low OCR confidence")

    return TextAssessment(
        nonspace=nonspace,
        tokens=len(tokens),
        wordish=wordish,
        single_ratio=round(single_ratio, 3),
        alnum_ratio=round(alnum_ratio, 3),
        latin_ratio=round(latin_ratio, 3),
        reasons=tuple(reasons),
    )


class RapidOcrEngine:
    """Lazy wrapper over the bundled RapidOCR/ONNX models.

    Importing and constructing this class is intentionally deferred until a
    page actually needs OCR. Text PDFs therefore keep working on hosts where
    the OCR dependency is unavailable.
    """

    REQUIRED_MODELS = (
        "PP-OCRv6_det_small.onnx",
        "PP-OCRv6_rec_small.onnx",
        "ch_ppocr_mobile_v2.0_cls_mobile.onnx",
    )

    def __init__(self) -> None:
        self._engine = None

    @classmethod
    def models_dir(cls):
        import rapidocr

        from pathlib import Path

        return Path(rapidocr.__file__).resolve().parent / "models"

    @classmethod
    def verify_models(cls) -> None:
        missing = [
            name
            for name in cls.REQUIRED_MODELS
            if not (cls.models_dir() / name).is_file()
        ]
        if missing:
            raise PdfOcrUnavailable(
                "PDF OCR models are missing: " + ", ".join(missing)
            )

    def _engine_or_raise(self):
        if self._engine is not None:
            return self._engine
        try:
            from rapidocr import RapidOCR
        except Exception as exc:  # pragma: no cover - environment specific
            raise PdfOcrUnavailable(
                "PDF OCR dependency is not installed; scanned pages cannot be read"
            ) from exc
        self.verify_models()
        try:
            self._engine = RapidOCR(
                params={
                    "Global.log_level": "warning",
                    "EngineConfig.onnxruntime.intra_op_num_threads": 1,
                    "EngineConfig.onnxruntime.inter_op_num_threads": 1,
                }
            )
        except Exception as exc:  # pragma: no cover - environment specific
            raise PdfOcrUnavailable(f"PDF OCR engine failed to start: {exc}") from exc
        return self._engine

    def recognize(self, image: bytes) -> OcrResult:
        engine = self._engine_or_raise()
        try:
            from PIL import Image
            import numpy as np

            with Image.open(io.BytesIO(image)) as opened:
                pixels = np.asarray(opened.convert("RGB"))
            result = engine(pixels)
        except PdfExtractionError:
            raise
        except Exception as exc:  # pragma: no cover - environment specific
            raise PdfOcrUnavailable(f"PDF OCR failed: {exc}") from exc

        texts = [
            str(text).strip()
            for text in (getattr(result, "txts", None) or [])
            if str(text).strip()
        ]
        scores = [
            float(score)
            for score in (getattr(result, "scores", None) or [])
            if score is not None
        ]
        accepted = [score for score in scores if score >= 0.5]
        mean_score = statistics.fmean(accepted) if accepted else 0.0
        return OcrResult(text="\n".join(texts), mean_score=mean_score)


def _deadline(options: ExtractionOptions) -> float:
    return time.monotonic() + max(0.0, options.deadline_seconds)


def _check_deadline(deadline: float) -> None:
    if time.monotonic() >= deadline:
        raise PdfDeadlineExceeded("PDF extraction deadline exceeded")


def _open_reader(data: bytes):
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            try:
                decrypted = reader.decrypt("")
            except Exception as exc:
                raise PdfEncryptedError(
                    "PDF is encrypted and cannot be opened without a password"
                ) from exc
            if not decrypted:
                raise PdfEncryptedError(
                    "PDF is encrypted and cannot be opened without a password"
                )
        return reader
    except PdfExtractionError:
        raise
    except Exception as exc:
        raise PdfMalformedError(
            "PDF is malformed or uses an unsupported structure"
        ) from exc


def _render_page(document, index: int, options: ExtractionOptions):
    import pypdfium2 as pdfium
    from PIL import Image

    page = document[index]
    try:
        width, height = page.get_size()
        scale = options.dpi / 72.0
        pixels = max(1.0, width * scale) * max(1.0, height * scale)
        if pixels > options.max_render_pixels:
            scale *= (options.max_render_pixels / pixels) ** 0.5
        bitmap = page.render(scale=scale)
        try:
            image = bitmap.to_pil().convert("RGB")
        finally:
            bitmap.close()
    finally:
        page.close()

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    gray = image.convert("L")
    histogram = gray.histogram()
    dark = sum(histogram[:240])
    total = max(1, image.width * image.height)
    return buffer.getvalue(), dark / total


def _readable_page(
    *, page_number: int, text: str, method: PageMethod, score: float | None = None
) -> ExtractedPage:
    return ExtractedPage(
        page_number=page_number,
        text=text,
        method=method,
        score=score,
    )


def _unreadable(page_number: int, reasons: tuple[str, ...]) -> PdfPageUnreadable:
    detail = ", ".join(reasons) if reasons else "no usable text"
    return PdfPageUnreadable(
        f"PDF page {page_number} has no usable extracted text ({detail})"
    )


def extract_pdf(
    data: bytes,
    *,
    ocr: OcrEngine | None = None,
    options: ExtractionOptions | None = None,
) -> PdfExtraction:
    """Extract ordered, page-located text from PDF bytes.

    Text layers are tried before OCR. A page that has ink but no usable text
    fails the whole document; no partial text is returned as success.
    """
    options = options or ExtractionOptions()
    deadline = _deadline(options)
    _check_deadline(deadline)

    reader = _open_reader(data)
    try:
        page_count = len(reader.pages)
    except Exception as exc:
        raise PdfMalformedError("PDF page tree is malformed") from exc
    if page_count > options.max_pages:
        raise PdfLimitError(
            f"PDF has {page_count} pages, above the {options.max_pages}-page budget"
        )

    engine = ocr
    pdfium_document = None
    pages: list[ExtractedPage] = []
    ocr_pages: list[int] = []
    accepted_characters = 0

    def accept(page: ExtractedPage) -> None:
        nonlocal accepted_characters
        accepted_characters += len(page.text)
        if accepted_characters > options.max_characters:
            raise PdfLimitError(
                "PDF text exceeds the "
                f"{options.max_characters}-character extraction budget"
            )
        pages.append(page)

    try:
        for index, page in enumerate(reader.pages):
            _check_deadline(deadline)
            page_number = index + 1
            plain = normalize_extracted_text(page.extract_text() or "")
            assessment = assess_text(plain)
            if assessment.usable:
                accept(_readable_page(page_number=page_number, text=plain, method="text"))
                continue

            layout = ""
            try:
                layout = normalize_extracted_text(
                    page.extract_text(extraction_mode="layout") or ""
                )
            except Exception:
                layout = ""
            layout_assessment = assess_text(layout)
            if layout_assessment.usable:
                accept(_readable_page(page_number=page_number, text=layout, method="layout"))
                continue

            if pdfium_document is None:
                try:
                    import pypdfium2 as pdfium

                    pdfium_document = pdfium.PdfDocument(data)
                except Exception as exc:
                    raise PdfExtractionError(
                        "PDF page could not be rendered for OCR"
                    ) from exc

            rendered, ink_ratio = _render_page(pdfium_document, index, options)
            if ink_ratio < options.blank_ink_ratio:
                accept(_readable_page(page_number=page_number, text="", method="blank"))
                continue

            if options.max_ocr_pages <= 0 or len(ocr_pages) >= options.max_ocr_pages:
                raise PdfLimitError(
                    f"PDF requires OCR on more than {options.max_ocr_pages} pages"
                )
            if engine is None:
                engine = RapidOcrEngine()
            started = time.monotonic()
            result = engine.recognize(rendered)
            elapsed = time.monotonic() - started
            if elapsed > options.page_timeout_seconds:
                raise PdfDeadlineExceeded(
                    f"PDF OCR on page {page_number} exceeded its page budget"
                )
            _check_deadline(deadline)

            text = normalize_extracted_text(result.text)
            ocr_assessment = assess_text(text, ocr_score=result.mean_score)
            if not ocr_assessment.usable:
                failure = _unreadable(page_number, ocr_assessment.reasons)
                if ocr_assessment.latin_ratio < MIN_LATIN_RATIO:
                    raise PdfPageUnreadable(
                        f"{failure} — the page does not appear to use a supported Latin script"
                    ) from None
                raise failure

            ocr_pages.append(page_number)
            accept(
                _readable_page(
                    page_number=page_number,
                    text=text,
                    method="ocr",
                    score=round(result.mean_score, 3),
                )
            )
    finally:
        if pdfium_document is not None:
            try:
                pdfium_document.close()
            except Exception:
                pass

    method = "pypdf+ocr" if ocr_pages else "pypdf"
    return PdfExtraction(
        pages=tuple(pages),
        page_count=page_count,
        extraction_method=method,
        ocr_page_numbers=tuple(ocr_pages),
    )


_ERROR_TYPES = {
    "PdfMalformedError": PdfMalformedError,
    "PdfEncryptedError": PdfEncryptedError,
    "PdfLimitError": PdfLimitError,
    "PdfDeadlineExceeded": PdfDeadlineExceeded,
    "PdfPageUnreadable": PdfPageUnreadable,
    "PdfOcrUnavailable": PdfOcrUnavailable,
    "PdfExtractionError": PdfExtractionError,
}


def _child_extract(connection, data: bytes, options: ExtractionOptions) -> None:
    for variable in (
        "OMP_NUM_THREADS",
        "OPENBLAS_NUM_THREADS",
        "MKL_NUM_THREADS",
        "NUMEXPR_NUM_THREADS",
    ):
        os.environ[variable] = "1"
    os.environ.setdefault("OPENCV_OPENCL_RUNTIME", "disabled")
    try:
        result = extract_pdf(data, options=options)
        connection.send(("ok", result))
    except PdfExtractionError as exc:
        connection.send(("error", type(exc).__name__, str(exc)))
    except BaseException as exc:  # pragma: no cover - defensive child boundary
        connection.send(
            ("error", "PdfExtractionError", f"PDF extraction failed: {exc}")
        )
    finally:
        connection.close()


def extract_pdf_bounded(
    data: bytes,
    *,
    options: ExtractionOptions | None = None,
    rss_limit_bytes: int = 1024**3,
) -> PdfExtraction:
    """Run extraction in a spawned child with a deadline and RSS watchdog.

    The child is always terminated and reaped. No shell is involved, no
    caller-provided path is opened, and the source bytes are only read.
    """
    options = options or ExtractionOptions()
    context = multiprocessing.get_context("spawn")
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(
        target=_child_extract,
        args=(sender, data, options),
        name="sabha-pdf-extraction",
        daemon=True,
    )
    process.start()
    sender.close()
    deadline = time.monotonic() + max(0.0, options.deadline_seconds)
    watchdog = None
    try:
        import psutil

        watchdog = psutil.Process(process.pid)
    except Exception:  # pragma: no cover - psutil is a required dependency
        watchdog = None

    payload = None
    failure: PdfExtractionError | None = None
    try:
        while True:
            if receiver.poll(0.1):
                try:
                    payload = receiver.recv()
                except EOFError:
                    payload = None
                break
            if not process.is_alive():
                if receiver.poll(0.1):
                    try:
                        payload = receiver.recv()
                    except EOFError:
                        payload = None
                break
            if watchdog is not None:
                try:
                    if watchdog.memory_info().rss > rss_limit_bytes:
                        failure = PdfLimitError(
                            "PDF extraction exceeded the memory budget"
                        )
                        break
                except Exception:
                    watchdog = None
            if time.monotonic() >= deadline:
                failure = PdfDeadlineExceeded(
                    "PDF extraction deadline exceeded"
                )
                break
    finally:
        if process.is_alive():
            process.terminate()
            process.join(timeout=5)
        if process.is_alive():
            process.kill()
            process.join(timeout=5)
        else:
            process.join(timeout=1)
        receiver.close()

    if failure is not None:
        raise failure
    if payload is None:
        raise PdfExtractionError(
            f"PDF extraction worker stopped unexpectedly (exit {process.exitcode})"
        )
    if payload[0] == "ok":
        return payload[1]
    _, error_type, message = payload
    raise _ERROR_TYPES.get(error_type, PdfExtractionError)(message)
