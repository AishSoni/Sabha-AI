"""Expected meetings-domain failures (spec 08).

Routes translate these into HTTP outcomes; the application layer raises
them without importing transport frameworks. ``code`` values are stable
enough to surface in closing error payloads.
"""

from __future__ import annotations


class MeetingsError(Exception):
    """Base class for expected, caller-visible meetings failures."""

    code = "meetings_error"


class MeetingNotFoundError(MeetingsError):
    code = "meeting_not_found"


class MeetingClosedError(MeetingsError):
    """The meeting is ended or archived and cannot admit further work."""

    code = "meeting_closed"


class ClosingConflictError(MeetingsError):
    """Another closing operation or lifecycle state conflicts with the command."""

    code = "closing_conflict"


class ClosingNotRecoverableError(MeetingsError):
    """Only a failed closing operation may be retried or aborted."""

    code = "closing_not_recoverable"


class ClosingNotFoundError(MeetingsError):
    code = "closing_not_found"
