"""The turn execution path must not reach template persistence (spec 06).

A participant's knowledge scope is snapshotted onto the participants at
CREATION (meetings assembly). Legacy rows still missing the snapshot
get their template join in the same assembly phase — never inside the
inference loop. The orchestrator file itself must hold no
template-table access and no direct Supabase access, so a live join
cannot reappear in the middle of a turn (spec-06 exit gate: "reasons
why spec requirements were maintained on new projects").
"""

from pathlib import Path

ORCHESTRATOR = (
    Path(__file__).resolve().parents[2] / "app" / "services" / "orchestrator.py"
)

FORBIDDEN_TOKENS = ("persona_knowledge_stacks", "get_supabase")


def test_the_orchestrator_execution_path_never_touches_template_tables():
    source = ORCHESTRATOR.read_text(encoding="utf-8")
    leaks = [token for token in FORBIDDEN_TOKENS if token in source]
    assert leaks == [], (
        "The execution path references template persistence directly: "
        + ", ".join(leaks)
        + " — resolve knowledge scope in the meetings assembly phase instead"
    )
