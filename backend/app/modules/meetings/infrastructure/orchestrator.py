"""
Orchestrator service - handles AI turn-taking and response generation.
"""

import json
import uuid as uuid_module
from typing import List, Optional
from app.capabilities.inference.contracts import LLMMessage, LLMResponse, ToolCall
from app.platform.providers import get_provider
from app.modules.meetings.domain.models import (
    AIParticipant,
    Consensus,
    ConsensusCreate,
    Disagreement,
    DisagreementCreate,
    MeetingStatus,
    Message,
    MessageCreate,
    RequestProviderSettings,
    SenderType,
    TurnResponse,
)
from app.modules.meetings.application.meeting_service import MeetingService
from app.modules.meetings.domain.errors import MeetingClosedError
from app.capabilities.configuration.contracts import MissingProviderKeyError
from app.capabilities.configuration.service import resolve_effective_settings
from app.modules.meetings.application.context import build_context
from app.modules.meetings.application.tools import get_default_tools
from app.capabilities.inference.usage import record_inference_attempt


# Upper bound on provider round-trips within one turn so a model that keeps
# demanding tools can never loop forever. Each round executes that round's
# tool calls (each exactly once) and feeds the results back to the model.
MAX_TOOL_ROUNDS = 5


def _merge_usage(total: dict, usage: dict | None) -> dict:
    """Accumulate numeric token-usage keys across provider calls."""
    for key, value in (usage or {}).items():
        if isinstance(value, (int, float)):
            total[key] = total.get(key, 0) + value
    return total


# Alias removed with the spec-06 cutover; resolution is
# resolve_effective_settings (frozen settings + provenance) everywhere.


