"""Spec 16: page-aware PDF extraction, quality gating, and normalization."""

from __future__ import annotations

import multiprocessing
from pathlib import Path

import pytest

from app.modules.knowledge.infrastructure.pdf_extraction import (
    ExtractedPage,
    ExtractionOptions,
    OcrResult,
    PdfDeadlineExceeded,
    PdfEncryptedError,
    PdfExtractionError,
    PdfLimitError,
    PdfMalformedError,
    PdfPageUnreadable,
    assess_text,
    extract_pdf,
    extract_pdf_bounded,
    normalize_extracted_text,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "pdf"


class StubOcr:
    def __init__(
        self,
        text: str = "SCANNED TERM SHEET HDFC SERIES V-007 Rs. 2,000 crore 7.87% p.a.",
        *,
        score: float = 0.95,
    ) -> None:
        self.text = text
        self.score = score
        self.calls = 0
        self.images: list[bytes] = []

    def recognize(self, image: bytes) -> OcrResult:
        self.calls += 1
        self.images.append(image)
        return OcrResult(text=self.text, mean_score=self.score)


def _extract(name: str, **kwargs):
    return extract_pdf((FIXTURES / name).read_bytes(), **kwargs)


def test_normalization_repairs_letter_spacing_without_destroying_values():
    raw = (
        "H D F C  S E R I E S  V - 0 0 7\n"
        "A M O U N T  R S  2  0 0 0  C R O R E\n"
        "Coupon: 7.87% p.a. dated 15 July 2019"
    )

    text = normalize_extracted_text(raw)

    assert "HDFC SERIES V-007" in text
    assert "AMOUNT RS 2000 CRORE" in text
    assert "Coupon: 7.87% p.a. dated 15 July 2019" in text
    assert "C o u p o n" not in text


def test_normalization_keeps_ordinary_word_spaces():
    text = normalize_extracted_text(
        "The quick brown fox jumps over the lazy dog. Amount Rs. 2,000 crore."
    )

    assert text == "The quick brown fox jumps over the lazy dog. Amount Rs. 2,000 crore."


def test_normal_text_pdf_is_ordered_and_page_aware():
    extraction = _extract("text.pdf")

    assert extraction.page_count == 2
    assert extraction.ocr_page_numbers == ()
    assert extraction.extraction_method == "pypdf"
    assert [page.page_number for page in extraction.pages] == [1, 2]
    assert [page.method for page in extraction.pages] == ["text", "text"]
    assert "SABHA TERM SHEET" in extraction.pages[0].text
    assert "Series V-007 dated 15 July 2019" in extraction.pages[0].text
    assert "Final maturity: 18 July 2022" in extraction.pages[1].text
    assert extraction.pages[0].text.index("SABHA TERM SHEET") < extraction.pages[0].text.index(
        "Amount: Rs. 2,000 crore"
    )


def test_letter_spaced_text_layer_is_repaired_before_ocr():
    ocr = StubOcr()

    extraction = _extract("letter-spaced.pdf", ocr=ocr)

    assert ocr.calls == 0
    assert extraction.ocr_page_numbers == ()
    assert extraction.pages[0].method == "text"
    assert "HDFC SERIES V-007" in extraction.pages[0].text
    assert "HOUSING DEVELOPMENT FINANCE CORPORATION LIMITED" in extraction.pages[0].text
    assert "AMOUNT RS 2000 CRORE" in extraction.pages[0].text
    assert assess_text(extraction.pages[0].text).usable


def test_image_only_page_uses_ocr_and_keeps_meaningful_phrases():
    ocr = StubOcr()

    extraction = _extract("image-only.pdf", ocr=ocr)

    assert ocr.calls == 1
    assert extraction.ocr_page_numbers == (1,)
    assert extraction.extraction_method == "pypdf+ocr"
    assert extraction.pages[0].method == "ocr"
    assert extraction.pages[0].score == pytest.approx(0.95)
    assert "SCANNED TERM SHEET" in extraction.pages[0].text
    assert b"\x89PNG" in ocr.images[0]


def test_mixed_pages_are_not_duplicated_reordered_or_dropped():
    ocr = StubOcr("SCANNED TERM SHEET HDFC SERIES V-007 Housing Development Finance")

    extraction = _extract("mixed.pdf", ocr=ocr)

    assert [page.page_number for page in extraction.pages] == [1, 2, 3]
    assert [page.method for page in extraction.pages] == ["text", "ocr", "text"]
    assert extraction.ocr_page_numbers == (2,)
    assert "MIXED DOCUMENT PAGE ONE" in extraction.pages[0].text
    assert "SCANNED TERM SHEET" in extraction.pages[1].text
    assert "FINAL TEXT PAGE THREE" in extraction.pages[2].text
    assert "MIXED DOCUMENT PAGE ONE" not in extraction.pages[1].text
    assert "FINAL TEXT PAGE THREE" not in extraction.pages[1].text


def test_blank_page_is_accepted_without_ocr_but_has_no_text():
    ocr = StubOcr()

    extraction = _extract("blank.pdf", ocr=ocr)

    assert ocr.calls == 0
    assert extraction.pages[0].method == "blank"
    assert extraction.pages[0].text == ""
    assert extraction.text.strip() == ""


def test_non_latin_ocr_output_fails_instead_of_publishing_garbage():
    ocr = StubOcr("ТЕРМ ШИТ ОБЛИГАЦИЯ СЕРИИ V-007", score=0.99)

    with pytest.raises(PdfPageUnreadable) as caught:
        _extract("non-latin.pdf", ocr=ocr)

    assert "1" in str(caught.value)
    assert "script" in str(caught.value).lower() or "latin" in str(caught.value).lower()


def test_low_ocr_confidence_fails_even_when_text_shape_looks_plausible():
    ocr = StubOcr("SCANNED TERM SHEET HDFC SERIES V-007 Rs. 2,000 crore", score=0.5)

    with pytest.raises(PdfPageUnreadable):
        _extract("image-only.pdf", ocr=ocr)


def test_password_protected_pdf_fails_with_actionable_error():
    with pytest.raises(PdfEncryptedError):
        _extract("encrypted-password.pdf", ocr=StubOcr())


def test_empty_password_pdf_is_readable():
    extraction = _extract("encrypted-empty-password.pdf")

    assert extraction.page_count == 2
    assert "SABHA TERM SHEET" in extraction.pages[0].text


def test_malformed_pdf_fails_safely():
    with pytest.raises(PdfMalformedError):
        _extract("malformed.pdf", ocr=StubOcr())


def test_page_budget_is_explicit():
    with pytest.raises(PdfLimitError):
        _extract("text.pdf", ocr=StubOcr(), options=ExtractionOptions(max_pages=1))


def test_character_budget_is_explicit():
    with pytest.raises(PdfLimitError):
        _extract(
            "text.pdf",
            ocr=StubOcr(),
            options=ExtractionOptions(max_characters=10),
        )


def test_expired_deadline_fails_before_extraction():
    with pytest.raises(PdfExtractionError) as caught:
        _extract("text.pdf", options=ExtractionOptions(deadline_seconds=0))

    assert "deadline" in str(caught.value).lower()


def test_ocr_page_budget_is_explicit():
    with pytest.raises(PdfLimitError):
        _extract("image-only.pdf", ocr=StubOcr(), options=ExtractionOptions(max_ocr_pages=0))


def test_ocr_dependency_error_is_not_silently_ignored():
    class MissingOcr:
        def recognize(self, image: bytes) -> OcrResult:
            raise PdfExtractionError("OCR dependency is not installed")

    with pytest.raises(PdfExtractionError, match="OCR dependency"):
        _extract("image-only.pdf", ocr=MissingOcr())


def test_bounded_extraction_terminates_the_child_on_deadline():
    with pytest.raises(PdfDeadlineExceeded):
        extract_pdf_bounded(
            (FIXTURES / "image-only.pdf").read_bytes(),
            options=ExtractionOptions(deadline_seconds=0.25),
        )

    assert not [
        child
        for child in multiprocessing.active_children()
        if child.name == "sabha-pdf-extraction"
    ]


def test_extracted_page_exposes_its_source_locator():
    extraction = _extract("text.pdf")

    assert isinstance(extraction.pages[0], ExtractedPage)
    assert extraction.pages[0].source_locator == "page:1"
    assert extraction.pages[1].source_locator == "page:2"
