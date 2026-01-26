"""
Orchestrator service - handles AI turn-taking and response generation.
"""

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
)
from app.services.meeting_manager import MeetingManager
from app.services.tools import get_default_tools


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
            # Placeholder for Phase 2
            return "Knowledge base search is not yet implemented. Please respond without this tool.", None, None
        
        else:
            return f"Unknown tool: {tool_call.name}", None, None
    
    async def execute_turn(
        self,
        meeting_id: str,
        participant_id: str
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
        
        # Get LLM provider (use global defaults if participant config is empty)
        provider_config = participant.provider_config
        provider = get_provider(
            provider_config.provider or None,  # Empty string = use default
            provider_config.model or None       # Empty string = use default
        )
        
        # Build context
        context = self._build_context(participant, meeting.messages, meeting.agenda)
        
        # Get tools
        tools = get_default_tools()
        
        # Make LLM call
        response = await provider.complete(
            messages=context,
            tools=tools,
            temperature=provider_config.temperature
        )
        
        # Track any conflicts/consensus from tool calls
        disagreements = []
        consensus_list = []
        tool_results = []
        
        # Handle tool calls if any
        if response.tool_calls:
            for tool_call in response.tool_calls:
                result, disagreement, consensus = await self._handle_tool_call(
                    tool_call, meeting_id, participant
                )
                tool_results.append({"tool": tool_call.name, "result": result})
                
                if disagreement:
                    disagreements.append(disagreement)
                if consensus:
                    consensus_list.append(consensus)
        
        # Get the response content
        content = response.content or ""
        if not content and tool_results:
            # If only tool calls, create a summary
            content = f"[{participant.name} used tools: {', '.join(t['tool'] for t in tool_results)}]"
        
        # Estimate cost
        cost = provider.estimate_cost(response.usage)
        
        # Save the message
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
    
    async def execute_turn_streaming(
        self,
        meeting_id: str,
        participant_id: str
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
        
        # Get LLM provider
        provider_config = participant.provider_config
        provider = get_provider(
            provider_config.provider or None,
            provider_config.model or None
        )
        
        # Build context
        context = self._build_context(participant, meeting.messages, meeting.agenda)
        
        # Get tools
        tools = get_default_tools()
        
        # Track accumulated content and tool calls
        accumulated_content = ""
        tool_calls_made = []
        disagreements = []
        consensus_list = []
        usage = {}
        
        # Stream the response
        async for event in provider.stream(
            messages=context,
            tools=tools,
            temperature=provider_config.temperature
        ):
            # Handle tool calls - execute them and yield results
            if event.type == StreamEventType.TOOL_CALL and event.tool_name:
                from app.llm.base import ToolCall
                tool_call = ToolCall(
                    id=event.tool_name,
                    name=event.tool_name,
                    arguments=event.tool_arguments or {}
                )
                
                result, disagreement, consensus = await self._handle_tool_call(
                    tool_call, meeting_id, participant
                )
                
                tool_calls_made.append({"tool": event.tool_name, "result": result})
                
                if disagreement:
                    disagreements.append(disagreement)
                if consensus:
                    consensus_list.append(consensus)
                
                # Yield tool result
                yield StreamEvent(
                    type=StreamEventType.TOOL_RESULT,
                    tool_name=event.tool_name,
                    tool_result=result
                )
            
            elif event.type == StreamEventType.TEXT:
                accumulated_content += event.content or ""
                yield event
            
            elif event.type == StreamEventType.THINKING:
                yield event
            
            elif event.type == StreamEventType.DONE:
                usage = event.usage or {}
            
            elif event.type == StreamEventType.ERROR:
                yield event
                return
        
        # Save the message
        content = accumulated_content or ""
        if not content and tool_calls_made:
            content = f"[{participant.name} used tools: {', '.join(t['tool'] for t in tool_calls_made)}]"
        
        cost = provider.estimate_cost(usage)
        
        message = await self.meeting_manager.save_message(
            MessageCreate(
                meeting_id=meeting_id,
                content=content,
                sender_type=SenderType.AI,
                sender_id=participant.id,
                sender_name=participant.name,
                tool_artifacts={"tool_calls": tool_calls_made} if tool_calls_made else None,
                estimated_cost=cost
            )
        )
        
        # Yield final done event with message ID
        yield StreamEvent(
            type=StreamEventType.DONE,
            message_id=message.id,
            usage=usage
        )
