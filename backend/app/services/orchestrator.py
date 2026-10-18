"""
Orchestrator service - handles AI turn-taking and response generation.
"""

import json
from typing import List, Optional
from app.llm import get_provider, LLMMessage, LLMResponse, ToolCall
from app.models import (
    AIParticipant,
    Message,
    MessageCreate,
    SenderType,
    DisagreementCreate,
    ConsensusCreate,
    Disagreement,
    Consensus,
    TurnResponse,
    ProviderConfig,
    RequestProviderSettings,
)
from app.services.meeting_manager import MeetingManager
from app.core.database import get_supabase
from app.core.config import settings
from app.services.tools import get_default_tools


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


class MissingProviderKeyError(ValueError):
    """A cloud-provider turn carries no browser key (BYOK) and the server has
    no configured key either — the turn cannot authenticate, so fail loudly
    instead of silently proceeding."""


def _resolve_generation_settings(
    participant: AIParticipant,
    provider_settings: Optional[RequestProviderSettings] = None,
    provider_api_key: Optional[str] = None,
) -> dict:
    """Merge per-request browser overrides over the participant's persisted
    provider_config snapshot (created at meeting time), then server defaults.

    Request values win; absent request values fall back to the participant's
    own settings; the API key never persists — it rides the request header
    only. Cloud providers must have some key available or the turn is
    rejected with MissingProviderKeyError.
    """
    config = getattr(participant, "provider_config", None) or ProviderConfig()
    overrides = provider_settings or RequestProviderSettings()

    resolved = {
        "provider": overrides.provider or config.provider or "",
        "model": overrides.model or config.model or "",
        "temperature": (
            overrides.temperature
            if overrides.temperature is not None
            else config.temperature
        ),
        "max_tokens": (
            overrides.max_tokens
            if overrides.max_tokens is not None
            else config.max_tokens
        ),
        # base_url is a request-only concept (local Ollama destinations).
        "base_url": overrides.base_url or None,
        # Per-request secret; never stored with the participant.
        "api_key": provider_api_key,
    }

    resolved["provider"] = resolved["provider"] or settings.default_llm_provider

    if resolved["provider"] in ("openrouter", "gemini"):
        server_key = getattr(settings, f"{resolved['provider']}_api_key", "")
        if not resolved["api_key"] and not server_key:
            raise MissingProviderKeyError(
                f"No API key available for {resolved['provider']}. "
                "Provide a browser key (BYOK) or configure the server key."
            )

    return resolved


