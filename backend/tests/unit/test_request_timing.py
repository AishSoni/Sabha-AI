"""Request timing sees database work done inside the handler (spec-20).

Pure ASGI middleware is used deliberately: ``BaseHTTPMiddleware`` runs the
endpoint in a child task, and the context-variable counters would be invisible
when the response finishes. This test would fail if the middleware were
switched back to the convenience base class.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import FastAPI

from app.platform.blocking import run_blocking
from app.presentation.timing import RequestTimingMiddleware


async def test_timing_middleware_reports_db_operations(caplog):
    app = FastAPI()

    @app.get("/slow")
    async def slow():
        await run_blocking(lambda: None)
        await run_blocking(lambda: None)
        return {"ok": True}

    app.add_middleware(RequestTimingMiddleware)

    caplog.set_level(logging.INFO, logger="sabha.perf")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.get("/slow")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert "db_ops=2" in caplog.text
    assert "path=/slow" in caplog.text
