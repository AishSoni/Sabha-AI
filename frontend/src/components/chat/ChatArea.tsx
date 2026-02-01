'use client';

import { useState, useRef, useEffect } from 'react';
import { useMeetingStore, StreamingMessage } from '@/stores/meetingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Send, User, Bot, AlertTriangle, Loader2, MessageSquare, CheckCircle2, Clock, Users, FileText, Scroll } from 'lucide-react';
import { cn, formatRelativeTime, formatCost } from '@/lib/utils';
import { ThinkingBlock } from '@/components/chat/ThinkingBlock';
import { ToolUseBlock } from '@/components/chat/ToolUseBlock';
import { CitationsBlock } from '@/components/chat/CitationsBlock';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, AIParticipant, Disagreement, Consensus } from '@/lib/api';
import { RosterTab } from '@/components/chat/RosterTab';
import { SharedDocumentsTab } from '@/components/chat/SharedDocumentsTab';
import { SummaryTab } from '@/components/chat/SummaryTab';
import { RateLimitedButton } from '@/components/ui/rate-limited-button';

export function ChatArea() {
    const {
        currentMeeting,
        sendUserMessage,
        executeTurnStreaming,
        activeTurnParticipantId,
        streamingMessage,
        disagreements,
        consensusList,
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
    }, [currentMeeting?.messages, streamingMessage?.content]);

    if (!currentMeeting) {
        return (
            <div className="flex-1 flex items-center justify-center bg-zinc-950">
                <p className="text-zinc-500">Select a meeting to view messages</p>
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
            {/* Tabs Header */}
            <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
                <div className="border-b border-zinc-800 px-4 shrink-0">
                    <TabsList className="bg-transparent h-12 gap-1">
                        <TabsTrigger
                            value="chat"
                            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 px-4"
                        >
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Chat
                        </TabsTrigger>
                        <TabsTrigger
                            value="disagreements"
                            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 px-4"
                        >
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            Disagreements
                            {disagreements.length > 0 && (
                                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs bg-red-900/50 text-red-400">
                                    {disagreements.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger
                            value="consensus"
                            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 px-4"
                        >
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Consensus
                            {consensusList.length > 0 && (
                                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs bg-green-900/50 text-green-400">
                                    {consensusList.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger
                            value="roster"
                            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 px-4"
                        >
                            <Users className="w-4 h-4 mr-2" />
                            Roster
                        </TabsTrigger>
                        <TabsTrigger
                            value="documents"
                            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 px-4"
                        >
                            <FileText className="w-4 h-4 mr-2" />
                            Shared Docs
                        </TabsTrigger>
                        <TabsTrigger
                            value="summary"
                            className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400 px-4"
                        >
                            <Scroll className="w-4 h-4 mr-2" />
                            Summary
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mx-4 mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg flex items-center gap-2 text-red-400 shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm flex-1">{error}</span>
                        <button onClick={clearError} className="text-xs hover:underline">Dismiss</button>
                    </div>
                )}

                {/* Chat Tab */}
                <TabsContent value="chat" className="flex-1 flex flex-col m-0 min-h-0">
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
                </TabsContent>

                {/* Disagreements Tab */}
                <TabsContent value="disagreements" className="flex-1 m-0 min-h-0">
                    <ScrollArea className="h-full p-4">
                        <div className="max-w-3xl mx-auto">
                            {disagreements.length === 0 ? (
                                <div className="text-center py-16 text-zinc-500">
                                    <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <h3 className="text-lg font-medium text-zinc-400 mb-1">No Disagreements Yet</h3>
                                    <p className="text-sm">When AI participants disagree, their debates will appear here.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-sm text-zinc-400 mb-4">
                                        {disagreements.length} disagreement{disagreements.length !== 1 ? 's' : ''} logged
                                    </p>
                                    {disagreements.map((d) => (
                                        <DisagreementCard key={d.id} disagreement={d} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </TabsContent>

                {/* Consensus Tab */}
                <TabsContent value="consensus" className="flex-1 m-0 min-h-0">
                    <ScrollArea className="h-full p-4">
                        <div className="max-w-3xl mx-auto">
                            {consensusList.length === 0 ? (
                                <div className="text-center py-16 text-zinc-500">
                                    <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <h3 className="text-lg font-medium text-zinc-400 mb-1">No Consensus Yet</h3>
                                    <p className="text-sm">When AI participants reach agreement, it will appear here.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-sm text-zinc-400 mb-4">
                                        {consensusList.length} consensus point{consensusList.length !== 1 ? 's' : ''} reached
                                    </p>
                                    {consensusList.map((c) => (
                                        <ConsensusCard key={c.id} consensus={c} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </TabsContent>

                {/* Roster Tab */}
                <TabsContent value="roster" className="flex-1 m-0 min-h-0">
                    <RosterTab />
                </TabsContent>

                {/* Shared Documents Tab */}
                <TabsContent value="documents" className="flex-1 m-0 min-h-0">
                    <SharedDocumentsTab />
                </TabsContent>

                {/* Summary Tab */}
                <TabsContent value="summary" className="flex-1 m-0 min-h-0">
                    <SummaryTab />
                </TabsContent>
            </Tabs>

            {/* Turn Selector - Fixed at bottom */}
            <div className="p-4 border-t border-zinc-800 shrink-0 bg-zinc-950">
                <div className="max-w-3xl mx-auto">
                    {currentMeeting.status === 'ended' ? (
                        <div className="text-center py-2 text-zinc-500">
                            <p className="text-sm">This meeting has ended. The chat is read-only.</p>
                        </div>
                    ) : (
                        <>
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
                                    <RateLimitedButton
                                        key={participant.id}
                                        provider={participant.provider_config.provider || 'default'}
                                        variant="outline"
                                        size="sm"
                                        disabled={activeTurnParticipantId !== null}
                                        onRateLimitedClick={() => executeTurnStreaming(participant.id)}
                                        isLoading={activeTurnParticipantId === participant.id}
                                        className={cn(
                                            'border-zinc-700 hover:bg-zinc-800',
                                            activeTurnParticipantId === participant.id && 'animate-pulse'
                                        )}
                                        style={{
                                            borderColor: participant.color + '80',
                                            color: participant.color,
                                        }}
                                    >
                                        <Bot className="w-4 h-4 mr-1" />
                                        {participant.name.replace('The ', '')}
                                    </RateLimitedButton>
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
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// Disagreement card component
function DisagreementCard({ disagreement }: { disagreement: Disagreement }) {
    const severityColors = {
        1: 'border-yellow-800/50 bg-yellow-900/20',
        2: 'border-orange-800/50 bg-orange-900/20',
        3: 'border-red-800/50 bg-red-900/20',
        4: 'border-red-700/50 bg-red-900/30',
        5: 'border-red-600/50 bg-red-900/40',
    };

    const severity = (disagreement.severity || 3) as keyof typeof severityColors;

    return (
        <Card className={cn('p-4 border', severityColors[severity])}>
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <h4 className="font-medium text-white">{disagreement.topic}</h4>
                    <Badge
                        variant="secondary"
                        className={cn(
                            'shrink-0 text-xs',
                            disagreement.status === 'open'
                                ? 'bg-red-900/50 text-red-400'
                                : 'bg-zinc-700 text-zinc-400'
                        )}
                    >
                        {disagreement.status}
                    </Badge>
                </div>
                <p className="text-sm text-zinc-400">{disagreement.reasoning}</p>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span>Challenging: <span className="text-zinc-300">{disagreement.target_name}</span></span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(disagreement.created_at)}
                    </span>
                    <span>•</span>
                    <span>Severity: {severity}/5</span>
                </div>
            </div>
        </Card>
    );
}

// Consensus card component
function ConsensusCard({ consensus }: { consensus: Consensus }) {
    const strengthColors = {
        1: 'border-green-800/30 bg-green-900/10',
        2: 'border-green-800/40 bg-green-900/15',
        3: 'border-green-700/50 bg-green-900/20',
        4: 'border-green-600/50 bg-green-900/25',
        5: 'border-green-500/50 bg-green-900/30',
    };

    const strength = (consensus.strength || 3) as keyof typeof strengthColors;

    return (
        <Card className={cn('p-4 border', strengthColors[strength])}>
            <div className="space-y-3">
                <h4 className="font-medium text-white">{consensus.topic}</h4>
                <div className="flex flex-wrap gap-2">
                    {(consensus.participants as string[]).map((name, i) => (
                        <Badge
                            key={i}
                            variant="secondary"
                            className="text-xs bg-green-900/40 text-green-400"
                        >
                            {name}
                        </Badge>
                    ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span>Strength: {strength}/5</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(consensus.created_at)}
                    </span>
                </div>
            </div>
        </Card>
    );
}

function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
