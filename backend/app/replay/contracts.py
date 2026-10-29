"""Composition contract for the read-only replay runtime (spec-14).

Replay owns a separate request graph. A ``ReplayContainer`` never references
the live container, and its ports are satisfied only by a recorded source.
The production surface is honest about that: until a validated recorded source
is configured (Spec 17), replay requests return 503 rather than falling back
to live data.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.modules.meetings.application.ports import MeetingReads, TurnObservation


class ReplayNotFound(Exception):
    """The recorded package has no such recorded view."""


@dataclass(frozen=True)
class ReplayCapabilities:
    meeting_read: bool = True
    turn_observation: bool = True
    disagreements: bool = True
    consensus: bool = True
    context_stats: bool = False
    create_meeting: bool = False
    send_message: bool = False
    submit_turn: bool = False
    cancel_turn: bool = False
    summary: bool = False
    documents: bool = False
    closing: bool = False

    def as_dict(self) -> dict[str, bool]:
        return {
            "meetingRead": self.meeting_read,
            "turnObservation": self.turn_observation,
            "disagreements": self.disagreements,
            "consensus": self.consensus,
            "contextStats": self.context_stats,
            "createMeeting": self.create_meeting,
            "sendMessage": self.send_message,
            "submitTurn": self.submit_turn,
            "cancelTurn": self.cancel_turn,
            "summary": self.summary,
            "documents": self.documents,
            "closing": self.closing,
        }


@dataclass(frozen=True)
class ReplayPreview:
    """Which package assets the shared evidence viewer can render."""

    available: bool = False
    asset_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class ReplaySession:
    run_id: str
    package_version: str
    meeting_id: str
    label: str = "Recorded session"
    title: str = ""
    as_of: str = ""
    disclosure: str = ""
    stack_labels: dict[str, str] = field(default_factory=dict)
    provenance: dict[str, Any] = field(default_factory=dict)
    capabilities: ReplayCapabilities = field(default_factory=ReplayCapabilities)
    package_id: str = ""
    content_sha256: str = ""
    checkpoint_id: str = ""
    initial_checkpoint: str = ""
    checkpoints: tuple[str, ...] = ()
    intents: tuple[dict[str, Any], ...] = ()
    beats: tuple[dict[str, Any], ...] = ()
    tapes: tuple[dict[str, Any], ...] = ()
    assets: tuple[dict[str, Any], ...] = ()
    claims: tuple[dict[str, Any], ...] = ()
    preview: ReplayPreview = field(default_factory=ReplayPreview)
    retired: bool = False


@dataclass(frozen=True)
class ReplayContainer:
    """The replay request graph, deliberately independent of ``Container``."""

    session: ReplaySession
    reads: MeetingReads
    observation: TurnObservation
    # Spec-17 recorded sources; absent on the spec-14 sentinel containers.
    stream: Any | None = None
    closing_events: Any | None = None
    checkpoint_id: str = ""
    limiter: Any | None = None
