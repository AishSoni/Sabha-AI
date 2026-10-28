"""Data-only replay package model (spec-17).

A replay package is inert data: checkpoints, tapes, retrieval records, and
asset metadata. Nothing here can be executed, imported, or used to reach a
provider, a live database, or a browser capability. The same models are used
offline by the publication tool and in tests; the runtime only ever reads the
already-validated rows.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SCHEMA_VERSION = 1
READ_VERSION = 1
EVENT_VERSION = 1

SUPPORTED_SCHEMA_VERSIONS = (SCHEMA_VERSION,)
SUPPORTED_READ_VERSIONS = (READ_VERSION,)
SUPPORTED_EVENT_VERSIONS = (EVENT_VERSION,)

CHECKPOINT_READ_KEYS = (
    "meeting",
    "meetings",
    "disagreements",
    "consensus",
    "context_stats",
    "documents",
    "closing",
    "operations",
    "safe_config",
)

CHECKPOINT_PHASES = (
    "initial",
    "active",
    "completed",
    "closed",
    "archived",
)

TURN_EVENT_TYPES = (
    "status",
    "text",
    "thinking",
    "tool_call",
    "tool_result",
    "citation",
    "done",
    "error",
    "interrupted",
    "cancelled",
)

TERMINAL_EVENT_TYPES = ("done", "error", "interrupted", "cancelled")

NON_TERMINAL_EVENT_TYPES = (
    "status",
    "text",
    "thinking",
    "tool_call",
    "tool_result",
    "citation",
)

INTENT_KINDS = (
    "start_participant",
    "director_follow_up",
    "request_closing",
    "create_meeting",
    "archive_meeting",
)

BEAT_COMPLETIONS = (
    "acknowledge",
    "turn_terminal",
    "closing_completed",
    "checkpoint",
)

BEAT_ROUTES = (
    "board",
    "new",
    "meeting",
    "list",
)

BEAT_TABS = (
    "chat",
    "disagreements",
    "consensus",
    "roster",
    "documents",
    "summary",
    "closing",
)

CLAIM_KINDS = (
    "fact",
    "derived",
    "judgment",
    "unknown",
)

CLOSING_EVENT_KINDS = ("ballot", "summary")
CLOSING_RESULTS = ("yes", "no", "no-vote", "completed")

_HEX64 = set("0123456789abcdef")


def _is_sha256(value: str) -> bool:
    return len(value) == 64 and set(value.lower()) <= _HEX64


def _is_safe_slug(value: str) -> bool:
    return bool(value) and all(
        character.isalnum() or character in "-_." for character in value
    ) and ".." not in value


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class IntentRecord(StrictModel):
    """One supported recorded intent.

    The intent selects a checkpoint and (for turns) a tape. It carries no
    route, SQL, callback, or provider setting; the runtime maps the declared
    kind onto the same feature operations the live UI already uses.
    """

    intent_id: str
    kind: Literal[INTENT_KINDS]
    checkpoint: str
    participant_id: str | None = None
    operation_id: str | None = None
    tape_id: str | None = None
    closing_tape_id: str | None = None
    label: str = ""

    @field_validator("intent_id")
    @classmethod
    def validate_intent_id(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("intent_id must be a safe identifier")
        return value


class BeatStep(StrictModel):
    """One ordered action inside an approved guided beat.

    The step names an intent (or an explicit acknowledgement) and the recorded
    condition that completes it. It carries no executable transition.
    """

    step_id: str
    label: str
    intent_id: str | None = None
    completion: Literal[BEAT_COMPLETIONS]
    requires_tab: Literal[BEAT_TABS] | None = None

    @field_validator("step_id")
    @classmethod
    def validate_step_id(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("step_id must be a safe identifier")
        return value

    @field_validator("intent_id")
    @classmethod
    def validate_step_intent_id(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_slug(value):
            raise ValueError("intent_id must be a safe identifier")
        return value

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("label must not be empty")
        return value


class BeatRecord(StrictModel):
    """Optional journey metadata; spec-18 owns the approved beats.

    A beat may only point at existing checkpoints/intents/assets. Legacy beats
    with only ``checkpoint``/``intent_id`` remain valid; guided beats add the
    ordered step metadata used by the replay guide.
    """

    beat_id: str
    title: str
    anchor: str
    checkpoint: str
    intent_id: str | None = None
    ordinal: int | None = Field(default=None, ge=1)
    objective: str | None = None
    route: Literal[BEAT_ROUTES] | None = None
    tab: Literal[BEAT_TABS] | None = None
    start_checkpoint: str | None = None
    completed_checkpoint: str | None = None
    disclosure: str | None = None
    steps: list[BeatStep] = Field(default_factory=list)
    claim_ids: list[str] = Field(default_factory=list)
    input_asset_ids: list[str] = Field(default_factory=list)

    @field_validator("beat_id", "anchor")
    @classmethod
    def validate_beat_id(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("beat identifiers must be safe")
        return value

    @field_validator("intent_id", "start_checkpoint", "completed_checkpoint")
    @classmethod
    def validate_optional_ref(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_slug(value):
            raise ValueError("reference must be a safe identifier")
        return value

    @field_validator("title", "objective", "disclosure")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("text fields must not be empty")
        return value

    @field_validator("steps")
    @classmethod
    def validate_steps(cls, value: list[BeatStep]) -> list[BeatStep]:
        step_ids = [step.step_id for step in value]
        if len(set(step_ids)) != len(step_ids):
            raise ValueError("step_ids must be unique within a beat")
        return value

    @field_validator("claim_ids", "input_asset_ids")
    @classmethod
    def validate_unique_ids(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("references must be unique")
        for item in value:
            if not _is_safe_slug(item):
                raise ValueError(f"unsafe reference: {item!r}")
        return value


class ClaimRecord(StrictModel):
    """One approved factual, derived, judgment, or unknown statement.

    A claim is content-side provenance: the exact displayed statement, the
    retained evidence that supports it, and an honest locator. It is never
    executable and never resolves live data.
    """

    claim_id: str
    kind: Literal[CLAIM_KINDS]
    text: str
    evidence_asset_id: str | None = None
    locator: str | None = None
    excerpt: str | None = None
    source_url: str | None = None
    source_title: str | None = None
    capture_date: str | None = None

    @field_validator("claim_id", "evidence_asset_id")
    @classmethod
    def validate_claim_id(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_slug(value):
            raise ValueError("claim references must be safe identifiers")
        return value

    @field_validator("text", "locator", "excerpt", "source_title")
    @classmethod
    def validate_claim_text(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("claim text fields must not be empty")
        return value

    @field_validator("source_url")
    @classmethod
    def validate_source_url(cls, value: str | None) -> str | None:
        if value is not None and resolve_passive_url(value) is None:
            raise ValueError("source_url must be a passive http(s) URL")
        return value

    @field_validator("capture_date")
    @classmethod
    def validate_capture_date(cls, value: str | None) -> str | None:
        if value is None:
            return None
        from datetime import date

        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("capture_date must be an ISO date") from exc
        return value

    @model_validator(mode="after")
    def validate_evidence_shape(self) -> "ClaimRecord":
        if self.kind == "fact":
            missing = [
                name
                for name, value in (
                    ("evidence_asset_id", self.evidence_asset_id),
                    ("locator", self.locator),
                    ("excerpt", self.excerpt),
                    ("source_url", self.source_url),
                )
                if not value
            ]
            if missing:
                raise ValueError(
                    "fact claims require " + ", ".join(missing)
                )
        elif self.kind in ("derived", "judgment"):
            if not self.evidence_asset_id or not self.locator:
                raise ValueError(
                    f"{self.kind} claims require evidence_asset_id and locator"
                )
            if self.kind == "judgment" and self.source_url:
                raise ValueError("judgment claims must not carry a source_url")
        else:
            if self.source_url:
                raise ValueError("unknown claims must not carry a source_url")
            if bool(self.evidence_asset_id) != bool(self.locator):
                raise ValueError(
                    "unknown claims require both evidence_asset_id and locator, or neither"
                )
        return self


class Manifest(StrictModel):
    package_id: str
    version: str
    schema_version: int
    read_version: int
    event_version: int
    title: str
    as_of: str
    content_sha256: str
    meeting_id: str
    initial_checkpoint: str
    checkpoints: list[str]
    tapes: list[str] = Field(default_factory=list)
    closing_tapes: list[str] = Field(default_factory=list)
    retrieval: list[str] = Field(default_factory=list)
    provenance: dict[str, Any] = Field(default_factory=dict)
    label: str = "Recorded session"
    intents: list[IntentRecord] = Field(default_factory=list)
    beats: list[BeatRecord] = Field(default_factory=list)
    claims: list[ClaimRecord] = Field(default_factory=list)

    @field_validator("package_id", "version")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("must be a safe identifier")
        return value

    @field_validator("content_sha256")
    @classmethod
    def validate_content_hash(cls, value: str) -> str:
        if not _is_sha256(value):
            raise ValueError("content_sha256 must be 64 lowercase hex characters")
        return value.lower()

    @field_validator("as_of")
    @classmethod
    def validate_as_of(cls, value: str) -> str:
        from datetime import date

        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("as_of must be an ISO date") from exc
        return value

    @field_validator("checkpoints", "tapes", "closing_tapes", "retrieval")
    @classmethod
    def validate_unique_references(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("references must be unique")
        for item in value:
            if not _is_safe_slug(item):
                raise ValueError(f"unsafe reference: {item!r}")
        return value

    @field_validator("claims")
    @classmethod
    def validate_claim_ids(cls, value: list[ClaimRecord]) -> list[ClaimRecord]:
        claim_ids = [claim.claim_id for claim in value]
        if len(set(claim_ids)) != len(claim_ids):
            raise ValueError("claim_ids must be unique")
        return value


class Checkpoint(StrictModel):
    checkpoint_id: str
    ordinal: int = Field(ge=0)
    phase: Literal[CHECKPOINT_PHASES]
    meeting_id: str
    reads: dict[str, Any] = Field(default_factory=dict)

    @field_validator("checkpoint_id")
    @classmethod
    def validate_checkpoint_id(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("checkpoint_id must be a safe identifier")
        return value

    @field_validator("reads")
    @classmethod
    def validate_read_keys(cls, value: dict[str, Any]) -> dict[str, Any]:
        unknown = sorted(set(value) - set(CHECKPOINT_READ_KEYS))
        if unknown:
            raise ValueError(f"unsupported checkpoint reads: {', '.join(unknown)}")
        return value


class TurnTapeEvent(StrictModel):
    event_id: str
    sequence: int = Field(ge=1)
    type: Literal[TURN_EVENT_TYPES]
    delay_ms: int = Field(default=0, ge=0, le=10_000)
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("event_id")
    @classmethod
    def validate_event_id(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("event_id must be a safe identifier")
        return value


class TurnTape(StrictModel):
    tape_id: str
    meeting_id: str
    operation_id: str
    participant_id: str
    request_key: str
    initial_checkpoint: str
    completed_checkpoint: str
    events: list[TurnTapeEvent]

    @field_validator("tape_id")
    @classmethod
    def validate_tape_id(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("tape_id must be a safe identifier")
        return value


class ClosingTapeEvent(StrictModel):
    event_id: str
    sequence: int = Field(ge=1)
    item_id: str
    kind: Literal[CLOSING_EVENT_KINDS]
    text: str
    provisional: bool
    terminal: bool
    result: Literal[CLOSING_RESULTS] | None = None
    subject_id: str | None = None
    delay_ms: int = Field(default=0, ge=0, le=10_000)

    @field_validator("event_id")
    @classmethod
    def validate_event_id(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("event_id must be a safe identifier")
        return value


class ClosingTape(StrictModel):
    tape_id: str
    meeting_id: str
    closing_id: str
    initial_checkpoint: str
    completed_checkpoint: str
    events: list[ClosingTapeEvent]

    @field_validator("tape_id")
    @classmethod
    def validate_tape_id(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("tape_id must be a safe identifier")
        return value


class RetrievalHit(StrictModel):
    rank: int = Field(ge=1)
    document_id: str
    revision_id: str
    chunk_id: str
    content_sha256: str
    passage: str
    score: float
    file_name: str
    page_number: int | None = None
    locator: dict[str, Any] = Field(default_factory=dict)
    citation: dict[str, Any] = Field(default_factory=dict)

    @field_validator("content_sha256")
    @classmethod
    def validate_content_hash(cls, value: str) -> str:
        if not _is_sha256(value):
            raise ValueError("content_sha256 must be 64 lowercase hex characters")
        return value.lower()


class RetrievalRecord(StrictModel):
    retrieval_key: str
    meeting_id: str
    participant_id: str
    scope: Literal["shared", "private"]
    stack_id: str | None = None
    query: str = ""
    hits: list[RetrievalHit]

    @field_validator("retrieval_key")
    @classmethod
    def validate_key(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("retrieval_key must be a safe identifier")
        return value


class AssetRecord(StrictModel):
    asset_id: str
    path: str
    media_type: str
    sha256: str
    size: int = Field(ge=0)
    locator: str
    source: str
    capture_date: str
    rights: str
    authored: bool
    public_demo: bool = True
    extraction: str | None = None

    @field_validator("asset_id")
    @classmethod
    def validate_asset_id(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("asset_id must be a safe identifier")
        return value

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        if (
            not value
            or value.startswith(("/", "\\"))
            or ".." in value.split("/")
            or ".." in value.split("\\")
            or "\\" in value
            or ":" in value
        ):
            raise ValueError("asset path must be a relative POSIX path")
        return value

    @field_validator("sha256")
    @classmethod
    def validate_sha(cls, value: str) -> str:
        if not _is_sha256(value):
            raise ValueError("sha256 must be 64 lowercase hex characters")
        return value.lower()

    @field_validator("locator")
    @classmethod
    def validate_locator(cls, value: str) -> str:
        if resolve_passive_url(value) is None and not value.startswith("package:"):
            raise ValueError("asset locator must be passive http(s) or package-local")
        return value


class AssetIndex(StrictModel):
    assets: list[AssetRecord]


def resolve_passive_url(value: str | None) -> str | None:
    """Return a safe passive URL or ``None``.

    Citation and asset URLs are rendered by the browser; they must never be
    executable schemes (``javascript:``, ``data:``, ``file:``) or carry
    credentials.
    """

    if not value:
        return None
    candidate = value.strip()
    lowered = candidate.lower()
    if not (lowered.startswith("https://") or lowered.startswith("http://")):
        return None
    if "@" in candidate.split("://", 1)[1].split("/", 1)[0]:
        return None
    return candidate
