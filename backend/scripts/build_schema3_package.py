"""Build the schema-3 prepared-turn package without touching published v7."""

from __future__ import annotations

from pathlib import Path

from scripts.build_guided_package import BACKEND, build

ROOT = BACKEND / "replay_packages" / "hdfc-ine001a07rw5-v8"


def main() -> None:
    build(ROOT, schema_version=3, version="8")


if __name__ == "__main__":
    main()
