'use client';

import { useState } from 'react';
import { useMeetingStore } from '@/stores/meetingStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Bot, FileText, Lock } from 'lucide-react';
import type { AIParticipant } from '@/lib/api';

// Mock knowledge files for now - will be replaced with real data from Qdrant
const MOCK_KNOWLEDGE_FILES: Record<string, Array<{ name: string; type: string }>> = {
    'investor': [
        { name: 'Q4_2025_Financial_Report.pdf', type: 'pdf' },
        { name: 'Market_Analysis_2026.xlsx', type: 'xlsx' },
    ],
    'cto': [
        { name: 'Architecture_Overview.md', type: 'md' },
        { name: 'Tech_Debt_Tracker.csv', type: 'csv' },
    ],
    'analyst': [
        { name: 'Competitor_Research.pdf', type: 'pdf' },
        { name: 'User_Survey_Results.xlsx', type: 'xlsx' },
    ],
};

export function RosterTab() {
    const { currentMeeting } = useMeetingStore();

    if (!currentMeeting) {
        return (
            <div className="flex items-center justify-center h-full text-zinc-500">
                No meeting selected
            </div>
        );
    }

    return (
        <ScrollArea className="h-full p-4">
            <div className="max-w-3xl mx-auto space-y-4">
                <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-1">AI Roster</h3>
                    <p className="text-sm text-zinc-400">
                        View the AI participants in this meeting. Each AI has their own personality, system prompt, and private knowledge stack.
                    </p>
                </div>

                {currentMeeting.participants.length === 0 ? (
                    <div className="text-center py-16 text-zinc-500">
                        <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <h3 className="text-lg font-medium text-zinc-400 mb-1">No Participants</h3>
                        <p className="text-sm">This meeting has no AI participants.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {currentMeeting.participants.map((participant) => (
                            <ParticipantDetailCard
                                key={participant.id}
                                participant={participant}
                            />
                        ))}
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}

interface ParticipantDetailCardProps {
    participant: AIParticipant;
}

function ParticipantDetailCard({ participant }: ParticipantDetailCardProps) {
    const [isPromptOpen, setIsPromptOpen] = useState(false);
    const [isKnowledgeOpen, setIsKnowledgeOpen] = useState(false);

    // Get mock files based on role (lowercase)
    const roleKey = participant.role.toLowerCase();
    const knowledgeFiles = MOCK_KNOWLEDGE_FILES[roleKey] || [];

    return (
        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
            {/* Header */}
            <div className="p-4 flex items-start gap-4">
                <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                    style={{ backgroundColor: participant.color }}
                >
                    {participant.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-white">{participant.name}</h4>
                        <Badge
                            variant="secondary"
                            className="text-xs capitalize"
                            style={{
                                backgroundColor: participant.color + '20',
                                color: participant.color,
                            }}
                        >
                            {participant.role}
                        </Badge>
                    </div>
                    <p className="text-xs text-zinc-500">
                        Model: {participant.provider_config?.model || 'Default'}
                    </p>
                </div>
            </div>

            {/* System Prompt Section */}
            <Collapsible open={isPromptOpen} onOpenChange={setIsPromptOpen}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="w-full justify-between px-4 py-2 h-auto text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-none border-t border-zinc-800"
                    >
                        <span className="flex items-center gap-2">
                            <Bot className="w-4 h-4" />
                            System Prompt
                        </span>
                        {isPromptOpen ? (
                            <ChevronUp className="w-4 h-4" />
                        ) : (
                            <ChevronDown className="w-4 h-4" />
                        )}
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="px-4 py-3 bg-zinc-950/50 border-t border-zinc-800">
                        <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                            {participant.system_prompt}
                        </pre>
                    </div>
                </CollapsibleContent>
            </Collapsible>

            {/* Private Knowledge Stack Section */}
            <Collapsible open={isKnowledgeOpen} onOpenChange={setIsKnowledgeOpen}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="w-full justify-between px-4 py-2 h-auto text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-none border-t border-zinc-800"
                    >
                        <span className="flex items-center gap-2">
                            <Lock className="w-4 h-4" />
                            Private Knowledge Stack
                            <Badge variant="secondary" className="text-xs bg-zinc-800 text-zinc-400">
                                {knowledgeFiles.length} files
                            </Badge>
                        </span>
                        {isKnowledgeOpen ? (
                            <ChevronUp className="w-4 h-4" />
                        ) : (
                            <ChevronDown className="w-4 h-4" />
                        )}
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="px-4 py-3 bg-zinc-950/50 border-t border-zinc-800">
                        {knowledgeFiles.length === 0 ? (
                            <p className="text-xs text-zinc-500 italic">
                                No private documents uploaded for this AI.
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {knowledgeFiles.map((file, idx) => (
                                    <li key={idx} className="flex items-center gap-2 text-sm">
                                        <FileText className="w-4 h-4 text-zinc-500" />
                                        <span className="text-zinc-300">{file.name}</span>
                                        <Badge variant="outline" className="text-xs text-zinc-500 border-zinc-700">
                                            {file.type.toUpperCase()}
                                        </Badge>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}
