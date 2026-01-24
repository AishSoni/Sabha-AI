'use client';

import { useMeetingStore } from '@/stores/meetingStore';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { User, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn, formatCost } from '@/lib/utils';
import type { AIParticipant } from '@/lib/api';

export function RightPanel() {
    const { currentMeeting, disagreements, consensusList, activeTurnParticipantId } = useMeetingStore();

    if (!currentMeeting) {
        return (
            <div className="w-72 h-full bg-zinc-900 border-l border-zinc-800 flex items-center justify-center">
                <p className="text-zinc-500 text-sm">Select a meeting</p>
            </div>
        );
    }

    const activeParticipant = currentMeeting.participants.find(
        p => p.id === activeTurnParticipantId
    );

    return (
        <div className="w-72 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-zinc-800">
                <h2 className="font-semibold text-white">
                    {activeParticipant ? 'Thinking...' : 'Roster Overview'}
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                    {activeParticipant ? activeParticipant.name : `${currentMeeting.participants.length} participants`}
                </p>
            </div>

            <ScrollArea className="flex-1 p-3">
                {/* Active participant thinking indicator */}
                {activeParticipant && (
                    <Card className="bg-zinc-800/50 border-zinc-700 p-4 mb-4">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                                style={{ backgroundColor: activeParticipant.color }}
                            >
                                {activeParticipant.name.charAt(0)}
                            </div>
                            <div>
                                <p className="font-medium text-white">{activeParticipant.name}</p>
                                <div className="flex items-center gap-1 text-amber-400 text-xs">
                                    <Zap className="w-3 h-3 animate-pulse" />
                                    <span>Formulating response...</span>
                                </div>
                            </div>
                        </div>
                    </Card>
                )}

                {/* Participants Grid */}
                {!activeParticipant && (
                    <div className="space-y-3 mb-6">
                        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            Participants
                        </h3>
                        {currentMeeting.participants.map((participant) => (
                            <ParticipantCard key={participant.id} participant={participant} />
                        ))}
                    </div>
                )}

                <Separator className="bg-zinc-800 my-4" />

                {/* Stats Overview */}
                <div className="space-y-4">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Meeting Stats
                    </h3>

                    {/* Disagreements */}
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-zinc-400">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                            Disagreements
                        </span>
                        <Badge variant="secondary" className="bg-red-900/30 text-red-400">
                            {disagreements.length}
                        </Badge>
                    </div>

                    {/* Consensus */}
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-zinc-400">
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                            Agreements
                        </span>
                        <Badge variant="secondary" className="bg-green-900/30 text-green-400">
                            {consensusList.length}
                        </Badge>
                    </div>

                    {/* Cost */}
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-zinc-400">
                            <Zap className="w-4 h-4 text-amber-400" />
                            Total Cost
                        </span>
                        <Badge variant="secondary" className="bg-amber-900/30 text-amber-400">
                            {formatCost(currentMeeting.total_cost)}
                        </Badge>
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}

function ParticipantCard({ participant }: { participant: AIParticipant }) {
    return (
        <Card className="bg-zinc-800/30 border-zinc-700/50 p-3">
            <div className="flex items-center gap-3">
                <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: participant.color }}
                >
                    {participant.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm truncate">{participant.name}</p>
                    <p className="text-xs text-zinc-500 capitalize">{participant.role}</p>
                </div>
            </div>
        </Card>
    );
}
