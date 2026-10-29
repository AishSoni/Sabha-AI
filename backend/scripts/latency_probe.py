"""Record real-environment endpoint latency for Spec 20 before/after notes.

The probe is deliberately dependency-light: it measures what a client observes,
groups samples per endpoint, and can optionally reproduce the event-loop
responsiveness experiment (health samples taken while load requests are in
flight, plus the load requests themselves).

Examples
--------
    python -m scripts.latency_probe --base-url http://127.0.0.1:8000
    python -m scripts.latency_probe --samples 5 --json .perf\\baseline.json
    python -m scripts.latency_probe --mode responsiveness \\
        --load-path /api/meetings/{meeting_id} --load 5

Absolute thresholds are intentionally absent here. Cross-region WAN numbers are
recorded, not asserted; the opt-in performance suite applies budgets only when
the deployment is known to be co-located with the database.
"""

from __future__ import annotations

import argparse
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence

import httpx


DEFAULT_TIMEOUT_SECONDS = 60.0


@dataclass(frozen=True)
class Target:
    """One endpoint to sample."""

    name: str
    method: str
    path: str
    body: dict | None = None


@dataclass
class Sample:
    """One request attempt."""

    target: str
    method: str
    path: str
    status: int | None
    duration_ms: float | None
    error: str | None = None


# Endpoint names match the Spec 20 latency table so before/after rows line up.
DEFAULT_TARGETS: tuple[Target, ...] = (
    Target("health", "GET", "/health"),
    Target("providers", "GET", "/api/settings/providers"),
    Target("meetings", "GET", "/api/meetings"),
    Target("meeting", "GET", "/api/meetings/{meeting_id}"),
    Target("context-stats", "GET", "/api/meetings/{meeting_id}/context-stats"),
    Target("closing", "GET", "/api/meetings/{meeting_id}/closing"),
    Target("personas", "GET", "/api/personas"),
    Target("participant-templates", "GET", "/api/participants/templates"),
    Target("replay-session", "GET", "/api/replay/session"),
)


def _resolve(path: str, meeting_id: str | None) -> str:
    if "{meeting_id}" in path and not meeting_id:
        return ""
    return path.replace("{meeting_id}", meeting_id or "")


def discover_meeting_id(client: httpx.Client, base_url: str) -> str | None:
    """Pick the first live meeting so the detail endpoints can be sampled."""
    try:
        response = client.get(f"{base_url}/api/meetings")
    except httpx.HTTPError:
        return None
    if response.status_code != 200:
        return None
    try:
        rows = response.json()
    except ValueError:
        return None
    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
        meeting_id = rows[0].get("id")
        if meeting_id:
            return str(meeting_id)
    return None


def _one(
    client: httpx.Client, base_url: str, target: Target, meeting_id: str | None
) -> Sample:
    path = _resolve(target.path, meeting_id)
    if not path:
        return Sample(
            target=target.name,
            method=target.method,
            path=target.path,
            status=None,
            duration_ms=None,
            error="no meeting id available",
        )
    started = time.perf_counter()
    try:
        response = client.request(
            target.method, f"{base_url}{path}", json=target.body
        )
    except Exception as exc:  # noqa: BLE001 - probe reports, never raises
        return Sample(
            target=target.name,
            method=target.method,
            path=path,
            status=None,
            duration_ms=(time.perf_counter() - started) * 1000,
            error=f"{type(exc).__name__}: {exc}",
        )
    return Sample(
        target=target.name,
        method=target.method,
        path=path,
        status=response.status_code,
        duration_ms=(time.perf_counter() - started) * 1000,
    )


