"""Test helpers for composing the application around fixture adapters.

Spec 14 moved live adapter construction out of request handling and into the
composition root. Route tests therefore install a container built from their
fixture database instead of patching a module-level default factory.
"""

from contextlib import contextmanager

from app.bootstrap import Container
from app.modules.meetings.infrastructure.supabase_meetings import build_meeting_service
from tests.doubles.supabase_stub import stub_for


@contextmanager
def live_container(
    app,
    db,
    *,
    lifecycle=None,
    system_ai_reader=None,
    turn_queue=None,
    closing=None,
):
    """Install a stub-backed live container for the duration of a test.

    Unspecified capabilities stay disabled so a request reaching one fails
    loudly with 503 instead of silently contacting a real service.
    """
    previous = app.state.container
    service = build_meeting_service(stub_for(db))
    app.state.container = Container(
        prompt_catalog=object(),
        meeting_service=service,
        meeting_reads=service,
        turn_queue=turn_queue,
        closing=closing,
        knowledge_lifecycle=lifecycle,
        system_ai_reader=system_ai_reader,
    )
    try:
        yield service
    finally:
        app.state.container = previous
