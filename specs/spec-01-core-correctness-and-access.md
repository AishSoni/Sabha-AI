# Spec 01 (Phase 1): Core Correctness and Access

## Purpose and prerequisites

Repair deterministic contract/configuration failures before tackling lifecycle recovery. This spec owns **17 findings**: fourteen backend, two frontend, and one integration finding. The next spec owns the remainder. Follow the [roadmap](roadmap-phase-1-existing-issues.md), mandatory TDD, and shared-workspace/local-compatibility constraints.

Before starting:
- Configure actual backend async and frontend component test runners; inventory source tests rather than cached bytecode. Record a reproducible characterization baseline, not an assumed green suite.
- Implement the [shared fixture contracts](reference-review-evidence-and-fixtures.md#shared-test-fixture-definitions), especially `auth_modes`, `network_spy`, `provider_script`, `persona_config`, `persona_history`, `persona_instances`, and `knowledge_boundaries`.
- Provision disposable database and Qdrant instances, synthetic credentials, deterministic provider/embedding transports, and fresh/upgrade schema fixtures. No paid inference is required.
- Inspect the current backend database credential role before tightening permissions. Decide supported Qdrant client/server versions and how to run their real adapter contract tests.
- Read the [full evidence and acceptance cases](reference-review-evidence-and-fixtures.md). Source paths below describe the reviewed checkout; recheck callers before editing.

## Backend work packages and tests to write first

Implement one row at a time. Each link contains the exact source evidence, full fix approach, fixtures, and regression requirements; the test column is a starting red test, not a replacement for that acceptance set.

| Finding and evidence | Smallest red test / intended fix |
| --- | --- |
| [Access gate and database policies](reference-review-evidence-and-fixtures.md#missing-access-gate-and-unrestricted-database-policies) — `backend/main.py`, `backend/app/core/database.py` | Reject missing/invalid/expired/wrong-project tokens before mutation/inference across all routers, uploads, settings and streams. Two approved identities still see the same workspace. Add a centralized verified entry gate; preserve explicit loopback-only local mode; test direct table permissions with real roles. |
| [Ollama SSRF](reference-review-evidence-and-fixtures.md#unrestricted-ollama-base-urls-allow-ssrf) — `backend/app/api/settings.py` | Spy on both discovery/test-key requests: configured local origin works, unapproved destinations/DNS/redirect escapes do not issue requests. Use a trusted configured-origin policy, not a blanket private-address ban or authentication alone. |
| [Meeting state constraint](reference-review-evidence-and-fixtures.md#schema-rejects-voting-and-ended-meeting-states) — `backend/supabase_schema.sql` | Fresh and upgraded databases accept active/voting/ended/archived and reject unknown states. Add an upgrade migration; changing only fresh CREATE statements is insufficient. |
| [No follow-up inference](reference-review-evidence-and-fixtures.md#tool-execution-has-no-follow-up-inference) — `backend/app/services/orchestrator.py` | Script a tool call then require its matching result before returning grounded text. Both streaming and collected paths must continue a bounded loop, aggregate usage, preserve IDs and deduplicate effects. |
| [Undefined retrieval dependency](reference-review-evidence-and-fixtures.md#persona-backed-knowledge-search-raises-nameerror) — orchestrator `_handle_tool_call` | Persona-backed search reaches shared and assigned collections, never unassigned ones. Supply/import the dependency; do not settle for a test that merely avoids NameError without checking scope. |
| [Null search stacks](reference-review-evidence-and-fixtures.md#omitted-stack_ids-crashes-document-search) — `backend/app/api/documents.py` | Omitted/null/empty stack IDs are controlled for meeting/persona queries; no scope cannot search globally. Normalize the nullable field deliberately. |
| [Lost generation settings](reference-review-evidence-and-fixtures.md#meeting-participants-lose-persona-generation-settings) — `meeting_manager.py`, participant schemas | Non-default provider/model/temperature/token limit reaches persistence and inference. Snapshot explicit overrides plus inheritance policy; retain compatible legacy defaults and execution-time shared-default resolution. |
| [Ignored stack edits](reference-review-evidence-and-fixtures.md#persona-knowledge-stack-edits-are-silently-ignored) — `backend/app/models/persona_schemas.py` | API edit A→B, clear with `[]`, omit to preserve, validate invalid/duplicate IDs. Add the update field and atomic validated mapping replacement. |
| [Qdrant compatibility](reference-review-evidence-and-fixtures.md#allowed-qdrant-dependency-versions-remove-the-search-method) — `vector_store.py`, `requirements.txt` | Fresh supported install indexes and queries through the actual adapter, preserving filters and result conversion. Use supported `query_points` and reproducible tested versions; installed-version failure was not established. |
| [Prompt selection atomicity](reference-review-evidence-and-fixtures.md#prompt-activation-and-creation-can-lose-the-active-selection) — `persona_manager.py` | Missing activation target and failed insert preserve the previous active version; competing saves retain unique versions and one active selection. Use a real serialized transaction and database uniqueness, not separate SDK writes. |
| [Subtitle/role mismatch](reference-review-evidence-and-fixtures.md#persona-subtitles-exceed-the-meeting-participant-role-limit) — persona migration, meeting schema | Exercise 50/51/200-character subtitles and participant insert failure. Align validation/schema without silent truncation; atomic meeting creation leaves no partial records. |
| [Unsupported binary Excel](reference-review-evidence-and-fixtures.md#legacy-excel-files-are-accepted-but-cannot-be-parsed) — `document_processor.py`, upload selectors | Real BIFF `.xls` is supported deliberately or rejected before processing. A renamed `.xlsx` is not the fixture; valid `.xlsx` still works. |
| [Cohere embedding purpose](reference-review-evidence-and-fixtures.md#cohere-query-embeddings-use-document-mode) — `embedding.py` | HTTP payload spies prove query=`search_query`, indexing=`search_document`, with consistent model/dimensions. Other providers retain behavior; do not claim an unmeasured relevance improvement. |
| [Mutable template stack bindings](reference-review-evidence-and-fixtures.md#existing-participants-follow-mutable-persona-knowledge-assignments) — participant creation and retrieval | Create A, edit template, create B, reload and search both; A retains independent fields/stack IDs. Deleting the template preserves bindings to surviving stacks. Unknown historical assignments cannot be fabricated. Stack contents remain live; intentional deletion still revokes access. |

## Frontend and integration work packages

| Area and finding | Smallest red test / intended fix |
| --- | --- |
| Frontend: [settings ignored by generation](reference-review-evidence-and-fixtures.md#settings-do-not-affect-actual-generation) — settings store/API/provider selection | Every editable setting affects its intended call, or becomes honestly server-controlled/read-only. Test explicit overrides, inherited defaults, System AI, safe credential references, and environment-only local operation. |
| Frontend: [stale prompt active controls](reference-review-evidence-and-fixtures.md#prompt-history-retains-stale-active-version-controls) — `frontend/src/app/roster/[id]/page.tsx` | Save v2 then immediately reactivate v1 without reload: one active row. Reconcile canonical history; save failure and later draft edits must not be overwritten by stale completion. |
| Integration: [missing live tool activity](reference-review-evidence-and-fixtures.md#streaming-drops-tool-call-activity-events) — orchestrator/store/parser | Block the tool handler and assert pending activity is already visible. Emit call before handler, result after; preserve distinct IDs for two same-name calls and avoid duplicate activity on refetch. |

## Code example: normalize a nullable search field

Focused production fragment for `backend/app/api/documents.py`, after request scope validation. It fixes the reviewed `getattr(..., [])` null trap without allowing global search:

```python
stack_ids = request.stack_ids or []
if not (request.meeting_id or request.persona_id or stack_ids):
    raise HTTPException(status_code=400, detail="A search scope is required")
```

`HTTPException` is the existing presentation-layer error type. Explicit null is normalized here; if choosing validation rejection instead, make the DTO and tests express that choice.

## Code example: preserve the tool exchange

Fragment for the current orchestrator, using actual types from `backend/app/llm/base.py`. `response` is an `LLMResponse`; `messages` is the turn's bounded `list[LLMMessage]`; `execute_tool` is an injected handler to implement. This illustrates one continuation step, **not the complete bounded loop**:

```python
import json
from app.llm.base import LLMMessage

messages.append(LLMMessage(
    role="assistant", content=response.content, tool_calls=response.tool_calls
))
for call in response.tool_calls or []:
    result = await execute_tool(call)
    messages.append(LLMMessage(
        role="tool", tool_call_id=call.id, content=json.dumps(result)
    ))
```

The next inference must receive this exchange. Add loop/context bounds, controlled tool errors, usage per invocation, idempotent effects, final-answer rules, and one application terminal event **after persistence**. Emit the correlated tool-call event before `execute_tool`; a provider's intermediate done event is not application completion.

## Code example: supported Qdrant query shape

Adapter fragment replacing `AsyncQdrantClient.search` in `backend/app/services/vector_store.py`. Inputs are the existing validated scope/filter and query embedding; this alone does not establish source eligibility or client/server compatibility:

```python
response = await self.client.query_points(
    collection_name=collection_name,
    query=embedding,
    query_filter=search_filter,
    limit=limit,
    with_payload=True,
)
points = response.points
```

Adapt the existing result conversion to `points`, handling missing payloads deliberately. Test with the [supported client API](https://github.com/qdrant/qdrant-client/blob/master/README.md), not a fake retaining the removed method.

## Code example: prompt UI reconciliation

Proposed functional update for the roster editor after the server confirms a newly active prompt version. Keep the existing version type and setter; `saved` is the decoded server response:

```typescript
setPromptVersions(previous => [
  saved,
  ...previous
    .filter(version => version.id !== saved.id)
    .map(version => ({ ...version, is_active: false })),
]);
```

Use canonical refetch instead if it better fits the existing component. Serialize activation/save or reconcile revisions so an older response cannot win. Clear dirty state only for the submitted edit revision; this update does not solve that separate race by itself.

## Green, refactor, and exit gate

- Suggested packages: deterministic DTO/schema/parser fixes; compatible retrieval; coherent persona/configuration persistence plus editor; tool continuation plus live activity; access/destination policy. Make each package independently green before broad cleanup.
- Do not start the Phase 2 folder migration here. Keep fixes narrow and consistent with current callers; add only the schema/ports needed to establish correctness.
- Every linked finding's full regression set must pass, with red-green evidence. Real fresh/upgrade, permission, transactional prompt/creation, and Qdrant tests supplement unit/component fakes.
- Demonstrate explicit local no-login, configured local Ollama, both approved identities sharing records, and no private-stack leakage. Do not expose the app before entry/direct-access/destination checks pass.
- Record remaining limitations honestly. Next: [Recovery and data safety](spec-02-recovery-and-data-safety.md); retain all tests for the architecture migration.
