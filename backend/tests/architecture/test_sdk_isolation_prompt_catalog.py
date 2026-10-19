"""SDK-isolation proof for the persona_catalog activation use case.

Spec-04 requires the first composed module (persona_catalog) to run its
application use case with injected fakes while every client SDK module is
replaced by stubs that FAIL before the target import. Supabase, qdrant,
the provider SDKs AND fastapi are wired as RaisingModule stubs: any
attribute read trips them, so the use case can only pass if it never
reaches an SDK member or the HTTP layer at all.

Red until ``app.modules.persona_catalog.{domain,application}`` exist: the
subprocess import fails with ModuleNotFoundError, the wrapper reports a
nonzero exit, and the pytest wrapper turns that into a failure.
"""

import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = [pytest.mark.architecture]

ARCHITECTURE_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = ARCHITECTURE_DIR.parents[1]

DOMAIN_MODULE = "app.modules.persona_catalog.domain.activations"
CONTRACTS_MODULE = "app.modules.persona_catalog.application.contracts"
TARGET_MODULE = "app.modules.persona_catalog.application.use_cases"

PERSONA_ID = "11111111-1111-4111-8111-111111111111"

SCRIPT_TEMPLATE = '''
import asyncio
import importlib
import sys
import traceback
from types import ModuleType

BACKEND_ROOT = r"__BACKEND_ROOT__"
DOMAIN_MODULE = "__DOMAIN__"
TARGET_MODULE = "__TARGET__"
CONTRACTS_MODULE = "__CONTRACTS__"
PERSONA_ID = "__PERSONA_ID__"

SDK_TRIPWIRES = ("supabase", "qdrant_client", "openai", "cohere",
                 "anthropic", "fastapi")


class RaisingModule(ModuleType):
    """Any attribute read on a wired SDK trips the stub. This proves the
    use case never even reaches for an SDK member - much stronger than
    merely avoiding network calls."""

    def __getattr__(self, member):
        raise AssertionError(
            "SDK module '%s' member '%s' reached - the isolation "
            "contract forbids SDK use in this path"
            % (self.__name__, member)
        )


class FakeCatalog:
    """In-memory PromptCatalogPort double, refusing only sentinel versions."""

    def __init__(self, refused_version):
        self.refused_version = refused_version
        self.calls = []

    async def activate_prompt_version(self, persona_id, version):
        self.calls.append((persona_id, version))
        return version != self.refused_version


async def run_flows():
    domain = importlib.import_module(DOMAIN_MODULE)
    PromptSelectionActivated = domain.PromptSelectionActivated
    PromptSelectionRefused = domain.PromptSelectionRefused

    contracts = importlib.import_module(CONTRACTS_MODULE)
    assert hasattr(contracts, "PromptCatalogPort"), "port protocol missing"

    use_cases = importlib.import_module(TARGET_MODULE)
    ActivatePromptVersion = use_cases.ActivatePromptVersion

    catalog = FakeCatalog(refused_version=999)
    use_case = ActivatePromptVersion(catalog)

    activated = await use_case.execute(PERSONA_ID, 2)
    assert type(activated) is PromptSelectionActivated, type(activated)
    assert activated.persona_id == PERSONA_ID
    assert activated.version == 2
    assert catalog.calls == [(PERSONA_ID, 2)]

    refused_catalog = FakeCatalog(refused_version=999)
    refused_case = ActivatePromptVersion(refused_catalog)
    refused = await refused_case.execute(PERSONA_ID, 999)
    assert type(refused) is PromptSelectionRefused, type(refused)
    assert refused.persona_id == PERSONA_ID
    assert refused.version == 999
    assert refused_catalog.calls == [(PERSONA_ID, 999)]


def main():
    # 1) Wire the tripwires BEFORE anything from app lands.
    for sdk in SDK_TRIPWIRES:
        sys.modules[sdk] = RaisingModule(sdk)

    sys.path.insert(0, BACKEND_ROOT)

    asyncio.run(run_flows())

    # 2) Final sweep: the real SDKs can never have arrived - every wired
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
    script = script.replace("__PERSONA_ID__", PERSONA_ID)
    script = script.replace("__BACKEND_ROOT__", str(BACKEND_ROOT))
    script = script.replace("__DOMAIN__", DOMAIN_MODULE)
    script = script.replace("__TARGET__", TARGET_MODULE)
    script = script.replace("__CONTRACTS__", CONTRACTS_MODULE)
    return script


def test_sdk_isolated_prompt_catalog_runs_without_sdk_reach():
    """ActivatePromptVersion must execute end-to-end over an injected fake
    port while every SDK module (including fastapi) is a RaisingModule stub
    installed before the target import."""
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
