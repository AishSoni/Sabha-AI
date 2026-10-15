"""One bounded inference/tool loop (R-01, CONTRACTS sections 3-4).

Streaming and collected observers share this execution; provider
invocation completion never emits application completion.
"""

import time
import uuid
from dataclasses import dataclass
from typing import Any, Optional

from app.llm.base import LLMMessage, ToolCall
from app.modules.meetings.events import make_event
from app.modules.meetings.policies import TurnPolicies
from app.modules.meetings.store import (
    COMPLETED,
    FAILED,
    CANCELLED,
    IdempotencyConflict,
    InMemoryTurnStore,
    ProtocolConflict,
    TurnConflict,
    TurnRecord,
)


ALLOWLIST = {
    "search_knowledge_base",
    "web_search",
    "log_disagreement",
    "log_consensus",
}


class TurnFailure(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


@dataclass
class TurnResult:
    turn_id: str
    state: str
    message: Optional[Any] = None
    disagreements: list[Any] = None
    consensus: list[Any] = None
    usage: dict[str, int] = None
    cost: float = 0.0
    terminal_reason: Optional[str] = None

    def __post_init__(self) -> None:
        if self.disagreements is None:
            self.disagreements = []
        if self.consensus is None:
            self.consensus = []
        if self.usage is None:
            self.usage = {}


def _chars(messages: list[LLMMessage]) -> int:
    total = 0
    for m in messages:
        total += len(m.content or "")
        for tc in m.tool_calls or []:
            total += len(tc.name) + len(str(tc.arguments))
    return total


def build_context(
    system_prompt: str,
    agenda: str,
    history: list[LLMMessage],
    policies: TurnPolicies,
) -> list[LLMMessage]:
    """Compose base prompt + agenda + recent groups within budget.

    Never splits an assistant tool-call group from its tool results: the
    caller passes already-grouped history; trimming keeps trailing complete
    groups. Irreducibly oversized base input fails before any provider call.
    """
    base = system_prompt
    if agenda:
        base += f"\n\nMEETING AGENDA:\n{agenda}"
    if len(base) > policies.max_context_chars:
        raise TurnFailure("context_too_large", "Base prompt exceeds context budget", False)
    budget = policies.max_context_chars - len(base)
    # Keep trailing messages that fit; history is already ordered.
    kept: list[LLMMessage] = []
    used = 0
    for msg in reversed(history):
        size = len(msg.content or "")
        for tc in msg.tool_calls or []:
            size += len(tc.name) + len(str(tc.arguments))
        if used + size > budget and kept:
            break
        # If a tool message would be kept without its assistant call group,
        # keep scanning backward to include the group (bounded by budget).
        kept.append(msg)
        used += size
        if used >= budget:
            break
    kept.reverse()
    # Verify assistant/tool groups are not split: a leading tool message
    # without its assistant call is dropped.
    while kept and kept[0].role == "tool":
        kept.pop(0)
    return [LLMMessage(role="system", content=base)] + kept


def _validate_tool_call(name: str, args: Any, roster: set[str]) -> tuple[bool, str]:
    if name not in ALLOWLIST:
        return False, "unknown_tool"
    if not isinstance(args, dict):
        return False, "invalid_arguments"
    if name == "search_knowledge_base":
        q = args.get("query")
        if not isinstance(q, str) or not q.strip():
            return False, "invalid_arguments"
        return True, "ok"
    if name == "web_search":
        q = args.get("query")
        if not isinstance(q, str) or not q.strip():
            return False, "invalid_arguments"
        return True, "ok"
    if name == "log_disagreement":
        for key in ("target_participant_name", "topic", "reasoning"):
            if not isinstance(args.get(key), str) or not args[key].strip():
                return False, "invalid_arguments"
        sev = args.get("severity", 3)
        if not isinstance(sev, int) or not 1 <= sev <= 5:
            return False, "invalid_arguments"
        if args["target_participant_name"] not in roster and args["target_participant_name"] != "User":
            return False, "invalid_arguments"
        return True, "ok"
    if name == "log_consensus":
        parts = args.get("participants")
        if not isinstance(parts, list) or not parts:
            return False, "invalid_arguments"
        if any(p not in roster for p in parts):
            return False, "invalid_arguments"
        if not isinstance(args.get("topic"), str) or not args["topic"].strip():
            return False, "invalid_arguments"
        strength = args.get("strength", 3)
        if not isinstance(strength, int) or not 1 <= strength <= 5:
            return False, "invalid_arguments"
        return True, "ok"
    return False, "unknown_tool"


def _sanitize(text: str, limit: int) -> str:
    if len(text) > limit:
        return text[:limit] + "…[truncated]"
    return text


class TurnEngine:
    def __init__(
        self,
        meeting_loader: Any,
        provider_resolver: Any,
        knowledge_search: Any,
        turn_store: InMemoryTurnStore,
        policies: Optional[TurnPolicies] = None,
        clock: Any = None,
    ) -> None:
        self._meetings = meeting_loader
        self._resolve_provider = provider_resolver
        self._knowledge = knowledge_search
        self._store = turn_store
        self._policies = policies or TurnPolicies()
        self._clock = clock or time.monotonic

    async def run(
        self,
        meeting_id: str,
        participant_id: str,
        idempotency_key: Optional[str] = None,
    ) -> TurnResult:
        policies = self._policies
        key = idempotency_key or str(uuid.uuid4())
        meeting = await self._meetings.get_meeting(meeting_id)
        if meeting is None:
            raise TurnFailure("not_found", f"Meeting not found: {meeting_id}")
        participant = next((p for p in meeting.participants if p.id == participant_id), None)
        if participant is None:
            raise TurnFailure("not_found", f"Participant not found: {participant_id}")
        if getattr(meeting, "status", "active") != "active" and str(
            getattr(meeting, "status", "active")
        ) != "MeetingStatus.ACTIVE":
            status = str(getattr(meeting, "status", "unknown"))
            if "active" not in status:
                raise TurnFailure("invalid_state", f"Meeting is {status}", False)

        roster = {p.name for p in meeting.participants}
        # Capture transcript boundary: ids at reservation time.
        boundary = [m.id for m in meeting.messages]
        snapshot = {
            "agenda": meeting.agenda,
            "message_ids": boundary,
            "system_prompt": participant.system_prompt,
            "provider": getattr(participant.provider_config, "provider", ""),
            "model": getattr(participant.provider_config, "model", ""),
            "temperature": getattr(participant.provider_config, "temperature", 0.7),
        }
        try:
            record = await self._store.reserve(meeting_id, participant_id, key, snapshot)
        except (TurnConflict, IdempotencyConflict):
            raise
        # Idempotent retry: already terminal returns the original outcome.
        if record.state in (COMPLETED, FAILED, CANCELLED):
            return await self._replay_result(record)
        await self._store.mark_running(record.turn_id)
        await self._store.append_event(
            record.turn_id, "turn_started",
            {"participant_id": participant_id, "context_message_count": len(boundary)},
        )

        # Build provider history from meeting transcript (bounded).
        history: list[LLMMessage] = []
        for msg in meeting.messages:
            sender_type = str(getattr(msg, "sender_type", ""))
            if "user" in sender_type.lower():
                history.append(LLMMessage(role="user", content=f"User: {msg.content}"))
            elif "ai" in sender_type.lower():
                if getattr(msg, "sender_id", None) == participant.id:
                    history.append(LLMMessage(role="assistant", content=msg.content))
                else:
                    history.append(
                        LLMMessage(role="user", content=f"AI [{msg.sender_name}]: {msg.content}")
                    )
            else:
                history.append(LLMMessage(role="user", content=f"System: {msg.content}"))

        try:
            context = build_context(participant.system_prompt, meeting.agenda, history, policies)
        except TurnFailure as exc:
            await self._fail(record, exc.code, str(exc))
            raise

        provider = self._resolve_provider(
            participant.provider_config.provider or None,
            participant.provider_config.model or None,
        )
        from app.services.tools import get_default_tools

        tools = get_default_tools()
        deadline = self._clock() + policies.deadline_seconds
        total_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        usage_known = False
        total_cost = 0.0
        tool_artifacts: list[dict[str, Any]] = []
        disagreements: list[Any] = []
        consensus_list: list[Any] = []
        citations: list[dict[str, Any]] = []
        tool_calls_made = 0

        invocation_index = 0
        provider_history = list(context)
        while True:
            # Cancellation is cooperative and loses to terminalization.
            current = await self._store.get(record.turn_id)
            if current.state == CANCELLED:
                return TurnResult(
                    turn_id=record.turn_id, state=CANCELLED,
                    usage=total_usage, cost=total_cost, terminal_reason="cancel_requested",
                )
            if self._clock() > deadline:
                err = TurnFailure("deadline_exceeded", "Turn deadline exceeded", retryable=False)
                await self._fail(record, err.code, str(err))
                raise err
            if invocation_index >= policies.max_invocations:
                err = TurnFailure("invocation_limit", "Provider invocation limit reached")
                await self._fail(record, err.code, str(err))
                raise err
            if _chars(provider_history) > policies.max_context_chars:
                err = TurnFailure("context_too_large", "Context budget exceeded before invocation")
                await self._fail(record, err.code, str(err))
                raise err

            try:
                response = await provider.complete(
                    messages=provider_history,
                    tools=tools,
                    temperature=participant.provider_config.temperature,
                )
            except Exception as exc:
                err = TurnFailure("provider_error", f"Provider error: {type(exc).__name__}")
                await self._fail(record, err.code, str(err))
                raise err from exc

            invocation_id = f"{record.turn_id}:{invocation_index}"
            created = await self._store.record_invocation(invocation_id, response.usage or {})
            if created and response.usage:
                for k in ("prompt_tokens", "completion_tokens", "total_tokens"):
                    try:
                        total_usage[k] += int((response.usage or {}).get(k, 0) or 0)
                    except (ValueError, TypeError):
                        pass
                if any((response.usage or {}).get(k) for k in ("prompt_tokens", "completion_tokens")):
                    usage_known = True
                try:
                    total_cost += float(provider.estimate_cost(response.usage or {}))
                except Exception:
                    pass
            invocation_index += 1
            record.invocation_count = invocation_index

            calls = list(response.tool_calls or [])
            text = (response.content or "").strip()

            if not calls:
                if text:
                    # Success: single atomic finalization.
                    final_text = _sanitize(response.content or "", policies.max_output_chars)
                    saved = await self._meetings.save_message(
                        _message_create(
                            meeting_id, participant, final_text, tool_artifacts,
                            citations, total_cost,
                        )
                    )
                    await self._store.append_event(
                        record.turn_id, "turn_completed",
                        {"message_id": saved.id, "usage_completeness": "complete" if usage_known else "unknown"},
                    )
                    finalized = await self._store.finalize(
                        record.turn_id, COMPLETED, saved.id, total_usage, total_cost, "final_answer",
                    )
                    _ = finalized
                    return TurnResult(
                        turn_id=record.turn_id, state=COMPLETED, message=saved,
                        disagreements=disagreements, consensus=consensus_list,
                        usage=total_usage, cost=total_cost, terminal_reason="final_answer",
                    )
                err = TurnFailure("empty_final_answer", "Model returned no usable final answer")
                await self._fail(record, err.code, str(err))
                raise err

            # Tool path: validate all, execute in order, append group, re-invoke.
            if tool_calls_made + len(calls) > policies.max_tool_calls:
                err = TurnFailure("tool_limit", "Tool call limit reached")
                await self._fail(record, err.code, str(err))
                raise err
            # Append assistant call list BEFORE results (group integrity).
            provider_history.append(
                LLMMessage(role="assistant", content=response.content, tool_calls=calls)
            )
            await self._store.append_event(
                record.turn_id, "text_delta" if text else "invocation_finished",
                {"invocation_index": invocation_index - 1, "content": text[:2000]},
            )
            for tc in calls:
                execution_id = f"{record.turn_id}:{invocation_index - 1}:{tc.id}"
                await self._store.append_event(
                    record.turn_id, "tool_call",
                    {"tool_execution_id": execution_id, "provider_call_id": tc.id,
                     "tool_name": tc.name, "arguments": _sanitize(str(tc.arguments), 2000)},
                )
                valid, code = _validate_tool_call(tc.name, tc.arguments, roster)
                if not valid:
                    result_text = _sanitize(
                        f"Tool {tc.name} rejected ({code}): no state was changed.",
                        policies.max_tool_result_chars,
                    )
                    provider_history.append(
                        LLMMessage(role="tool", content=result_text, tool_call_id=tc.id, tool_name=tc.name)
                    )
                    tool_artifacts.append(
                        {"tool": tc.name, "result": result_text, "execution_id": execution_id,
                         "provider_call_id": tc.id, "outcome": "rejected", "code": code}
                    )
                    await self._store.append_event(
                        record.turn_id, "tool_result",
                        {"tool_execution_id": execution_id, "provider_call_id": tc.id,
                         "tool_name": tc.name, "outcome": "rejected", "result": result_text},
                    )
                    continue
                outcome = await self._execute_validated(
                    tc, execution_id, meeting_id, participant, record.turn_id,
                    invocation_index - 1, disagreements, consensus_list, citations,
                )
                result_text = _sanitize(outcome["result_text"], policies.max_tool_result_chars)
                provider_history.append(
                    LLMMessage(role="tool", content=result_text, tool_call_id=tc.id, tool_name=tc.name)
                )
                tool_artifacts.append(
                    {"tool": tc.name, "result": result_text, "execution_id": execution_id,
                     "provider_call_id": tc.id, "outcome": "succeeded",
                     "effect_id": outcome.get("effect_id")}
                )
                await self._store.append_event(
                    record.turn_id, "tool_result",
                    {"tool_execution_id": execution_id, "provider_call_id": tc.id,
                     "tool_name": tc.name, "outcome": "succeeded", "result": result_text},
                )
                if outcome.get("citations"):
                    for c in outcome["citations"]:
                        await self._store.append_event(record.turn_id, "citation", dict(c))
                tool_calls_made += 1

    async def _execute_validated(
        self, tc: ToolCall, execution_id: str, meeting_id: str, participant: Any,
        turn_id: str, invocation_index: int, disagreements: list, consensus_list: list,
        citations: list,
    ) -> dict[str, Any]:
        from app.models import ConsensusCreate, DisagreementCreate

        name = tc.name
        args = tc.arguments or {}
        if name == "search_knowledge_base":
            result = await self._knowledge.search(
                args.get("query", ""), meeting_id, getattr(participant, "persona_id", None)
            )
            if not result.items:
                return {"result_text": f"No relevant documents found for query: '{args.get('query','')}'"}
            lines = []
            for i, item in enumerate(result.items, 1):
                meta = item.get("metadata", {})
                fname = meta.get("file_name", "document")
                lines.append(f"[{i}] (Score: {item.get('score', 0.0):.2f}, Source: {fname})\n{item.get('text','')}")
            cite_dicts = [c.__dict__ if hasattr(c, "__dict__") else dict(c) for c in result.citations]
            citations.extend(cite_dicts)
            return {"result_text": f"Found {len(result.items)} relevant passages:\n\n" + "\n\n---\n\n".join(lines),
                    "citations": cite_dicts}
        if name == "web_search":
            return {"result_text": "Web search is unavailable in the offline demo runtime. Respond from meeting context."}
        if name == "log_disagreement":
            data = DisagreementCreate(
                meeting_id=meeting_id, source_ai_id=participant.id,
                target_name=args["target_participant_name"], topic=args["topic"],
                reasoning=args["reasoning"], severity=args.get("severity", 3),
            )
            try:
                effect, created = await self._store.record_effect(
                    execution_id, args, {"kind": "disagreement", "pending": True}
                )
            except ProtocolConflict as exc:
                return {"result_text": f"Tool execution conflict: {exc}"}
            if not created and effect.get("disagreement_id"):
                return {"result_text": f"Disagreement already logged with {args['target_participant_name']} on: {args['topic']}",
                        "effect_id": effect["disagreement_id"]}
            saved = await self._meetings.save_disagreement(data)
            effect["disagreement_id"] = saved.id
            disagreements.append(saved)
            return {"result_text": f"Disagreement logged with {args['target_participant_name']} on: {args['topic']}",
                    "effect_id": saved.id}
        if name == "log_consensus":
            data = ConsensusCreate(
                meeting_id=meeting_id, participants=args["participants"],
                topic=args["topic"], strength=args.get("strength", 3),
            )
            try:
                effect, created = await self._store.record_effect(
                    execution_id, args, {"kind": "consensus", "pending": True}
                )
            except ProtocolConflict as exc:
                return {"result_text": f"Tool execution conflict: {exc}"}
            if not created and effect.get("consensus_id"):
                return {"result_text": f"Consensus already logged: {args['topic']}",
                        "effect_id": effect["consensus_id"]}
            saved = await self._meetings.save_consensus(data)
            effect["consensus_id"] = saved.id
            consensus_list.append(saved)
            return {"result_text": f"Consensus logged: {args['topic']}", "effect_id": saved.id}
        return {"result_text": f"Unknown tool: {name}"}

    async def _fail(self, record: TurnRecord, code: str, message: str) -> None:
        await self._store.append_event(record.turn_id, "turn_failed", {"code": code, "message": message[:1000]})
        await self._store.finalize(record.turn_id, FAILED, None, {}, 0.0, code)

    async def _replay_result(self, record: TurnRecord) -> TurnResult:
        # Retry of an idempotency key returns the original outcome shape.
        return TurnResult(turn_id=record.turn_id, state=record.state,
                          usage=dict(record.usage), cost=record.cost,
                          terminal_reason=record.terminal_reason)

    async def status(self, turn_id: str) -> TurnRecord:
        return await self._store.get(turn_id)

    async def replay(self, turn_id: str, after: int = 0) -> list[dict]:
        return await self._store.list_events(turn_id, after)

    async def cancel(self, turn_id: str) -> bool:
        cancelled = await self._store.request_cancel(turn_id)
        if cancelled:
            await self._store.append_event(turn_id, "turn_cancelled", {"reason": "cancel_requested"})
        return cancelled


def _message_create(meeting_id: str, participant: Any, content: str,
                    tool_artifacts: list, citations: list, cost: float) -> Any:
    from app.models import MessageCreate, SenderType

    return MessageCreate(
        meeting_id=meeting_id, content=content, sender_type=SenderType.AI,
        sender_id=participant.id, sender_name=participant.name,
        tool_artifacts={"tool_calls": tool_artifacts} if tool_artifacts else None,
        estimated_cost=cost,
    )
