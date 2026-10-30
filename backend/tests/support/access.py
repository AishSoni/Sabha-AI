"""Helpers for tests that assemble an app directly with ``create_app``."""

from __future__ import annotations

import os

from app.modules.access.application.contracts import VerifiedIdentity
from app.modules.access.presentation.http import require_operator_access

SYNTHETIC_OPERATOR_ID = os.environ.get(
    "OPERATOR_USER_ID", "11111111-1111-4111-8111-111111111111"
)


def authorise(app):
    """Install the same synthetic operator used by the global test fixture."""

    app.dependency_overrides[require_operator_access] = lambda: VerifiedIdentity(
        user_id=SYNTHETIC_OPERATOR_ID
    )
    return app
