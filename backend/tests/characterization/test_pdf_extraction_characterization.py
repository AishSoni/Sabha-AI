"""Spec 16 characterization of the PDFs and the inherited extraction path.

These tests pin the *fixture properties* and the already-supported normal
text behavior. They deliberately do not freeze the inheriting bug where an
image-only page or a letter-spaced text layer becomes an empty/ready
document; those observations are recorded in ``docs/PDF_EXTRACTION.md``.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pypdf import PdfReader

from app.modules.knowledge.infrastructure.parsers import DocumentProcessor

pytestmark = pytest.mark.characterization

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "pdf"


def _read(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_normal_text_pdf_extracts_in_reading_order():
    text = DocumentProcessor().parse_file(
        _read("text.pdf"), file_name="text.pdf", file_type="pdf"
    )

    first = text.index("SABHA TERM SHEET")
    second = text.index("Series V-007 dated 15 July 2019")
    third = text.index("Amount: Rs. 2,000 crore")
    maturity = text.index("Final maturity: 18 July 2022")
    assert first < second < third < maturity
    assert "7.87% p.a." in text
    assert "INE001A07AB1" in text


def test_image_only_fixture_really_has_no_text_layer():
    page = PdfReader(str(FIXTURES / "image-only.pdf")).pages[0]
    assert (page.extract_text() or "").strip() == ""


def test_letter_spaced_fixture_really_has_single_character_tokens():
    text = PdfReader(str(FIXTURES / "letter-spaced.pdf")).pages[0].extract_text()
    tokens = (text or "").split()
    assert len(tokens) > 40
    single = sum(1 for token in tokens if len(token) == 1)
    assert single / len(tokens) > 0.9


def test_mixed_fixture_has_both_text_and_image_pages():
    reader = PdfReader(str(FIXTURES / "mixed.pdf"))
    extracted = [(page.extract_text() or "").strip() for page in reader.pages]
    assert "MIXED DOCUMENT PAGE ONE" in extracted[0]
    assert extracted[1] == ""
    assert "FINAL TEXT PAGE THREE" in extracted[2]
