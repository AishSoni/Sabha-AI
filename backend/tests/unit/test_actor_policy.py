"""Trusted-actor unit policy (CONTRACTS section 1)."""

import pytest

from app.modules.access.actors import (
    Actor,
    is_owner,
    require_owner,
    resolve_actor,
)


def test_bearer_token_resolves_demo_session_actor():
    actor = resolve_actor(authorization="Bearer opaque-token-123")
    assert actor == Actor(kind="demo_session", identity="opaque-token-123")


def test_test_header_resolves_user_actor_and_body_never_counts():
    actor = resolve_actor(test_actor="actor-a")
    assert actor.kind == "user" and actor.identity == "actor-a"
    with pytest.raises(PermissionError):
        resolve_actor()


def test_local_actor_is_never_a_runtime_fallback():
    with pytest.raises(PermissionError):
        resolve_actor(local_actor="dev")
    actor = resolve_actor(allow_local=True, local_actor="dev")
    assert actor.kind == "local"


def test_owner_checks_quarantine_ownerless_and_hide_cross_owner():
    owner = Actor(kind="user", identity="actor-a")
    assert is_owner(owner, "actor-a") is True
    assert is_owner(owner, "actor-b") is False
    assert is_owner(owner, None) is False
    require_owner(owner, "actor-a")
    with pytest.raises(LookupError):
        require_owner(owner, "actor-b")
    with pytest.raises(LookupError):
        require_owner(owner, None)
