"""Build schema-3 version 10 with demo vocabulary copy."""

from __future__ import annotations

from pathlib import Path

from scripts.build_guided_package import (
    BACKEND,
    CONSENSUS_THINKING_V9,
    build,
)

ROOT = BACKEND / "replay_packages" / "hdfc-ine001a07rw5-v10"


def main() -> None:
    build(
        ROOT,
        schema_version=3,
        version="10",
        consensus_thinking=CONSENSUS_THINKING_V9,
    )


if __name__ == "__main__":
    main()
