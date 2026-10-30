"""Export the live OpenAPI document or verify the frozen frontend fixture.

The frontend owns a committed snapshot at
``frontend/tests/fixtures/openapi.json``. ``--check`` makes a drift between
the running application and that snapshot a failing command instead of a
review-time surprise.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FIXTURE = REPO_ROOT / "frontend" / "tests" / "fixtures" / "openapi.json"


def build_document() -> dict:
    """Return the live application schema without importing FastAPI at module load."""
    import os

    # Schema generation never verifies a token; keep the contract command usable
    # before an operator account is provisioned. Runtime startup still fails
    # closed because only ``create_app`` reads the real environment.
    os.environ.setdefault("OPERATOR_USER_ID", "00000000-0000-4000-8000-000000000000")
    os.environ.setdefault("SUPABASE_AUTH_PUBLISHABLE_KEY", "fixture-publishable-key")

    from main import app

    return app.openapi()


def _serialize(document: dict) -> str:
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if the generated schema differs from the stored fixture",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help=f"destination path (default: {DEFAULT_FIXTURE})",
    )
    args = parser.parse_args(argv)

    destination = args.output or DEFAULT_FIXTURE
    document = build_document()

    if args.check:
        if not destination.exists():
            print(f"OpenAPI fixture is missing: {destination}")
            return 1
        expected = json.loads(destination.read_text(encoding="utf-8"))
        if document != expected:
            print(f"OpenAPI drift: {destination} does not match app.openapi()")
            return 1
        print(f"OpenAPI matches {destination} ({len(document.get('paths', {}))} paths)")
        return 0

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(_serialize(document), encoding="utf-8")
    print(f"Wrote {destination} ({len(document.get('paths', {}))} paths)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
