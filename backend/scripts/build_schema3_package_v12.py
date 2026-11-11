"""Build schema-3 version 12 with approved friendly names and polish copy."""

from __future__ import annotations

from pathlib import Path

from scripts.build_guided_package import (
    BACKEND,
    CONSENSUS_THINKING_V9,
    COPY_PROFILE_POLISH,
    build,
)

ROOT = BACKEND / "replay_packages" / "hdfc-ine001a07rw5-v12"
DISPLAY_NAMES = {
    "The Credit Analyst": "Mira",
    "The Downside Reviewer": "Arjun",
    "The Portfolio Analyst": "Leena",
}


def main() -> None:
    build(
        ROOT,
        schema_version=3,
        version="12",
        consensus_thinking=CONSENSUS_THINKING_V9,
        display_names=DISPLAY_NAMES,
        copy_profile=COPY_PROFILE_POLISH,
    )


if __name__ == "__main__":
    main()
