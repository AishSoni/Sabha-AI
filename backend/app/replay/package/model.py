"""Data-only replay package model (spec-17).

A replay package is inert data: checkpoints, tapes, retrieval records, and
asset metadata. Nothing here can be executed, imported, or used to reach a
provider, a live database, or a browser capability. The same models are used
offline by the publication tool and in tests; the runtime only ever reads the
already-validated rows.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.replay.constants import TAPE_DELAY_CEILING_MS

SCHEMA_VERSION = 3
READ_VERSION = 1
EVENT_VERSION = 1

SUPPORTED_SCHEMA_VERSIONS = (1, 2, SCHEMA_VERSION)
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

EXPLORATION_MODES = ("inspection", "playback")

# Exploration metadata is bounded policy: a package may not enlarge these
# limits, and the browser enforces the same ceilings while navigating.
MAX_EXPLORATION_CHECKPOINTS = 64
MAX_EXPLORATION_TRANSITIONS = 128
MAX_EXPLORATION_OUTGOING = 4
MAX_EXPLORATION_CHAPTERS = 32
MAX_PARTICIPANT_TAPES = 32
MAX_CLOSING_TAPES = 16

CLAIM_KINDS = (
    "fact",
    "derived",
    "judgment",
    "unknown",
    "demo_authored",
)

# The shared in-app evidence viewer owns renderers for exactly these media
# types. Publication rejects an asset no renderer can display.
PREVIEWABLE_MEDIA_TYPES = frozenset(
    {
        "text/markdown",
        "text/plain",
        "text/csv",
        "application/json",
        "application/pdf",
    }
)

CLOSING_EVENT_KINDS = ("ballot", "summary")
CLOSING_RESULTS = ("yes", "no", "no-vote", "completed")

# --- Expanded demo workspace seed (spec-23) ---------------------------------
# The seed is inert authoring data for the browser-memory practice workspace.
# These ceilings are validation policy: a seed may not enlarge them, and the
# frontend enforces the same values on local mutations.
WORKSPACE_SEED_VERSION = 3
SUPPORTED_WORKSPACE_SEED_VERSIONS = (1, 2, WORKSPACE_SEED_VERSION)
MAX_WORKSPACE_SEED_BYTES = 1024 * 1024
MAX_WORKSPACE_PERSONAS = 16
MAX_WORKSPACE_STACKS = 16
MAX_WORKSPACE_REVISIONS_PER_PERSONA = 16
MAX_WORKSPACE_PROMPT_CHARS = 16_384
MAX_WORKSPACE_BASE_INSTRUCTIONS_CHARS = 16_384
MAX_WORKSPACE_TOTAL_PROMPT_CHARS = 524_288
MAX_WORKSPACE_PRACTICE_SETUPS = 8
MAX_WORKSPACE_SAMPLES = 16
MAX_WORKSPACE_SAMPLE_BYTES = 2 * 1024 * 1024
MAX_WORKSPACE_TOTAL_SAMPLE_BYTES = 8 * 1024 * 1024
MAX_WORKSPACE_DOCUMENTS = 64
MAX_WORKSPACE_CHUNKS_PER_DOCUMENT = 256

SAMPLE_ROLES = (
    "shared-research",
    "participant-notes",
    "mandate-material",
    "failure-retry",
)
SAMPLE_DESTINATIONS = ("meeting", "stack")
SAMPLE_SCENARIOS = ("ready-after-indexing", "fail-once")
SAMPLE_PREVIEW_MODES = ("inline", "unsupported")
SAMPLE_PROVENANCE = ("demo-authored", "approved-source")

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


PREPARED_REPLY_TURN_COUNT = 4
PREPARED_FOLLOW_UP_TURN_COUNT = 1
PREPARED_TURN_KINDS = ("reply", "follow_up")


class PreparedReplyTurn(StrictModel):
    """One approved AI reply in the schema-3 turn deck.

    The record is deliberately self-contained: selecting the turn names the
    recorded operation and tape to stream, the isolated checkpoint that holds
    its settled effects, and the stable identities that composition may merge.
    """

    kind: Literal["reply"] = "reply"
    turn_id: str
    participant_id: str
    label: str
    intent_id: str
    operation_id: str
    tape_id: str
    result_checkpoint: str
    reply_message_ids: list[str] = Field(min_length=1)
    effect_ids: list[str] = Field(default_factory=list)
    required: bool = True

    @field_validator(
        "turn_id",
        "participant_id",
        "intent_id",
        "operation_id",
        "tape_id",
        "result_checkpoint",
    )
    @classmethod
    def validate_turn_ref(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("prepared turn references must be safe identifiers")
        return value

    @field_validator("label")
    @classmethod
    def validate_turn_label(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("prepared turn label must not be empty")
        return value

    @field_validator("reply_message_ids", "effect_ids")
    @classmethod
    def validate_turn_ids(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("prepared turn identities must be unique")
        for item in value:
            if not _is_safe_slug(item):
                raise ValueError(f"unsafe prepared turn identity: {item!r}")
        return value


class PreparedFollowUpTurn(StrictModel):
    """The single approved user follow-up in the schema-3 turn deck."""

    kind: Literal["follow_up"] = "follow_up"
    turn_id: str
    label: str
    question: str
    message_id: str
    intent_id: str | None = None
    participant_id: str | None = None
    required: bool = True

    @field_validator("turn_id", "message_id", "intent_id", "participant_id")
    @classmethod
    def validate_follow_up_ref(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_slug(value):
            raise ValueError("prepared follow-up references must be safe identifiers")
        return value

    @field_validator("label", "question")
    @classmethod
    def validate_follow_up_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("prepared follow-up text must not be empty")
        return value


PreparedTurn = Annotated[
    PreparedReplyTurn | PreparedFollowUpTurn,
    Field(discriminator="kind"),
]


class PreparedClosingRecord(StrictModel):
    """Recorded closing path and the deck turns that unlock it."""

    closing_tape_id: str
    completed_checkpoint: str
    archived_checkpoint: str
    required_turn_ids: list[str]

    @field_validator(
        "closing_tape_id", "completed_checkpoint", "archived_checkpoint"
    )
    @classmethod
    def validate_closing_ref(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("prepared closing references must be safe identifiers")
        return value

    @field_validator("required_turn_ids")
    @classmethod
    def validate_required_turns(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("prepared closing must require at least one turn")
        if len(set(value)) != len(value):
            raise ValueError("prepared closing turn ids must be unique")
        for item in value:
            if not _is_safe_slug(item):
                raise ValueError(f"unsafe prepared closing turn id: {item!r}")
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


class ChapterRecord(StrictModel):
    """One approved, read-only inspection or playback chapter.

    A chapter names an existing checkpoint and feature surface. It cannot invent
    a route, execute a callback, or grant access to a resource outside the
    pinned package.
    """

    chapter_id: str
    title: str
    objective: str
    checkpoint: str
    route: Literal[BEAT_ROUTES]
    tab: Literal[BEAT_TABS]
    mode: Literal[EXPLORATION_MODES]
    disclosure: str
    summary_message_id: str | None = None
    claim_ids: list[str] = Field(default_factory=list)
    input_asset_ids: list[str] = Field(default_factory=list)

    @field_validator("chapter_id", "checkpoint", "summary_message_id")
    @classmethod
    def validate_chapter_ref(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_slug(value):
            raise ValueError("chapter references must be safe identifiers")
        return value

    @field_validator("title", "objective", "disclosure")
    @classmethod
    def validate_chapter_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("chapter text must not be empty")
        return value

    @field_validator("claim_ids", "input_asset_ids")
    @classmethod
    def validate_chapter_ids(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("chapter references must be unique")
        for item in value:
            if not _is_safe_slug(item):
                raise ValueError(f"unsafe chapter reference: {item!r}")
        return value

    @model_validator(mode="after")
    def validate_summary_chapter(self) -> "ChapterRecord":
        if self.tab == "summary" and self.summary_message_id is None:
            raise ValueError("a summary chapter requires summary_message_id")
        if self.tab != "summary" and self.summary_message_id is not None:
            raise ValueError("only a summary chapter may name a summary message")
        return self


class TransitionRecord(StrictModel):
    """One validated legal action in the exploration graph.

    Unlike an intent, a transition states its source coordinate explicitly.
    That is what makes repeated participants unambiguous and keeps chapter
    inspection from being mistaken for a completed action.
    """

    transition_id: str
    source_checkpoint: str
    completed_checkpoint: str
    intent_id: str
    kind: Literal[INTENT_KINDS]
    participant_id: str | None = None
    operation_id: str | None = None
    tape_id: str | None = None
    closing_tape_id: str | None = None
    canonical: bool = False
    prerequisites: list[str] = Field(default_factory=list)
    label: str
    explanation: str = ""

    @field_validator(
        "transition_id",
        "source_checkpoint",
        "completed_checkpoint",
        "intent_id",
        "participant_id",
        "operation_id",
        "tape_id",
        "closing_tape_id",
    )
    @classmethod
    def validate_transition_ref(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_slug(value):
            raise ValueError("transition references must be safe identifiers")
        return value

    @field_validator("label")
    @classmethod
    def validate_transition_label(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("transition label must not be empty")
        return value

    @field_validator("prerequisites")
    @classmethod
    def validate_prerequisites(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("transition prerequisites must be unique")
        for item in value:
            if not _is_safe_slug(item):
                raise ValueError(f"unsafe transition prerequisite: {item!r}")
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
        elif self.kind in ("derived", "judgment", "demo_authored"):
            if not self.evidence_asset_id or not self.locator:
                raise ValueError(
                    f"{self.kind} claims require evidence_asset_id and locator"
                )
            if self.kind in ("judgment", "demo_authored") and self.source_url:
                raise ValueError(
                    f"{self.kind} claims must not carry a source_url"
                )
        else:
            if self.source_url:
                raise ValueError("unknown claims must not carry a source_url")
            if bool(self.evidence_asset_id) != bool(self.locator):
                raise ValueError(
                    "unknown claims require both evidence_asset_id and locator, or neither"
                )
        return self


class WorkspaceRevision(StrictModel):
    """One authored, immutable practice prompt revision.

    Revisions are display/catalog content only. They carry no provider setting,
    credential, or executable behaviour.
    """

    revision_id: str
    prompt: str = Field(min_length=1, max_length=MAX_WORKSPACE_PROMPT_CHARS)
    reason: str
    created_at: str

    @field_validator("revision_id")
    @classmethod
    def validate_revision_id(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("revision_id must be a safe identifier")
        return value

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("revision reason must not be empty")
        return value

    @field_validator("created_at")
    @classmethod
    def validate_created_at(cls, value: str) -> str:
        from datetime import date

        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("created_at must be an ISO date") from exc
        return value


class WorkspacePersona(StrictModel):
    """One seeded persona template with its authored revision history."""

    persona_id: str
    name: str
    role: str
    description: str
    color: str = ""
    stack_ids: list[str] = Field(default_factory=list)
    revisions: list[WorkspaceRevision] = Field(min_length=1)
    active_revision_id: str
    # Links the practice template to the prepared participant whose prompt it
    # mirrors. This is display-only; it never renames or mutates the recording.
    recorded_participant_id: str | None = None

    @field_validator("persona_id", "active_revision_id")
    @classmethod
    def validate_persona_id(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("persona identifiers must be safe")
        return value

    @field_validator("recorded_participant_id")
    @classmethod
    def validate_recorded_participant_id(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_slug(value):
            raise ValueError("recorded_participant_id must be a safe identifier")
        return value

    @field_validator("name", "role", "description")
    @classmethod
    def validate_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("persona text must not be empty")
        return value

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str) -> str:
        if value and (
            len(value) != 7
            or not value.startswith("#")
            or any(character not in "0123456789abcdefABCDEF" for character in value[1:])
        ):
            raise ValueError("color must be an empty value or a hex colour")
        return value

    @field_validator("stack_ids")
    @classmethod
    def validate_stack_ids(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("stack assignments must be unique")
        for item in value:
            if not _is_safe_slug(item):
                raise ValueError(f"unsafe stack reference: {item!r}")
        return value

    @field_validator("revisions")
    @classmethod
    def validate_revisions(
        cls, value: list[WorkspaceRevision]
    ) -> list[WorkspaceRevision]:
        revision_ids = [revision.revision_id for revision in value]
        if len(set(revision_ids)) != len(revision_ids):
            raise ValueError("revision_ids must be unique within a persona")
        return value

    @model_validator(mode="after")
    def validate_active_revision(self) -> "WorkspacePersona":
        if self.active_revision_id not in {
            revision.revision_id for revision in self.revisions
        }:
            raise ValueError("active_revision_id must name one of the revisions")
        return self


class WorkspaceStack(StrictModel):
    stack_id: str
    label: str
    scope: Literal["shared", "private"]
    description: str = ""

    @field_validator("stack_id")
    @classmethod
    def validate_stack_id(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("stack_id must be a safe identifier")
        return value

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("stack label must not be empty")
        return value


class WorkspacePracticeSetup(StrictModel):
    """A seeded preset that links practice edits to a recorded example."""

    setup_id: str
    label: str
    description: str = ""
    recorded_example_id: str

    @field_validator("setup_id", "recorded_example_id")
    @classmethod
    def validate_setup_id(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("practice setup identifiers must be safe")
        return value

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("practice setup label must not be empty")
        return value


class WorkspaceDisclosure(StrictModel):
    practice: str
    recording: str

    @field_validator("practice", "recording")
    @classmethod
    def validate_disclosure(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("workspace disclosures must not be empty")
        return value


class WorkspaceSample(StrictModel):
    """One explicitly uploadable, approved practice document.

    The upload allowlist is this record set, not the package asset list. An
    asset may be previewable evidence and still be ineligible for upload unless
    an approved sample names it. Display metadata is duplicated from the asset
    on purpose: publication cross-checks every declared value against the
    retained package bytes so a stale or forged sample fails closed.
    """

    sample_id: str
    asset_id: str
    file_name: str
    media_type: str
    size_bytes: int = Field(ge=0, le=MAX_WORKSPACE_SAMPLE_BYTES)
    sha256: str
    role: Literal[
        "shared-research", "participant-notes", "mandate-material", "failure-retry"
    ]
    destination_kinds: list[Literal["meeting", "stack"]] = Field(min_length=1)
    description: str
    accessible_label: str
    provenance: Literal["demo-authored", "approved-source"]
    rights_status: Literal["approved-for-upload"]
    approved_at: str
    preview_mode: Literal["inline", "unsupported"]
    preview_note: str | None = None
    scenario_id: Literal["ready-after-indexing", "fail-once"]
    prepared_chunk_count: int = Field(ge=1, le=MAX_WORKSPACE_CHUNKS_PER_DOCUMENT)
    failure_message: str | None = None

    @field_validator("sample_id", "asset_id")
    @classmethod
    def validate_sample_ids(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("sample identifiers must be safe")
        return value

    @field_validator("file_name")
    @classmethod
    def validate_file_name(cls, value: str) -> str:
        if (
            not value
            or value in {".", ".."}
            or "/" in value
            or "\\" in value
            or ":" in value
        ):
            raise ValueError("sample file_name must be a plain file name")
        return value

    @field_validator("media_type", "description", "accessible_label", "preview_note")
    @classmethod
    def validate_sample_text(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("sample text fields must not be empty")
        return value

    @field_validator("sha256")
    @classmethod
    def validate_sample_sha(cls, value: str) -> str:
        if not _is_sha256(value):
            raise ValueError("sample sha256 must be 64 lowercase hex characters")
        return value.lower()

    @field_validator("approved_at")
    @classmethod
    def validate_approved_at(cls, value: str) -> str:
        from datetime import date

        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("approved_at must be an ISO date") from exc
        return value

    @field_validator("destination_kinds")
    @classmethod
    def validate_destinations(
        cls, value: list[Literal[SAMPLE_DESTINATIONS]]
    ) -> list[Literal[SAMPLE_DESTINATIONS]]:
        if len(set(value)) != len(value):
            raise ValueError("destination kinds must be unique")
        return value

    @model_validator(mode="after")
    def validate_scenario(self) -> "WorkspaceSample":
        if self.scenario_id == "fail-once":
            if self.failure_message is None or not self.failure_message.strip():
                raise ValueError("a fail-once sample requires a failure_message")
        elif self.failure_message is not None:
            raise ValueError("only a fail-once sample may declare a failure_message")
        if self.preview_mode == "unsupported":
            if self.preview_note is None or not self.preview_note.strip():
                raise ValueError("an unsupported preview requires an explanation")
        elif self.preview_note is not None:
            raise ValueError("an inline preview must not declare an unsupported note")
        return self


class WorkspaceDocument(StrictModel):
    """A seeded practice document/operation in the local workspace."""

    document_id: str
    sample_id: str
    scope_kind: Literal[SAMPLE_DESTINATIONS]
    scope_id: str
    status: Literal["pending", "processing", "ready", "failed"]
    operation_id: str
    revision_id: str
    chunk_count: int = Field(ge=0, le=MAX_WORKSPACE_CHUNKS_PER_DOCUMENT)
    created_at: str

    @field_validator("document_id", "scope_id", "operation_id", "revision_id")
    @classmethod
    def validate_document_ids(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("document identifiers must be safe")
        return value

    @field_validator("sample_id")
    @classmethod
    def validate_document_sample(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("sample_id must be a safe identifier")
        return value

    @field_validator("created_at")
    @classmethod
    def validate_created_at(cls, value: str) -> str:
        from datetime import date

        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("created_at must be an ISO date") from exc
        return value


class WorkspaceSeed(StrictModel):
    """Strict data-only seed for the browser-memory practice workspace."""

    seed_version: int
    # Seed version 2 carries the approved base instructions so the browser can
    # preview the exact composed system prompt without a live prompt endpoint.
    base_instructions: str | None = Field(
        default=None, max_length=MAX_WORKSPACE_BASE_INSTRUCTIONS_CHARS
    )
    highlighted_persona_id: str | None = None
    disclosure: WorkspaceDisclosure
    personas: list[WorkspacePersona] = Field(default_factory=list)
    stacks: list[WorkspaceStack] = Field(default_factory=list)
    practice_setups: list[WorkspacePracticeSetup] = Field(default_factory=list)
    samples: list[WorkspaceSample] = Field(default_factory=list)
    documents: list[WorkspaceDocument] = Field(default_factory=list)

    @field_validator("highlighted_persona_id")
    @classmethod
    def validate_highlighted_persona_id(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_slug(value):
            raise ValueError("highlighted_persona_id must be a safe identifier")
        return value

    @model_validator(mode="after")
    def validate_versioned_prompt_metadata(self) -> "WorkspaceSeed":
        if self.seed_version >= 2:
            if self.base_instructions is None or not self.base_instructions.strip():
                raise ValueError("seed version 2 requires base_instructions")
            if self.highlighted_persona_id is None:
                raise ValueError("seed version 2 requires highlighted_persona_id")
            if self.highlighted_persona_id not in {
                persona.persona_id for persona in self.personas
            }:
                raise ValueError(
                    "highlighted_persona_id must name one of the seeded personas"
                )
        else:
            if (
                self.base_instructions is not None
                or self.highlighted_persona_id is not None
                or any(
                    persona.recorded_participant_id is not None
                    for persona in self.personas
                )
            ):
                raise ValueError(
                    "prompt assembly and participant mappings require seed version 2"
                )
        if self.seed_version >= 3:
            if not self.samples:
                raise ValueError("seed version 3 requires an upload sample library")
        elif self.samples or self.documents:
            raise ValueError("upload samples and documents require seed version 3")
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
    disclosure: str = ""
    stack_labels: dict[str, str] = Field(default_factory=dict)
    intents: list[IntentRecord] = Field(default_factory=list)
    beats: list[BeatRecord] = Field(default_factory=list)
    claims: list[ClaimRecord] = Field(default_factory=list)
    chapters: list[ChapterRecord] = Field(default_factory=list)
    transitions: list[TransitionRecord] = Field(default_factory=list)
    prepared_base_checkpoint: str | None = None
    prepared_turns: list[PreparedTurn] = Field(default_factory=list)
    prepared_closing: PreparedClosingRecord | None = None
    workspace_seed: str | None = None
    workspace_seed_sha256: str | None = None
    # Publication copies the validated seed into the immutable manifest row so
    # the runtime reader needs no extra table or live catalog. It is excluded
    # from reserialization and never reaches a session DTO.
    workspace_seed_payload: dict[str, Any] | None = Field(default=None, exclude=True)

    @field_validator("package_id", "version")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        if not _is_safe_slug(value):
            raise ValueError("must be a safe identifier")
        return value

    @field_validator("workspace_seed")
    @classmethod
    def validate_workspace_seed(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if (
            not _is_safe_slug(value)
            or value.startswith("/")
            or "\\" in value
            or ".." in value.split("/")
        ):
            raise ValueError("workspace_seed must be a safe relative package path")
        return value

    @field_validator("workspace_seed_sha256")
    @classmethod
    def validate_workspace_seed_hash(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not _is_sha256(value):
            raise ValueError("workspace_seed_sha256 must be 64 lowercase hex characters")
        return value.lower()

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

    @field_validator("chapters")
    @classmethod
    def validate_chapter_ids(cls, value: list[ChapterRecord]) -> list[ChapterRecord]:
        chapter_ids = [chapter.chapter_id for chapter in value]
        if len(set(chapter_ids)) != len(chapter_ids):
            raise ValueError("chapter_ids must be unique")
        return value

    @field_validator("transitions")
    @classmethod
    def validate_transition_ids(
        cls, value: list[TransitionRecord]
    ) -> list[TransitionRecord]:
        transition_ids = [transition.transition_id for transition in value]
        if len(set(transition_ids)) != len(transition_ids):
            raise ValueError("transition_ids must be unique")
        return value

    @field_validator("prepared_base_checkpoint")
    @classmethod
    def validate_prepared_base(cls, value: str | None) -> str | None:
        if value is not None and not _is_safe_slug(value):
            raise ValueError("prepared_base_checkpoint must be a safe identifier")
        return value

    @field_validator("prepared_turns")
    @classmethod
    def validate_prepared_turn_ids(
        cls, value: list[PreparedTurn]
    ) -> list[PreparedTurn]:
        turn_ids = [turn.turn_id for turn in value]
        if len(set(turn_ids)) != len(turn_ids):
            raise ValueError("prepared turn ids must be unique")
        return value

    @field_validator("stack_labels")
    @classmethod
    def validate_stack_labels(cls, value: dict[str, str]) -> dict[str, str]:
        for stack_id, label in value.items():
            if not _is_safe_slug(stack_id):
                raise ValueError(f"unsafe stack id: {stack_id!r}")
            if not label.strip():
                raise ValueError("stack labels must not be empty")
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
    delay_ms: int = Field(default=0, ge=0, le=TAPE_DELAY_CEILING_MS)
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
    delay_ms: int = Field(default=0, ge=0, le=TAPE_DELAY_CEILING_MS)

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
    # Explicit publication allowlist for the practice sample picker. Evidence
    # and preview assets stay false; only reviewed uploadable bytes opt in.
    upload_approved: bool = False
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
