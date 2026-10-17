"""DB-backed journey package loader (Part B, offline, fail-closed).

The immutable authoring package lives in backend/data/demo_bond_package_v1.json
and, once published, in the demo_bond_packages table (migration 009). Runtime
code must load the pinned published row; hardcoded bond_scenario prose is
candidate material only, never production content.

No live AI/search/embedding/market calls originate here. Missing required
runtime assets raise PackageMissingError; optional audit metadata never
blocks publication.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

TABLE = "demo_bond_packages"
SCENARIO_ID = "indian-corporate-bond-review"
CONTENT_VERSION = 1
SCENARIO_REVISION = 1

REQUIRED_SOURCE_IDS = {
    "instrument-terms-v1",
    "issuer-financials-v1",
    "rating-rationale-v1",
    "market-evidence-v1",
    "downside-worksheet-v1",
}

REQUIRED_DISCLOSURE_SUBSTRINGS = (
    "recorded analysis",
    "not financial advice",
    "INE001A07RW5",
    "2020-07-31",
)


class PackageMissingError(ValueError):
    pass


def seed_path() -> Path:
    return Path(__file__).resolve().parents[3] / "data" / "demo_bond_package_v1.json"


def load_seed_package() -> dict[str, Any]:
    try:
        return json.loads(seed_path().read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise PackageMissingError(f"seed package missing: {seed_path()}") from exc


def validate_package(pkg: dict[str, Any]) -> dict[str, Any]:
    for key in ("scenario_id", "content_version", "scenario_revision", "sources",
                "claims", "specialists", "run_note", "recorded_invocations",
                "assertions", "guide", "disclosure", "instrument"):
        if key not in pkg:
            raise PackageMissingError(f"package missing required section: {key}")
    if pkg["scenario_id"] != SCENARIO_ID:
        raise PackageMissingError(f"second scenario rejected: {pkg.get('scenario_id')!r}")
    if pkg["instrument"].get("isin") != "INE001A07RW5":
        raise PackageMissingError("package ISIN drifted from INE001A07RW5")
    sources = pkg["sources"]
    by_id = {s.get("source_id") for s in sources}
    missing = REQUIRED_SOURCE_IDS - by_id
    if missing:
        raise PackageMissingError(f"package missing required sources: {sorted(missing)}")
    for source in sources:
        for field in ("title", "publisher", "snapshot_date", "page_locator", "excerpt"):
            if not (source.get(field) or "").strip():
                raise PackageMissingError(
                    f"source {source.get('source_id')!r} missing usable {field}"
                )
    worksheet = next(s for s in sources if s["source_id"] == "downside-worksheet-v1")
    if worksheet.get("visibility") != "private":
        raise PackageMissingError("downside worksheet must stay private")
    note = pkg["run_note"]
    if not note.get("honest_status") or "No live" not in note["honest_status"]:
        raise PackageMissingError("run note must honestly state offline human research")
    if note.get("auth") is not None:
        raise PackageMissingError("offline package must record auth=None")
    lowered = pkg["disclosure"].lower()
    for required in REQUIRED_DISCLOSURE_SUBSTRINGS:
        if required.lower() not in lowered:
            raise PackageMissingError(f"disclosure missing: {required}")
    if "meeting_id" in pkg or "messages" in pkg or "votes" in pkg:
        raise PackageMissingError("package must not preload visitor effects")
    return pkg


def package_row(pkg: dict[str, Any]) -> dict[str, Any]:
    return {
        "scenario_id": pkg["scenario_id"],
        "content_version": pkg["content_version"],
        "scenario_revision": pkg["scenario_revision"],
        "status": pkg.get("status", "published"),
        "package": pkg,
    }


def import_package(client: Any, pkg: dict[str, Any] | None = None) -> dict[str, Any]:
    """Idempotent upsert of the validated package. Returns the row."""
    validated = validate_package(pkg or load_seed_package())
    row = package_row(validated)
    client.table(TABLE).upsert(row, on_conflict="scenario_id,content_version,scenario_revision").execute()
    return row


def load_pinned_package(client: Any) -> dict[str, Any]:
    response = (
        client.table(TABLE)
        .select("*")
        .eq("scenario_id", SCENARIO_ID)
        .eq("content_version", CONTENT_VERSION)
        .eq("scenario_revision", SCENARIO_REVISION)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise PackageMissingError("published journey package not found; import first")
    return validate_package(rows[0]["package"])
