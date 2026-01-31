'use client';

import { useState, useRef, useEffect } from 'react';
import { useMeetingStore, StreamingMessage } from '@/stores/meetingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, User, Bot, AlertTriangle, Loader2 } from 'lucide-react';
import { cn, formatRelativeTime, formatCost } from '@/lib/utils';
import { ThinkingBlock } from '@/components/chat/ThinkingBlock';
import { ToolUseBlock } from '@/components/chat/ToolUseBlock';
import { CitationsBlock } from '@/components/chat/CitationsBlock';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, AIParticipant } from '@/lib/api';

export function ChatArea() {
    const {
        currentMeeting,
        sendUserMessage,
        executeTurnStreaming,
        activeTurnParticipantId,
        streamingMessage,
        error,
        clearError
    } = useMeetingStore();

    const [inputValue, setInputValue] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll when messages or streaming content changes
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [currentMeeting?.messages, streamingMessage?.content, streamingMessage?.thinkingContent]);

    if (!currentMeeting) {
        return (
            <div className="flex-1 flex items-center justify-center bg-zinc-950">
                <div className="text-center">
                    <h2 className="text-xl font-semibold text-white mb-2">Welcome to Sabha</h2>
                    <p className="text-zinc-400">Create or select a meeting to get started</p>
                </div>
            </div>
        );
    }

    const handleSendMessage = async () => {
        if (!inputValue.trim()) return;
        await sendUserMessage(inputValue.trim());
        setInputValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-zinc-950 min-h-0 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-zinc-800 shrink-0">
                <h2 className="font-semibold text-white">{currentMeeting.name}</h2>
                {currentMeeting.agenda && (
                    <p className="text-sm text-zinc-400 mt-1">
                        Agenda: {currentMeeting.agenda}
                    </p>
                )}
            </div>

            {/* Error Banner */}
            {error && (
                <div className="mx-4 mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg flex items-center gap-2 text-red-400 shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm flex-1">{error}</span>
                    <button onClick={clearError} className="text-xs hover:underline">Dismiss</button>
                </div>
            )}

            {/* Messages */}
            <ScrollArea className="flex-1 min-h-0 p-4">
                <div className="space-y-4 max-w-3xl mx-auto">
                    {currentMeeting.messages.map((message) => (
                        <MessageBubble
                            key={message.id}
                            message={message}
                            participant={currentMeeting.participants.find(p => p.id === message.sender_id)}
                        />
                    ))}

                    {/* Streaming message */}
                    {streamingMessage && (
                        <StreamingMessageBubble streamingMessage={streamingMessage} />
                    )}

                    {currentMeeting.messages.length === 0 && !streamingMessage && (
                        <div className="text-center py-12 text-zinc-500">
                            <p>No messages yet. Start the conversation!</p>
                        </div>
                    )}

                    {/* Auto-scroll anchor */}
                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            {/* Turn Selector - Fixed at bottom */}
            <div className="p-4 border-t border-zinc-800 shrink-0 bg-zinc-950">
                <div className="max-w-3xl mx-auto">
                    <p className="text-xs text-zinc-400 mb-3">Who speaks next?</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {/* User turn button */}
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                'border-zinc-700 hover:bg-zinc-800',
                                'bg-indigo-600/20 border-indigo-500 text-indigo-400'
                            )}
                        >
                            <User className="w-4 h-4 mr-1" />
                            You
                        </Button>

                        {/* AI participant turn buttons */}
                        {currentMeeting.participants.map((participant) => (
                            <Button
                                key={participant.id}
                                variant="outline"
                                size="sm"
                                disabled={activeTurnParticipantId !== null}
                                onClick={() => executeTurnStreaming(participant.id)}
                                className={cn(
                                    'border-zinc-700 hover:bg-zinc-800',
                                    activeTurnParticipantId === participant.id && 'animate-pulse'
                                )}
                                style={{
                                    borderColor: participant.color + '80',
                                    color: participant.color,
                                }}
                            >
                                {activeTurnParticipantId === participant.id ? (
                                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                ) : (
                                    <Bot className="w-4 h-4 mr-1" />
                                )}
                                {participant.name.replace('The ', '')}
                            </Button>
                        ))}
                    </div>

                    {/* Message Input */}
                    <div className="flex gap-2">
                        <Input
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type your message..."
                            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                        />
                        <Button
                            onClick={handleSendMessage}
                            disabled={!inputValue.trim()}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface MessageBubbleProps {
    message: Message;
    participant?: AIParticipant;
}

