"""Build schema-3 version 9 with order-neutral committee alignment copy."""

from __future__ import annotations

from pathlib import Path

from scripts.build_guided_package import (
    BACKEND,
    CONSENSUS_THINKING_V9,
    build,
)

ROOT = BACKEND / "replay_packages" / "hdfc-ine001a07rw5-v9"


def main() -> None:
    build(
        ROOT,
        schema_version=3,
        version="9",
        consensus_thinking=CONSENSUS_THINKING_V9,
    )


if __name__ == "__main__":
    main()