def collect(
    base_url: str,
    *,
    targets: Iterable[Target] = DEFAULT_TARGETS,
    samples: int = 5,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> list[Sample]:
    """Sample each target sequentially; one warm-up is discarded per target."""
    base_url = base_url.rstrip("/")
    closure = list(targets)
    with httpx.Client(timeout=timeout) as client:
        meeting_id = discover_meeting_id(client, base_url)
        observed: list[Sample] = []
        for target in closure:
            _one(client, base_url, target, meeting_id)  # warm-up, not recorded
            for _ in range(max(1, samples)):
                observed.append(_one(client, base_url, target, meeting_id))
    return observed


def responsiveness(
    base_url: str,
    *,
    load_path: str = "/api/meetings/{meeting_id}",
    load: int = 5,
    samples: int = 5,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    settle_seconds: float = 0.1,
) -> tuple[list[Sample], list[Sample]]:
    """Measure health while several load requests are in flight.

    Returns ``(health_samples, load_samples)``. A serialized event loop shows
    health latency close to the load duration; an off-loop boundary keeps it
    near the idle baseline.
    """
    base_url = base_url.rstrip("/")
    with httpx.Client(timeout=timeout) as client:
        meeting_id = discover_meeting_id(client, base_url)
        target = Target("load", "GET", load_path)
        health = Target("health", "GET", "/health")
        with ThreadPoolExecutor(max_workers=max(1, load)) as pool:
            futures = [
                pool.submit(_one, client, base_url, target, meeting_id)
                for _ in range(max(1, load))
            ]
            time.sleep(settle_seconds)
            health_samples = [
                _one(client, base_url, health, meeting_id)
                for _ in range(max(1, samples))
            ]
            load_samples = [future.result() for future in futures]
    return health_samples, load_samples


def _percentile(values: Sequence[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    rank = max(0, math.ceil(percentile / 100.0 * len(ordered)) - 1)
    return ordered[min(rank, len(ordered) - 1)]


def summarize(samples: Sequence[Sample]) -> list[dict]:
    """Group samples by target, preserving first-seen order."""
    names: list[str] = []
    for sample in samples:
        if sample.target not in names:
            names.append(sample.target)
    rows: list[dict] = []
    for name in names:
        group = [sample for sample in samples if sample.target == name]
        durations = [sample.duration_ms for sample in group if sample.duration_ms is not None]
        rows.append(
            {
                "target": name,
                "method": group[0].method,
                "path": group[0].path,
                "requests": len(group),
                "failures": sum(1 for sample in group if sample.error is not None),
                "min_ms": round(min(durations), 1) if durations else None,
                "p50_ms": round(_percentile(durations, 50) or 0.0, 1) if durations else None,
                "p95_ms": round(_percentile(durations, 95) or 0.0, 1) if durations else None,
                "max_ms": round(max(durations), 1) if durations else None,
                "statuses": sorted(
                    {sample.status for sample in group if sample.status is not None}
                ),
            }
        )
    return rows


def _report(
    *,
    base_url: str,
    mode: str,
    rows: list[dict],
    samples: Sequence[Sample],
) -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "mode": mode,
        "rows": rows,
        "samples": [asdict(sample) for sample in samples],
    }


def _print_rows(rows: Sequence[dict]) -> None:
    header = f"{'endpoint':<22} {'n':>3} {'fail':>4} {'min':>9} {'p50':>9} {'p95':>9} {'max':>9}"
    print(header)
    for row in rows:
        def cell(value: object) -> str:
            return "-" if value is None else str(value)

        print(
            f"{row['target']:<22} {row['requests']:>3} {row['failures']:>4} "
            f"{cell(row['min_ms']):>9} {cell(row['p50_ms']):>9} "
            f"{cell(row['p95_ms']):>9} {cell(row['max_ms']):>9}"
        )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--samples", type=int, default=5)
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument(
        "--json",
        type=Path,
        default=None,
        help="write the full report (including per-sample rows) here",
    )
    parser.add_argument(
        "--mode",
        choices=("sequential", "responsiveness"),
        default="sequential",
    )
    parser.add_argument("--load-path", default="/api/meetings/{meeting_id}")
    parser.add_argument("--load", type=int, default=5)
    parser.add_argument(
        "--path",
        action="append",
        default=[],
        help="extra GET path to sample (repeatable)",
    )
    args = parser.parse_args(argv)

    if args.mode == "responsiveness":
        health, load = responsiveness(
            args.base_url,
            load_path=args.load_path,
            load=args.load,
            samples=args.samples,
            timeout=args.timeout,
        )
        samples = [*health, *load]
    else:
        targets = list(DEFAULT_TARGETS)
        targets.extend(
            Target(f"extra-{i + 1}", "GET", path)
            for i, path in enumerate(args.path)
        )
        samples = collect(
            args.base_url,
            targets=targets,
            samples=args.samples,
            timeout=args.timeout,
        )
    rows = summarize(samples)
    _print_rows(rows)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps(
                _report(
                    base_url=args.base_url,
                    mode=args.mode,
                    rows=rows,
                    samples=samples,
                ),
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"wrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
