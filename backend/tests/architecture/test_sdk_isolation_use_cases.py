"""SDK-isolation proof for the first extracted use case.

Spec-03 requires instantiating a domain/application use case with fakes while
the client constructors are patched to FAIL - a stronger guarantee than merely
not observing network calls. Here the supabase/qdrant/openai/cohere/anthropic
modules are replaced by RaisingModule stubs BEFORE the target module is
imported: any attribute read (an import of a member, a constructor call, a
classmethod) trips the stub. Correct behavior can therefore only run if the
use case module never reaches an SDK member at all.

The constants guard the capability home; the original import surface
(app.services.orchestrator re-exports) stays guarded by the regression
suites that import through it.
"""

import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = [pytest.mark.architecture]

ARCHITECTURE_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = ARCHITECTURE_DIR.parents[1]

# Extracted homes (orchestrator re-exports keep the callers import surface).
TARGET_MODULE = "app.capabilities.configuration.service"
CONTRACTS_MODULE = "app.capabilities.configuration.contracts"

SCRIPT_TEMPLATE = '''
import importlib
import sys
import traceback
from types import ModuleType

BACKEND_ROOT = r"__BACKEND_ROOT__"
TARGET_MODULE = "__TARGET__"
CONTRACTS_MODULE = "__CONTRACTS__"

SDK_TRIPWIRES = ("supabase", "qdrant_client", "openai", "cohere", "anthropic")


class RaisingModule(ModuleType):
    """Any attribute read on a wired SDK trips the stub. This proves the use
    case never even reaches for an SDK member - much stronger than merely
    avoiding network calls."""

    def __getattr__(self, member):
        raise AssertionError(
            "SDK module '%s' member '%s' reached - the isolation "
            "contract forbids SDK use in this path"
            % (self.__name__, member)
        )


class DuckRequest:
    """Minimal provider_settings duck: only the resolve surface."""

    def __init__(self, provider=None, model=None, temperature=None,
                 max_tokens=None, base_url=None):
        self.provider = provider
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.base_url = base_url


class ConfigStub:
    """A persisted participant provider_config snapshot."""

    provider = ""
    model = ""
    temperature = 0.2
    max_tokens = 1234


class ParticipantWithSnapshot:
    provider_config = ConfigStub()


class BareParticipant:
    """A participant shape with NO provider_config attribute at all."""


def main():
    # 1) Wire the tripwires BEFORE anything from app lands.
    for sdk in SDK_TRIPWIRES:
        sys.modules[sdk] = RaisingModule(sdk)

    sys.path.insert(0, BACKEND_ROOT)

    module = importlib.import_module(TARGET_MODULE)
    resolve_generation_settings = module.resolve_generation_settings
    contracts = importlib.import_module(CONTRACTS_MODULE)
    MissingProviderKeyError = contracts.MissingProviderKeyError

    from app.platform.config import settings

    # Pin the synthetic no-server-key state. conftest intends empty provider
    # keys, but Windows drops empty-string env vars when a child process env
    # block is materialized, so this child would otherwise read the
    # operator's real backend/.env values and the gate would descend to
    # machine configuration.
    settings.gemini_api_key = ""
    settings.openrouter_api_key = ""

    # 2) Cloud gate: a gemini turn with no browser key and no server key must
    #    fail loudly without ever constructing a provider client.
    try:
        resolve_generation_settings(
            BareParticipant(), DuckRequest(provider="gemini"), None
        )
    except MissingProviderKeyError as exc:
        assert "API key" in str(exc), "unexpected error text: %r" % (exc,)
    else:
        raise AssertionError(
            "expected MissingProviderKeyError for a gemini turn with no key"
        )

    # 3) Merge precedence: per-request overrides over the participant
    #    snapshot, server-default provider fallback when both are empty.
    resolved = resolve_generation_settings(
        ParticipantWithSnapshot(),
        DuckRequest(
            provider="",
            model=None,
            temperature=0.9,
            max_tokens=777,
            base_url="http://127.0.0.1:11435",
        ),
        "fixture-byok-key",
    )
    expected = {
        "provider": settings.default_llm_provider,
        "model": "",
        "temperature": 0.9,
        "max_tokens": 777,
        "base_url": "http://127.0.0.1:11435",
        "api_key": "fixture-byok-key",
    }
    assert resolved == expected, "merge mismatch: %r" % (resolved,)

    # 4) Blank call (summary service passes no participant/overrides/key):
    #    falls back to the server defaults end to end.
    blank = resolve_generation_settings(None, None, None)
    blank_expected = {
        "provider": settings.default_llm_provider,
        "model": "",
        "temperature": 0.7,
        "max_tokens": 2048,
        "base_url": None,
        "api_key": None,
    }
    assert blank == blank_expected, "blank-case mismatch: %r" % (blank,)

    # 5) Final sweep: the real SDKs can never have arrived - every wired
    #    slot must still hold our RaisingModule stub.
    for sdk in SDK_TRIPWIRES:
        mod = sys.modules.get(sdk)
        assert type(mod) is RaisingModule, (
            "SDK '%s' was replaced by %r" % (sdk, type(mod))
        )

    print("SDK-ISOLATION-OK")


wrapper_resolved = False
try:
    main()
except AssertionError:
    traceback.print_exc()
    sys.exit(1)
except Exception:
    traceback.print_exc()
    sys.exit(2)
else:
    wrapper_resolved = True

if not wrapper_resolved:
    sys.exit(3)
'''


def _render_script() -> str:
    script = SCRIPT_TEMPLATE
    script = script.replace("__BACKEND_ROOT__", str(BACKEND_ROOT))
    script = script.replace("__TARGET__", TARGET_MODULE)
    script = script.replace("__CONTRACTS__", CONTRACTS_MODULE)
    return script


def test_sdk_isolated_use_case_runs_without_client_construction():
    """resolve_generation_settings must execute end-to-end while every SDK
    module is a RaisingModule stub installed before the target import."""
    process = subprocess.run(
        [sys.executable, "-c", _render_script()],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )
    if process.returncode != 0:
        pytest.fail(
            "SDK-isolation subprocess failed (returncode %d)"
            "\n--- stdout ---\n%s\n--- stderr ---\n%s"
            % (
                process.returncode,
                (process.stdout or "")[-2000:],
                "\n".join((process.stderr or "").splitlines()[-40:]),
            )
        )
    assert "SDK-ISOLATION-OK" in (process.stdout or "")
