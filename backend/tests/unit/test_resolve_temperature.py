"""resolve_temperature explicit-temperature semantics (spec 06).

The spec's own example turned into a unit contract: an explicitly
recorded temperature — zero included — must win over the server
default; only an absent entry inherits.
"""

import pytest

from app.modules.meetings.domain.models import resolve_temperature


def test_an_absent_temperature_inherits_the_server_default():
    assert resolve_temperature({}) == 0.7
    assert resolve_temperature(None) == 0.7


def test_a_recorded_temperature_wins():
    assert resolve_temperature({"temperature": 0.2}) == 0.2


def test_a_recorded_zero_temperature_is_explicit_not_inherited():
    # The frozen-default violation in one line: 0.0 must survive.
    assert resolve_temperature({"temperature": 0}) == 0.0


def test_a_non_numeric_temperature_is_refused():
    with pytest.raises(ValueError, match="could not convert"):
        resolve_temperature({"temperature": "hot"})


def test_a_custom_default_replaces_the_builtin_default():
    assert resolve_temperature({}, default_temperature=0.9) == 0.9