function MessageBubble({ message, participant }: MessageBubbleProps) {
    const isUser = message.sender_type === 'user';
    const isSystem = message.sender_type === 'system';

    // Parse tool artifacts
    const toolCalls = (message.tool_artifacts as { tool_calls?: Array<{ tool: string; result: string }> })?.tool_calls || [];

    return (
        <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
            {/* Avatar */}
            <div
                className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                    isUser && 'bg-indigo-600',
                    isSystem && 'bg-zinc-700',
                )}
                style={participant ? { backgroundColor: participant.color } : undefined}
            >
                {isUser ? (
                    <User className="w-4 h-4 text-white" />
                ) : isSystem ? (
                    <Bot className="w-4 h-4 text-zinc-400" />
                ) : (
                    <span className="text-white text-sm font-bold">
                        {message.sender_name.charAt(0)}
                    </span>
                )}
            </div>

            {/* Message Content */}
            <div className={cn('flex-1 max-w-[80%]', isUser && 'flex flex-col items-end')}>
                {/* Sender Name */}
                <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                        'text-sm font-medium',
                        isUser ? 'text-indigo-400' : 'text-white'
                    )} style={participant ? { color: participant.color } : undefined}>
                        {message.sender_name}
                    </span>
                    <span className="text-xs text-zinc-500">
                        {formatRelativeTime(message.created_at)}
                    </span>
                    {message.estimated_cost > 0 && (
                        <Badge variant="secondary" className="text-xs bg-zinc-800 text-zinc-400">
                            {formatCost(message.estimated_cost)}
                        </Badge>
                    )}
                </div>

                {/* Thinking content (persisted) */}
                {message.thinking_content && (
                    <ThinkingBlock
                        content={message.thinking_content}
                        isStreaming={false}
                    />
                )}

                {/* Tool calls */}
                {toolCalls.length > 0 && (
                    <div className="mb-2">
                        {toolCalls.map((tc, i) => (
                            <ToolUseBlock
                                key={i}
                                toolName={tc.tool}
                                result={tc.result}
                            />
                        ))}
                    </div>
                )}

                {/* Message Text */}
                <div className={cn(
                    'rounded-2xl px-4 py-2.5',
                    isUser ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-zinc-800 text-zinc-100 rounded-bl-md',
                    isSystem && 'bg-zinc-800/50 text-zinc-400 italic'
                )}>
                    {isUser || isSystem ? (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    ) : (
                        <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-zinc-900 prose-pre:text-zinc-300 prose-code:bg-zinc-900 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-indigo-300 prose-code:before:content-none prose-code:after:content-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.content}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>

                {/* Citations */}
                {message.citations && message.citations.length > 0 && (
                    <CitationsBlock citations={message.citations} />
                )}
            </div>
        </div>
    );
}

interface StreamingMessageBubbleProps {
    streamingMessage: StreamingMessage;
}

function StreamingMessageBubble({ streamingMessage }: StreamingMessageBubbleProps) {
    return (
        <div className="flex gap-3">
            {/* Avatar */}
            <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: streamingMessage.participantColor }}
            >
                <span className="text-white text-sm font-bold">
                    {streamingMessage.participantName.charAt(0)}
                </span>
            </div>

            {/* Message Content */}
            <div className="flex-1 max-w-[80%]">
                {/* Sender Name */}
                <div className="flex items-center gap-2 mb-1">
                    <span
                        className="text-sm font-medium"
                        style={{ color: streamingMessage.participantColor }}
                    >
                        {streamingMessage.participantName}
                    </span>
                    <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />
                </div>

                {/* Thinking block */}
                {streamingMessage.thinkingContent && (
                    <ThinkingBlock
                        content={streamingMessage.thinkingContent}
                        isStreaming={!streamingMessage.isComplete}
                    />
                )}

                {/* Tool calls */}
                {streamingMessage.toolCalls.map((tc, i) => (
                    <ToolUseBlock
                        key={i}
                        toolName={tc.name}
                        arguments={tc.arguments}
                        result={tc.result}
                        isExecuting={tc.isExecuting}
                    />
                ))}

                {/* Message Text */}
                {streamingMessage.content && (
                    <div className="rounded-2xl px-4 py-2.5 bg-zinc-800 text-zinc-100 rounded-bl-md">
                        <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-zinc-900 prose-pre:text-zinc-300 prose-code:bg-zinc-900 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-indigo-300 prose-code:before:content-none prose-code:after:content-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {streamingMessage.content}
                            </ReactMarkdown>
                            <span className="inline-block w-2 h-4 ml-1 bg-zinc-400 animate-pulse" />
                        </div>
                    </div>
                )}

                {/* Empty state while waiting for first content */}
                {!streamingMessage.content && !streamingMessage.thinkingContent && streamingMessage.toolCalls.length === 0 && (
                    <div className="rounded-2xl px-4 py-2.5 bg-zinc-800 text-zinc-500 rounded-bl-md">
                        <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                )}
            </div>
        </div>
    );
}
