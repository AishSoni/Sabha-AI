"""Build schema-3 version 11 with approved friendly demo names."""

from __future__ import annotations

from pathlib import Path

from scripts.build_guided_package import (
    BACKEND,
    CONSENSUS_THINKING_V9,
    build,
)

ROOT = BACKEND / "replay_packages" / "hdfc-ine001a07rw5-v11"
DISPLAY_NAMES = {
    "The Credit Analyst": "Mira",
    "The Downside Reviewer": "Arjun",
    "The Portfolio Analyst": "Leena",
}


def main() -> None:
    build(
        ROOT,
        schema_version=3,
        version="11",
        consensus_thinking=CONSENSUS_THINKING_V9,
        display_names=DISPLAY_NAMES,
    )


if __name__ == "__main__":
    main()
