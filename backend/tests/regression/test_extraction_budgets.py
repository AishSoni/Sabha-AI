"""Regression (spec-02 E2): extraction budgets.

Document parsing materializes everything it is given: every xlsx row, every
character. A hostile (or merely huge) file freezes ingestion and can exhaust
memory. Locked behavior:

- `budgeted_rows(rows, max_rows)` yields at most the cap (unit-tested pure);
- the xlsx path stops after MAX_ROWS_PER_SHEET rows;
- parse_file output is capped at MAX_EXTRACT_CHARACTERS characters;
- budgets are truncations, not errors: a capped document still ingests the
  portion within budget, and genuine parse failures never publish partial
  output (unchanged: chunks are only used after a successful parse).
"""

import pytest

from app.services import document_processor as dp_module
from app.services.document_processor import DocumentProcessor
from tests.doubles.xlsx_helper import build_xlsx  # helper to create workbooks


def test_budgeted_rows_yields_at_most_the_cap():
    rows = iter([f"row-{i}" for i in range(10)])

    kept = list(dp_module.budgeted_rows(rows, max_rows=4))

    assert kept == ["row-0", "row-1", "row-2", "row-3"]


def test_xlsx_row_budget_truncates(monkeypatch):
    monkeypatch.setattr(dp_module, "MAX_ROWS_PER_SHEET", 4)
    payload = build_xlsx([("Offset", "numbers"), *((f"row-{i}", str(i)) for i in range(1, 20))])

    text = DocumentProcessor().parse_file(payload, "big.xlsx", "xlsx")

    assert "row-1" in text
    assert "row-9" not in text, "rows beyond the budget must not be extracted"


def test_text_content_character_budget(monkeypatch):
    monkeypatch.setattr(dp_module, "MAX_EXTRACT_CHARACTERS", 25)

    text = DocumentProcessor().parse_file(b"x" * 100, "notes.txt", "txt")

    assert len(text) <= 25