class Orchestrator:
    """
    Handles the AI turn-taking and response generation loop.
    
    Responsibilities:
    1. Assemble context (system prompt + chat history)
    2. Make LLM inference call
    3. Handle tool calls (disagreements, consensus)
    4. Stream/return final response
    """
    
    def __init__(self, meeting_manager: MeetingService):
        self.meeting_manager = meeting_manager
    
    def _build_context(
        self,
        participant: AIParticipant,
        messages: List[Message],
        agenda: str
    ) -> List[LLMMessage]:
        """Build the LLM message context from system prompt and chat history."""
        return build_context(participant, messages, agenda)
    
    async def _handle_tool_call(
        self,
        tool_call: ToolCall,
        meeting_id: str,
        participant: AIParticipant
    ) -> tuple[str, Optional[Disagreement], Optional[Consensus]]:
        """Execute a tool call and return the result."""
        
        disagreement = None
        consensus = None
        
        if tool_call.name == "log_disagreement":
            args = tool_call.arguments
            disagreement = await self.meeting_manager.save_disagreement(
                DisagreementCreate(
                    meeting_id=meeting_id,
                    source_ai_id=participant.id,
                    target_name=args["target_participant_name"],
                    topic=args["topic"],
                    reasoning=args["reasoning"],
                    severity=args.get("severity", 3)
                )
            )
            return f"Disagreement logged with {args['target_participant_name']} on: {args['topic']}", disagreement, None
        
        elif tool_call.name == "log_consensus":
            args = tool_call.arguments
            consensus = await self.meeting_manager.save_consensus(
                ConsensusCreate(
                    meeting_id=meeting_id,
                    participants=args["participants"],
                    topic=args["topic"],
                    strength=args.get("strength", 3)
                )
            )
            return f"Consensus logged: {args['topic']}", None, consensus
        
        elif tool_call.name == "web_search":
            # Placeholder for Phase 2
            return "Web search is not yet implemented. Please respond without this tool.", None, None
        
        elif tool_call.name == "search_knowledge_base":
            # RAG search across meeting shared documents and participant's private knowledge
            from app.modules.knowledge.infrastructure.legacy_vector_store import (
                get_vector_store,
                VectorStoreManager,
            )
            
            query = tool_call.arguments.get("query", "")
            if not query:
                return "Search query is empty. Please provide a query.", None, None
            
            vector_store = get_vector_store()
            collections_to_search = []
            
            # Search meeting's shared documents
            shared_collection = VectorStoreManager.meeting_collection_name(meeting_id)
            if await vector_store.collection_exists(shared_collection):
                collections_to_search.append(shared_collection)
            
            # Search participant's knowledge stacks. The scope was assembled
            # once before inference started
            # (MeetingService.ensure_participant_knowledge_scope); the
            # execution path never reads template tables (spec 06).
            stack_ids = participant.stack_ids
            for stack_id in (stack_ids or []):
                stack_col = VectorStoreManager.stack_collection_name(stack_id)
                if await vector_store.collection_exists(stack_col):
                    collections_to_search.append(stack_col)
            
            if not collections_to_search:
                return "No documents found in your knowledge stack or the meeting's shared documents. Please ask the user to upload documents.", None, None
            
            try:
                results = await vector_store.search_multiple_collections(
                    collection_names=collections_to_search,
                    query=query,
                    limit=5,
                )
                
                if not results:
                    return f"No relevant documents found for query: '{query}'", None, None
                
                # Format results for the AI
                formatted_results = []
                for i, r in enumerate(results, 1):
                    file_name = r.metadata.get("file_name", "Unknown")
                    formatted_results.append(f"[{i}] (Score: {r.score:.2f}, Source: {file_name})\n{r.text}")
                
                return f"Found {len(results)} relevant passages:\n\n" + "\n\n---\n\n".join(formatted_results), None, None
                
            except Exception as e:
                return f"Error searching knowledge base: {str(e)}", None, None
        
        else:
            return f"Unknown tool: {tool_call.name}", None, None
    
    async def _record_inference(
        self,
        *,
        meeting_id: str,
        purpose: str,
        gen: dict,
        usage: Optional[dict],
        estimator,
    ) -> float:
        """Record one COMPLETED inference attempt in the universal ledger."""
        return await record_inference_attempt(
            self.meeting_manager,
            meeting_id=meeting_id,
            purpose=purpose,
            provider=gen.get("provider"),
            model=(gen.get("model") or None),
            usage=usage,
            estimator=estimator,
        )

    async def execute_turn(
        self,
        meeting_id: str,
        participant_id: str,
        provider_settings: Optional[RequestProviderSettings] = None,
        provider_api_key: Optional[str] = None,
    ) -> TurnResponse:
        """
        Execute an AI participant's turn.
        
        This is the core orchestration loop:
        1. Load meeting context
        2. Build prompts
        3. Call LLM with tools
        4. Handle any tool calls
        5. Save and return response
        """
        
        # Load meeting data
        meeting = await self.meeting_manager.get_meeting(meeting_id)
        if not meeting:
            raise ValueError(f"Meeting not found: {meeting_id}")

        if meeting.status != MeetingStatus.ACTIVE:
            # Entry-time guard: closes must not start paid inference for a
            # meeting that already stopped accepting turns.
            raise MeetingClosedError(
                f"Meeting is {meeting.status.value}; turns are only allowed while a meeting is active"
            )

        # Find the participant
        participant = None
        for p in meeting.participants:
            if p.id == participant_id:
                participant = p
                break
        
        if not participant:
            raise ValueError(f"Participant not found: {participant_id}")
        
        # Resolve the GEN settings ONCE per turn: browser overrides (BYOK,
        # per request) merged over the participant's explicit policy, then
        # its legacy carrier, then the server defaults AT EXECUTION START.
        # The frozen object carries NO credentials; providers fall back to
        # server-configured keys internally when no browser key applies.
        effective = resolve_effective_settings(
            participant, provider_settings, provider_api_key
        )
        gen = effective.as_gen_dict()
        await self.meeting_manager.ensure_participant_knowledge_scope(participant)
        provider = get_provider(
            provider_name=gen["provider"],
            model=gen["model"] or None,  # Empty string = use default
            api_key=provider_api_key,  # transient browser BYOK key; unused keys are ignored by the transport
            base_url=gen["base_url"],
        )
        
        # Build context once; the loop appends tool activity to it.
        context = self._build_context(participant, meeting.messages, meeting.agenda)
        messages = list(context)

        # Get tools
        tools = get_default_tools()

        # Track any conflicts/consensus from tool calls
        disagreements: list[Disagreement] = []
        consensus_list: list[Consensus] = []
        tool_results: list[dict] = []
        usage_total: dict = {}

        response = None
        cost_accum = 0.0  # ledger-recorded cost, per completed provider round
        for _round in range(MAX_TOOL_ROUNDS):
            response = await provider.complete(
                messages=messages,
                tools=tools,
                temperature=gen["temperature"],
                max_tokens=gen["max_tokens"]
            )
            _merge_usage(usage_total, response.usage)

            # Each completed provider round is one paid inference attempt:
            # record it exactly once, immediately after completion.
            cost_accum += await self._record_inference(
                meeting_id=meeting_id,
                purpose="turn",
                gen=gen,
                usage=response.usage,
                estimator=provider,
            )

            if not response.tool_calls:
                break  # the model answered; follow-up inference complete

            # Make the model's tool request part of the conversation, then
            # append one tool-result message per requested call.
            messages.append(LLMMessage(
                role="assistant",
                content=response.content,
                tool_calls=response.tool_calls,
            ))

            for tool_call in response.tool_calls:
                result, disagreement, consensus = await self._execute_tool_safely(
                    tool_call, meeting_id, participant
                )
                tool_results.append({"tool": tool_call.name, "result": result})
                messages.append(LLMMessage(
                    role="tool",
                    tool_call_id=tool_call.id,
                    content=json.dumps(result),
                ))
                if disagreement:
                    disagreements.append(disagreement)
                if consensus:
                    consensus_list.append(consensus)

        # Get the response content
        content = response.content or ""
        if not content and tool_results:
            # If the bound was reached without a plain answer, summarize what
            # the tools did.
            content = f"[{participant.name} used tools: {', '.join(t['tool'] for t in tool_results)}]"

        # Message estimate is display-only; the ledger owns meeting totals.
        cost = cost_accum

        # Save the message once, after the loop settles.
        # Late-write policy (spec-02): the meeting status is NOT re-checked
        # here. A meeting closed mid-turn does not un-earn the paid
        # response; exactly one write persists and the closed status stands.
        message = await self.meeting_manager.save_message(
            MessageCreate(
                meeting_id=meeting_id,
                content=content,
                sender_type=SenderType.AI,
                sender_id=participant.id,
                sender_name=participant.name,
                tool_artifacts={"tool_calls": tool_results} if tool_results else None,
                estimated_cost=cost,
                effective_generation=effective.as_record(),
            )
        )

        return TurnResponse(
            message=message,
            disagreements=disagreements,
            consensus=consensus_list
        )

    async def _execute_tool_safely(
        self,
        tool_call: ToolCall,
        meeting_id: str,
        participant: AIParticipant
    ) -> tuple[str, Optional[Disagreement], Optional[Consensus]]:
        """Execute one tool call, converting failures into a result the model
        can reason about instead of crashing the turn."""
        try:
            return await self._handle_tool_call(tool_call, meeting_id, participant)
        except Exception as exc:
            return f"Tool {tool_call.name} failed: {exc}", None, None

    async def execute_turn_streaming(
        self,
        meeting_id: str,
        participant_id: str,
        provider_settings: Optional[RequestProviderSettings] = None,
        provider_api_key: Optional[str] = None,
    ):
        """
        Execute an AI participant's turn with streaming.
        Yields StreamEvent objects for real-time UI updates.
        """
        from app.capabilities.inference.contracts import StreamEvent, StreamEventType
        from app.platform.providers import get_provider
        
        # Load meeting data
        meeting = await self.meeting_manager.get_meeting(meeting_id)
        if not meeting:
            yield StreamEvent(type=StreamEventType.ERROR, content=f"Meeting not found: {meeting_id}")
            return

        if meeting.status != MeetingStatus.ACTIVE:
            # Entry-time guard: closed meetings never start paid inference;
            # the client sees the rejection as a normal stream error event.
            yield StreamEvent(
                type=StreamEventType.ERROR,
                content=(
                    f"Meeting is {meeting.status.value}; turns are only allowed "
                    "while a meeting is active"
                ),
            )
            return

        # Find the participant
        participant = None
        for p in meeting.participants:
            if p.id == participant_id:
                participant = p
                break
        
        if not participant:
            yield StreamEvent(type=StreamEventType.ERROR, content=f"Participant not found: {participant_id}")
            return
        
        # Resolve the GEN settings ONCE per turn (same contract as the
        # non-streaming path): frozen effective settings with provenance.
        effective = resolve_effective_settings(
            participant, provider_settings, provider_api_key
        )
        gen = effective.as_gen_dict()
        await self.meeting_manager.ensure_participant_knowledge_scope(participant)
        provider = get_provider(
            provider_name=gen["provider"],
            model=gen["model"] or None,
            api_key=provider_api_key,  # transient browser BYOK key; unused keys are ignored by the transport
            base_url=gen["base_url"],
        )
        
        # Build context
        context = self._build_context(participant, meeting.messages, meeting.agenda)
        
        # Get tools
        tools = get_default_tools()
        
        # Track accumulated content and tool calls
        accumulated_thinking = ""  # Track thinking content for persistence

        # Stream the response, allowing for further inference rounds after
        # tool execution. Intermediate provider DONE events are swallowed so
        # the application emits exactly ONE terminal event after persistence.
        messages = list(context)
        accumulated_content = ""
        accumulated_thinking = ""  # Track thinking content for persistence
        tool_calls_made = []
        disagreements = []
        consensus_list = []
        usage_total = {}
        cost_accum = 0.0  # ledger-recorded cost, per completed provider round
        call_counter = 0  # unique, per-turn ids for announced tool calls

        for _round in range(MAX_TOOL_ROUNDS):
            had_tool_calls = False
            round_usage = {}  # this round's usage, for its own ledger event

            async for event in provider.stream(
                messages=messages,
                tools=tools,
                temperature=gen["temperature"],
                max_tokens=gen["max_tokens"]
            ):
                # Handle tool calls - announce the call BEFORE executing so
                # the UI sees the activity, then correlate the result to it.
                if event.type == StreamEventType.TOOL_CALL and event.tool_name:
                    had_tool_calls = True
                    from app.capabilities.inference.contracts import ToolCall
                    call_id = event.tool_call_id or f"call-{call_counter}"
                    call_counter += 1
                    tool_call = ToolCall(
                        id=call_id,
                        name=event.tool_name,
                        arguments=event.tool_arguments or {}
                    )

                    # Announce before execution; repeated same-name calls keep
                    # their own unique ids.
                    yield StreamEvent(
                        type=StreamEventType.TOOL_CALL,
                        tool_name=event.tool_name,
                        tool_arguments=event.tool_arguments,
                        tool_call_id=call_id,
                    )

                    result, disagreement, consensus = await self._execute_tool_safely(
                        tool_call, meeting_id, participant
                    )

                    tool_calls_made.append({"tool": event.tool_name, "result": result})
                    messages.append(LLMMessage(
                        role="assistant",
                        content="",
                        tool_calls=[tool_call],
                    ))
                    messages.append(LLMMessage(
                        role="tool",
                        tool_call_id=call_id,
                        content=json.dumps(result),
                    ))

                    if disagreement:
                        disagreements.append(disagreement)
                    if consensus:
                        consensus_list.append(consensus)

                    # Yield the correlated tool result
                    yield StreamEvent(
                        type=StreamEventType.TOOL_RESULT,
                        tool_name=event.tool_name,
                        tool_result=result,
                        tool_call_id=call_id,
                    )

                elif event.type == StreamEventType.TEXT:
                    accumulated_content += event.content or ""
                    messages.append(LLMMessage(role="assistant", content=event.content or ""))
                    yield event

                elif event.type == StreamEventType.THINKING:
                    accumulated_thinking += event.content or ""
                    yield event

                elif event.type == StreamEventType.DONE:
                    # Capture usage; the terminal event is emitted AFTER
                    # persistence below (exactly once per turn).
                    _merge_usage(usage_total, event.usage)
                    _merge_usage(round_usage, event.usage)

                elif event.type == StreamEventType.ERROR:
                    yield event
                    return

            # The provider stream completed: record this round's paid attempt.
            cost_accum += await self._record_inference(
                meeting_id=meeting_id,
                purpose="turn",
                gen=gen,
                usage=round_usage if round_usage else None,
                estimator=provider,
            )

            if not had_tool_calls:
                break

        # Save the message
        content = accumulated_content or ""
        if not content and tool_calls_made:
            content = f"[{participant.name} used tools: {', '.join(t['tool'] for t in tool_calls_made)}]"

        # Message estimate is display-only; the ledger owns meeting totals.
        cost = cost_accum

        message = await self.meeting_manager.save_message(
            MessageCreate(
                meeting_id=meeting_id,
                content=content,
                sender_type=SenderType.AI,
                sender_id=participant.id,
                sender_name=participant.name,
                tool_artifacts={"tool_calls": tool_calls_made} if tool_calls_made else None,
                thinking_content=accumulated_thinking if accumulated_thinking else None,
                estimated_cost=cost,
                effective_generation=effective.as_record(),
            )
        )
        
        # Yield final done event with message ID
        yield StreamEvent(
            type=StreamEventType.DONE,
            message_id=message.id,
            usage=usage_total
        )
