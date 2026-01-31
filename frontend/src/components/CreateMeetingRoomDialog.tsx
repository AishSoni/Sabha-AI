'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload, X, Bot, FileText } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { api } from '@/lib/api';

// Default AI roster - will be fetched from backend later
const DEFAULT_ROSTER = [
    { id: 'skeptic', name: 'The Skeptic', role: 'Devil\'s Advocate', color: '#ef4444', selected: true },
    { id: 'optimist', name: 'The Optimist', role: 'Opportunity Finder', color: '#22c55e', selected: true },
    { id: 'analyst', name: 'The Analyst', role: 'Data Expert', color: '#3b82f6', selected: true },
];

interface CreateMeetingRoomDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated?: () => void;
}

export function CreateMeetingRoomDialog({ open, onOpenChange, onCreated }: CreateMeetingRoomDialogProps) {
    const router = useRouter();
    const [isCreating, setIsCreating] = useState(false);

    // Form state
    const [agenda, setAgenda] = useState('');
    const [context, setContext] = useState('');
    const [roster, setRoster] = useState(DEFAULT_ROSTER);
    const [documents, setDocuments] = useState<File[]>([]);

    const handleRosterToggle = (id: string) => {
        setRoster(roster.map(p =>
            p.id === id ? { ...p, selected: !p.selected } : p
        ));
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setDocuments([...documents, ...Array.from(e.target.files)]);
        }
    };

    const removeDocument = (index: number) => {
        setDocuments(documents.filter((_, i) => i !== index));
    };

    const handleCreate = async () => {
        if (!agenda.trim()) return;

        setIsCreating(true);
        try {
            // Create meeting with agenda as name and context as agenda field
            // In the future, we'll pass selected roster and documents
            const meeting = await api.createMeeting(agenda.trim(), context.trim());

            // TODO: Upload documents and associate with meeting
            // TODO: Use custom roster selection instead of defaults

            setAgenda('');
            setContext('');
            setRoster(DEFAULT_ROSTER);
            setDocuments([]);
            onOpenChange(false);
            onCreated?.();

            // Navigate to the new meeting
            router.push(`/meetings/${meeting.id}`);
        } catch (err) {
            console.error('Failed to create meeting:', err);
        } finally {
            setIsCreating(false);
        }
    };

    const selectedCount = roster.filter(p => p.selected).length;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-white text-xl">Create Meeting Room</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Set up a new AI advisory session
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Meeting Agenda (Title) */}
                    <div className="space-y-2">
                        <Label htmlFor="agenda" className="text-white">
                            Meeting Agenda <span className="text-red-400">*</span>
                        </Label>
                        <Input
                            id="agenda"
                            placeholder="e.g., Product launch strategy for Q2"
                            value={agenda}
                            onChange={(e) => setAgenda(e.target.value)}
                            className="bg-zinc-800 border-zinc-700 text-white"
                        />
                        <p className="text-xs text-zinc-500">
                            A concise title describing what this meeting is about
                        </p>
                    </div>

                    {/* Roster Selection */}
                    <div className="space-y-3">
                        <Label className="text-white">
                            AI Roster ({selectedCount} selected)
                        </Label>
                        <div className="grid gap-2">
                            {roster.map((persona) => (
                                <div
                                    key={persona.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${persona.selected
                                            ? 'bg-zinc-800 border-zinc-600'
                                            : 'bg-zinc-900 border-zinc-800 opacity-60'
                                        }`}
                                    onClick={() => handleRosterToggle(persona.id)}
                                >
                                    <Checkbox
                                        checked={persona.selected}
                                        onCheckedChange={() => handleRosterToggle(persona.id)}
                                        className="border-zinc-600"
                                    />
                                    <div
                                        className="w-8 h-8 rounded-full flex items-center justify-center"
                                        style={{ backgroundColor: persona.color }}
                                    >
                                        <Bot className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-white">{persona.name}</p>
                                        <p className="text-xs text-zinc-500">{persona.role}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-zinc-500">
                            Select which AI advisors should participate in this meeting
                        </p>
                    </div>

                    {/* Meeting Context */}
                    <div className="space-y-2">
                        <Label htmlFor="context" className="text-white">
                            Meeting Context
                        </Label>
                        <Textarea
                            id="context"
                            placeholder="Provide additional context, background information, constraints, or specific questions you want addressed..."
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            className="bg-zinc-800 border-zinc-700 text-white min-h-[100px]"
                        />
                        <p className="text-xs text-zinc-500">
                            Extra details to help the AI advisors understand the situation
                        </p>
                    </div>

                    {/* Shared Documents */}
                    <div className="space-y-3">
                        <Label className="text-white">
                            Shared Documents
                        </Label>
                        <div className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center hover:border-zinc-600 transition-colors">
                            <input
                                type="file"
                                multiple
                                onChange={handleFileSelect}
                                className="hidden"
                                id="file-upload"
                                accept=".pdf,.doc,.docx,.txt,.md"
                            />
                            <label htmlFor="file-upload" className="cursor-pointer">
                                <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                                <p className="text-sm text-zinc-400">
                                    Click to upload documents
                                </p>
                                <p className="text-xs text-zinc-600 mt-1">
                                    PDF, DOC, TXT, MD (Coming soon)
                                </p>
                            </label>
                        </div>

                        {documents.length > 0 && (
                            <div className="space-y-2">
                                {documents.map((file, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-2 p-2 bg-zinc-800 rounded-lg"
                                    >
                                        <FileText className="w-4 h-4 text-zinc-500" />
                                        <span className="text-sm text-zinc-300 flex-1 truncate">
                                            {file.name}
                                        </span>
                                        <button
                                            onClick={() => removeDocument(i)}
                                            className="text-zinc-500 hover:text-red-400"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="text-xs text-zinc-500">
                            Documents will be available for RAG search by all AI advisors
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="text-zinc-400"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={!agenda.trim() || isCreating || selectedCount === 0}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        {isCreating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            'Create Meeting Room'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
