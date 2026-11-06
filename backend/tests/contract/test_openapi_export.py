"""The exported OpenAPI fixture must match the live application schema.

API contracts are checked against executable schemas and JSON fixtures, not
specification markdown, which is documentation only.
"""

from __future__ import annotations

from scripts.export_openapi import DEFAULT_FIXTURE, main as export_main


def test_openapi_export_check_passes():
    assert DEFAULT_FIXTURE.exists()
    assert export_main(["--check"]) == 0
