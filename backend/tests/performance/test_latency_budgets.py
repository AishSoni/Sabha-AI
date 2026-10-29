"""Opt-in real-environment latency record for Spec 20.

This suite never runs by default: it needs a deployed API and, for the
co-located gate, environment variables describing where the API and database
actually run. WAN numbers are recorded in the JSON artifact, not asserted;
absolute p95 budgets apply only when ``SABHA_PERF_COLOCATED=1`` says the API
and database share a region.

Example (PowerShell)::

    $env:SABHA_PERF_BASE_URL = "http://127.0.0.1:8000"
    $env:SABHA_PERF_OUTPUT = "C:\\conda_tmp\\sabha-perf\\after.json"
    $env:SABHA_PERF_COLOCATED = "1"
    python -m pytest tests/performance -q
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

import pytest

from scripts.latency_probe import collect, summarize


pytestmark = pytest.mark.performance


# Only used for a deployment the operator declares co-located with the
# database. They are deliberately loose: each budget still allows tens of
# round trips' worth of headroom for payload assembly.
COLOCATED_P95_BUDGET_MS = {
    "health": 100,
    "providers": 250,
    "meetings": 250,
    "meeting": 350,
    "context-stats": 250,
    "closing": 350,
    "personas": 350,
    "participant-templates": 150,
    "replay-session": 500,
}


def _output_path(tmp_path: Path) -> Path:
    configured = os.getenv("SABHA_PERF_OUTPUT", "").strip()
    return Path(configured) if configured else tmp_path / "latency.json"


def test_record_real_environment_latency(tmp_path: Path) -> None:
    base_url = os.getenv("SABHA_PERF_BASE_URL", "").strip().rstrip("/")
    if not base_url:
        pytest.skip("set SABHA_PERF_BASE_URL to record a real-environment sample")

    samples = collect(
        base_url,
        samples=int(os.getenv("SABHA_PERF_SAMPLES", "5")),
        timeout=float(os.getenv("SABHA_PERF_TIMEOUT", "60")),
    )
    rows = summarize(samples)
    assert rows, "latency probe collected no samples"

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "api_region": os.getenv("SABHA_PERF_API_REGION", "unrecorded"),
        "database_region": os.getenv("SABHA_PERF_DB_REGION", "unrecorded"),
        "colocated": os.getenv("SABHA_PERF_COLOCATED") == "1",
        "notes": os.getenv("SABHA_PERF_NOTES", ""),
        "rows": rows,
        "samples": [asdict(sample) for sample in samples],
    }
    output = _output_path(tmp_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"latency report: {output}")

    if os.getenv("SABHA_PERF_COLOCATED") != "1":
        return

    observed = {row["target"]: row for row in rows}
    for target, budget in COLOCATED_P95_BUDGET_MS.items():
        row = observed.get(target)
        if row is None or row["p95_ms"] is None:
            continue
        assert row["p95_ms"] <= budget, (
            f"{target} p95 {row['p95_ms']} ms exceeds co-located budget {budget} ms"
        )