class Orchestrator:
    """
    Handles the AI turn-taking and response generation loop.
    
    Responsibilities:
    1. Assemble context (system prompt + chat history)
    2. Make LLM inference call
    3. Handle tool calls (disagreements, consensus)
    4. Stream/return final response
    """
    
    def __init__(self, meeting_manager: MeetingManager):
        self.meeting_manager = meeting_manager
    
    def _build_context(
        self,
        participant: AIParticipant,
        messages: List[Message],
        agenda: str
    ) -> List[LLMMessage]:
        """Build the LLM message context from system prompt and chat history."""
        
        context = []
        
        # System message with persona
        system_content = participant.system_prompt
        if agenda:
            system_content += f"\n\nMEETING AGENDA:\n{agenda}"
        
        context.append(LLMMessage(role="system", content=system_content))
        
        # Convert chat history to LLM messages
        for msg in messages:
            if msg.sender_type == SenderType.USER:
                context.append(LLMMessage(
                    role="user",
                    content=f"User: {msg.content}"
                ))
            elif msg.sender_type == SenderType.AI:
                # Other AI messages appear as "assistant" context
                if msg.sender_id == participant.id:
                    # This AI's own previous messages
                    context.append(LLMMessage(
                        role="assistant",
                        content=msg.content
                    ))
                else:
                    # Other AI's messages (include in user context)
                    context.append(LLMMessage(
                        role="user",
                        content=f"AI [{msg.sender_name}]: {msg.content}"
                    ))
            elif msg.sender_type == SenderType.SYSTEM:
                context.append(LLMMessage(
                    role="user",
                    content=f"System: {msg.content}"
                ))
        
        return context
    
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
            from app.services.vector_store import get_vector_store, VectorStoreManager
            
            query = tool_call.arguments.get("query", "")
            if not query:
                return "Search query is empty. Please provide a query.", None, None
            
            vector_store = get_vector_store()
            collections_to_search = []
            
            # Search meeting's shared documents
            shared_collection = VectorStoreManager.meeting_collection_name(meeting_id)
            if await vector_store.collection_exists(shared_collection):
                collections_to_search.append(shared_collection)
            
            # Search participant's knowledge stacks. Assignment snapshot is
            # authoritative (captured at participant creation); only legacy
            # rows without a snapshot fall back to the template join. Stack
            # CONTENTS stay live via per-stack collections.
            stack_ids = getattr(participant, "stack_ids", None)
            if stack_ids is None and getattr(participant, "persona_id", None):
                db = get_supabase()
                stacks_res = db.table("persona_knowledge_stacks") \
                               .select("stack_id") \
                               .eq("persona_id", participant.persona_id) \
                               .execute()
                stack_ids = [row["stack_id"] for row in stacks_res.data]
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
        
        # Find the participant
        participant = None
        for p in meeting.participants:
            if p.id == participant_id:
                participant = p
                break
        
        if not participant:
            raise ValueError(f"Participant not found: {participant_id}")
        
        # Get LLM provider: browser overrides (BYOK, per request) merged over
        # the participant's persisted config, then server defaults.
        gen = _resolve_generation_settings(
            participant, provider_settings, provider_api_key
        )
        provider = get_provider(
            provider_name=gen["provider"],
            model=gen["model"] or None,  # Empty string = use default
            api_key=gen["api_key"],
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
        for _round in range(MAX_TOOL_ROUNDS):
            response = await provider.complete(
                messages=messages,
                tools=tools,
                temperature=gen["temperature"],
                max_tokens=gen["max_tokens"]
            )
            _merge_usage(usage_total, response.usage)

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

        # Estimate cost across ALL rounds of this turn
        cost = provider.estimate_cost(usage_total)

        # Save the message once, after the loop settles
        message = await self.meeting_manager.save_message(
            MessageCreate(
                meeting_id=meeting_id,
                content=content,
                sender_type=SenderType.AI,
                sender_id=participant.id,
                sender_name=participant.name,
                tool_artifacts={"tool_calls": tool_results} if tool_results else None,
                estimated_cost=cost
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
        from app.llm import get_provider, StreamEvent, StreamEventType
        
        # Load meeting data
        meeting = await self.meeting_manager.get_meeting(meeting_id)
        if not meeting:
            yield StreamEvent(type=StreamEventType.ERROR, content=f"Meeting not found: {meeting_id}")
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
        
        # Get LLM provider: browser overrides (BYOK, per request) merged over
        # the participant's persisted config, then server defaults.
        gen = _resolve_generation_settings(
            participant, provider_settings, provider_api_key
        )
        provider = get_provider(
            provider_name=gen["provider"],
            model=gen["model"] or None,
            api_key=gen["api_key"],
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
        call_counter = 0  # unique, per-turn ids for announced tool calls

        for _round in range(MAX_TOOL_ROUNDS):
            had_tool_calls = False

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
                    from app.llm.base import ToolCall
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

                elif event.type == StreamEventType.ERROR:
                    yield event
                    return

            if not had_tool_calls:
                break

        # Save the message
        content = accumulated_content or ""
        if not content and tool_calls_made:
            content = f"[{participant.name} used tools: {', '.join(t['tool'] for t in tool_calls_made)}]"

        cost = provider.estimate_cost(usage_total)
        
        message = await self.meeting_manager.save_message(
            MessageCreate(
                meeting_id=meeting_id,
                content=content,
                sender_type=SenderType.AI,
                sender_id=participant.id,
                sender_name=participant.name,
                tool_artifacts={"tool_calls": tool_calls_made} if tool_calls_made else None,
                thinking_content=accumulated_thinking if accumulated_thinking else None,
                estimated_cost=cost
            )
        )
        
        # Yield final done event with message ID
        yield StreamEvent(
            type=StreamEventType.DONE,
            message_id=message.id,
            usage=usage_total
        )
