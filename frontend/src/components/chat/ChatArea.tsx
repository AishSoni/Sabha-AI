'use client';

import { useState } from 'react';
import { useMeetingStore } from '@/stores/meetingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Send, User, Bot, AlertTriangle } from 'lucide-react';
import { cn, formatRelativeTime, formatCost } from '@/lib/utils';
import type { Message, AIParticipant } from '@/lib/api';

export function ChatArea() {
    const {
        currentMeeting,
        sendUserMessage,
        executeTurn,
        activeTurnParticipantId,
        error,
        clearError
    } = useMeetingStore();

    const [inputValue, setInputValue] = useState('');

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
        <div className="flex-1 flex flex-col bg-zinc-950">
            {/* Header */}
            <div className="p-4 border-b border-zinc-800">
                <h2 className="font-semibold text-white">{currentMeeting.name}</h2>
                {currentMeeting.agenda && (
                    <p className="text-sm text-zinc-400 mt-1">
                        Agenda: {currentMeeting.agenda}
                    </p>
                )}
            </div>

            {/* Error Banner */}
            {error && (
                <div className="mx-4 mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm flex-1">{error}</span>
                    <button onClick={clearError} className="text-xs hover:underline">Dismiss</button>
                </div>
            )}

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
                <div className="space-y-4 max-w-3xl mx-auto">
                    {currentMeeting.messages.map((message) => (
                        <MessageBubble
                            key={message.id}
                            message={message}
                            participant={currentMeeting.participants.find(p => p.id === message.sender_id)}
                        />
                    ))}

                    {currentMeeting.messages.length === 0 && (
                        <div className="text-center py-12 text-zinc-500">
                            <p>No messages yet. Start the conversation!</p>
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Turn Selector */}
            <div className="p-4 border-t border-zinc-800">
                <div className="max-w-3xl mx-auto">
                    <p className="text-xs text-zinc-400 mb-3">Who speaks next?</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {/* User turn button (for typing) */}
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
                                onClick={() => executeTurn(participant.id)}
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

                {/* Message Text */}
                <div className={cn(
                    'rounded-2xl px-4 py-2.5',
                    isUser ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-zinc-800 text-zinc-100 rounded-bl-md',
                    isSystem && 'bg-zinc-800/50 text-zinc-400 italic'
                )}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>

                {/* Tool artifacts indicator */}
                {message.tool_artifacts && (
                    <div className="mt-1 flex gap-1">
                        {(message.tool_artifacts as { tool_calls?: Array<{ tool: string }> }).tool_calls?.map((tc, i) => (
                            <Badge key={i} variant="outline" className="text-xs border-amber-600 text-amber-500">
                                🔧 {tc.tool}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
