'use client';

import { useState } from 'react';
import { useMeetingStore } from '@/stores/meetingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { X, Sparkles } from 'lucide-react';

interface NewMeetingDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export function NewMeetingDialog({ isOpen, onClose }: NewMeetingDialogProps) {
    const [name, setName] = useState('');
    const [agenda, setAgenda] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { createMeeting } = useMeetingStore();

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsLoading(true);
        try {
            await createMeeting(name.trim(), agenda.trim());
            setName('');
            setAgenda('');
            onClose();
        } catch (error) {
            console.error('Failed to create meeting:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <Card className="w-full max-w-md bg-zinc-900 border-zinc-800 text-white">
                <CardHeader className="relative">
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 text-zinc-400 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <CardTitle>New Sabha</CardTitle>
                            <CardDescription className="text-zinc-400">
                                Start a new advisory board meeting
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="text-sm text-zinc-400 block mb-2">Meeting Name</label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Investment Decision: TechStartup"
                                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-sm text-zinc-400 block mb-2">Agenda (optional)</label>
                            <Input
                                value={agenda}
                                onChange={(e) => setAgenda(e.target.value)}
                                placeholder="What should the advisory board discuss?"
                                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                            />
                        </div>
                        <div className="pt-2">
                            <Button
                                type="submit"
                                disabled={!name.trim() || isLoading}
                                className="w-full bg-indigo-600 hover:bg-indigo-700"
                            >
                                {isLoading ? 'Creating...' : 'Create Meeting'}
                            </Button>
                        </div>
                        <p className="text-xs text-zinc-500 text-center">
                            Default roster: The Investor, The CTO, The Analyst
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
