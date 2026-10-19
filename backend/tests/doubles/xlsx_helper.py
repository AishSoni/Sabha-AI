"""Test helper: build an in-memory .xlsx workbook from row tuples."""

import io
from typing import Iterable, Sequence


def build_xlsx(rows: Iterable[Sequence[object]]) -> bytes:
    """Serialize the given row tuples as a tiny xlsx file.

    Args:
        rows: iterable of row tuples; every row becomes one sheet row and all
            values are written as plain strings/numbers.
    """
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    for row in rows:
        ws.append(list(row))
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
