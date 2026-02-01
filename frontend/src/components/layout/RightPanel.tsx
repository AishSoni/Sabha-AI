'use client';

import { useMeetingStore } from '@/stores/meetingStore';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Zap, AlertTriangle, CheckCircle2, Gauge, Shrink } from 'lucide-react';
import { formatCost } from '@/lib/utils';
import type { AIParticipant } from '@/lib/api';

export function RightPanel() {
    const { currentMeeting, disagreements, consensusList, activeTurnParticipantId, contextStats } = useMeetingStore();

    if (!currentMeeting) {
        return (
            <div className="w-64 bg-zinc-900 border-l border-zinc-800 flex items-center justify-center shrink-0">
                <p className="text-zinc-500 text-sm">Select a meeting</p>
            </div>
        );
    }

    const activeParticipant = currentMeeting.participants.find(
        p => p.id === activeTurnParticipantId
    );

    return (
        <div className="w-64 bg-zinc-900 border-l border-zinc-800 flex flex-col shrink-0">
            {/* Header */}
            <div className="p-4 border-b border-zinc-800 shrink-0">
                <h2 className="font-semibold text-white text-sm">AI Roster</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                    {currentMeeting.participants.length} participants
                </p>
            </div>

            <ScrollArea className="flex-1 p-3">
                {/* Active participant thinking indicator */}
                {activeParticipant && (
                    <Card className="bg-zinc-800/50 border-zinc-700 p-3 mb-4">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold animate-pulse"
                                style={{ backgroundColor: activeParticipant.color }}
                            >
                                {activeParticipant.name.charAt(0)}
                            </div>
                            <div>
                                <p className="font-medium text-white text-sm">{activeParticipant.name}</p>
                                <div className="flex items-center gap-1 text-amber-400 text-xs">
                                    <Zap className="w-3 h-3 animate-pulse" />
                                    <span>Thinking...</span>
                                </div>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Participants List */}
                <div className="space-y-2">
                    {currentMeeting.participants.map((participant) => (
                        <ParticipantCard
                            key={participant.id}
                            participant={participant}
                            isActive={participant.id === activeTurnParticipantId}
                        />
                    ))}
                </div>

                <Separator className="bg-zinc-800 my-4" />

                {/* Meeting Stats */}
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        Stats
                    </h3>

                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-zinc-400">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                            Debates
                        </span>
                        <Badge variant="secondary" className="bg-red-900/30 text-red-400">
                            {disagreements.length}
                        </Badge>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-zinc-400">
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                            Agreed
                        </span>
                        <Badge variant="secondary" className="bg-green-900/30 text-green-400">
                            {consensusList.length}
                        </Badge>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-zinc-400">
                            <Zap className="w-4 h-4 text-amber-400" />
                            Cost
                        </span>
                        <Badge variant="secondary" className="bg-amber-900/30 text-amber-400">
                            {formatCost(currentMeeting.total_cost)}
                        </Badge>
                    </div>
                </div>
            </ScrollArea>

            {/* Context Usage - Fixed at bottom */}
            <div className="p-3 border-t border-zinc-800 shrink-0">
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                        <Gauge className="w-3 h-3" />
                        Context Usage
                    </h3>

                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-400">Token Usage</span>
                            <span className="text-zinc-300 font-medium">
                                {contextStats ? `${contextStats.usage_percent}%` : '—'}
                            </span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${contextStats && contextStats.usage_percent > 80
                                        ? 'bg-gradient-to-r from-red-500 to-orange-500'
                                        : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                                    }`}
                                style={{ width: contextStats ? `${Math.min(contextStats.usage_percent, 100)}%` : '0%' }}
                            />
                        </div>
                        <p className="text-[10px] text-zinc-500">
                            {contextStats
                                ? `~${Math.round(contextStats.current_tokens / 1000)}k / ${Math.round(contextStats.max_tokens / 1000)}k tokens`
                                : 'Loading...'
                            }
                        </p>
                    </div>

                    {/* Compress Button */}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full border-zinc-700 text-zinc-400 hover:text-white"
                                    disabled
                                >
                                    <Shrink className="w-4 h-4 mr-2" />
                                    Compress Context
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                <p>Coming soon - Compress conversation history</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>
        </div>
    );
}

interface ParticipantCardProps {
    participant: AIParticipant;
    isActive?: boolean;
}

function ParticipantCard({ participant, isActive }: ParticipantCardProps) {
    return (
        <Card className={`bg-zinc-800/30 border-zinc-700/50 p-2.5 ${isActive ? 'ring-1 ring-amber-500/50' : ''}`}>
            <div className="flex items-center gap-2.5">
                <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs ${isActive ? 'animate-pulse' : ''}`}
                    style={{ backgroundColor: participant.color }}
                >
                    {participant.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-xs truncate">{participant.name}</p>
                    <p className="text-[10px] text-zinc-500 capitalize truncate">{participant.role}</p>
                </div>
            </div>
        </Card>
    );
}
