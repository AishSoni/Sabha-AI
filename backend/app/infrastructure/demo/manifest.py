"""Typed demo scaffold contracts (scaffold only, no journey content).

These types describe the later single-bond feature without supplying an
approved real instrument, authored scripts, or a journey state machine.
All scaffold content is visibly synthetic and cannot be published as bond
evidence. Fields owned by later phases are marked as such.
"""

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class ClaimKind(str, Enum):
    """Authored-claim classification (CONTRACTS section 7)."""

    SOURCED_FACT = "sourced_fact"
    DERIVED_CALCULATION = "derived_calculation"
    SUBJECTIVE_JUDGMENT = "subjective_judgment"
    UNVERIFIED_QUESTION = "unverified_question"


# The real guided scenario is owned by Phase 10 and must never be served
# from this scaffold. Requesting it here is an explicit unavailable error,
# not a placeholder walkthrough.
REAL_SCENARIO_ID = "indian-corporate-bond-review"


class SourceProvenance(BaseModel):
    """Provenance for one fixture source chunk (synthetic only in Phase 03)."""

    source_id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=300)
    publisher: str = Field(min_length=1, max_length=300)
    visibility: Literal["shared", "private"] = "shared"
    content_hash: str = Field(min_length=8, max_length=128)
    snapshot_date: str = Field(min_length=8, max_length=32)
    page_locator: Optional[str] = Field(default=None, max_length=200)

    model_config = {"frozen": True}

    @field_validator("source_id")
    @classmethod
    def _synthetic_source_only(cls, value: str) -> str:
        if not value.startswith("synthetic-"):
            raise ValueError(
                "scaffold sources must use visibly test-only 'synthetic-*' IDs; "
                "real-bond evidence packs are owned by Phase 10"
            )
        return value


class ScenarioManifest(BaseModel):
    """Typed scenario manifest for fixture composition only."""

    schema_version: str = Field(pattern=r"^[0-9]+$")
    scenario_id: str = Field(min_length=1, max_length=120)
    content_version: int = Field(ge=1, le=9999)
    scenario_revision: int = Field(ge=1, le=9999)
    # Phase 03 serves synthetic fixtures only. This flag makes that explicit
    # so fixtures cannot masquerade as an approved real scenario.
    synthetic_only: Literal[True] = True
    instrument_ref: str = Field(min_length=1, max_length=120)
    source_snapshot_date: str = Field(min_length=8, max_length=32)
    allowed_actions: list[str] = Field(default_factory=list, max_length=32)
    # Owned downstream: Phase 10 supplies specialist seeds, scripted
    # invocations, and J-step transitions. Phase 08 supplies runtime bounds.
    # These fields are intentionally absent here.

    model_config = {"frozen": True}

    @field_validator("scenario_id")
    @classmethod
    def _no_real_scenario(cls, value: str) -> str:
        if value == REAL_SCENARIO_ID:
            raise ValueError(
                "the real single-bond scenario is unavailable from the "
                "Phase 03 scaffold; it is owned by Phase 10 content entry"
            )
        if not value.startswith("synthetic-"):
            raise ValueError(
                "scaffold scenario IDs must use visibly test-only "
                "'synthetic-*' values"
            )
        return value

    @field_validator("instrument_ref")
    @classmethod
    def _no_real_instrument(cls, value: str) -> str:
        if not value.startswith("SYNTHETIC-"):
            raise ValueError(
                "scaffold instrument refs must use visibly test-only "
                "'SYNTHETIC-*' values; no real ISIN is approved here"
            )
        return value


class DemoSession(BaseModel):
    """Session/generation reference (persistent lifecycle owned by Phase 08)."""

    session_id: str = Field(min_length=1, max_length=120)
    generation: int = Field(ge=1, le=9999)
    scenario_revision: int = Field(ge=1, le=9999)
    scenario_id: str = Field(min_length=1, max_length=120)
    meeting_id: Optional[str] = Field(default=None, max_length=120)

    model_config = {"frozen": True}

    @field_validator("scenario_id")
    @classmethod
    def _session_no_real_scenario(cls, value: str) -> str:
        if value == REAL_SCENARIO_ID:
            raise ValueError("real scenario sessions are owned by Phase 10")
        return value


class ScenarioAction(BaseModel):
    """One requested scenario action (execution owned by Phase 10)."""

    action_id: str = Field(min_length=1, max_length=120)
    scenario_revision: int = Field(ge=1, le=9999)
    idempotency_key: str = Field(min_length=8, max_length=120)

    model_config = {"frozen": True}
