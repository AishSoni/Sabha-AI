'use client';

import Link from 'next/link';
import { ArrowLeft, Users, Plus, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function RosterPage() {
    // Placeholder AI personas
    const placeholderPersonas = [
        { name: 'The Skeptic', role: 'Devil\'s Advocate', color: '#ef4444', description: 'Challenges assumptions and identifies weaknesses' },
        { name: 'The Optimist', role: 'Opportunity Finder', color: '#22c55e', description: 'Focuses on possibilities and positive outcomes' },
        { name: 'The Analyst', role: 'Data Expert', color: '#3b82f6', description: 'Breaks down complex problems systematically' },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            {/* Header */}
            <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-white">AI Roster</h1>
                            <p className="text-xs text-zinc-500">Manage your AI personas</p>
                        </div>
                    </div>
                    <Button className="bg-emerald-600 hover:bg-emerald-700" disabled>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Persona
                    </Button>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-6 py-8">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-8">
                    <p className="text-amber-400 text-sm">
                        <strong>Coming Soon:</strong> Create and customize your own AI personas with unique expertise, personality traits, and knowledge bases.
                    </p>
                </div>

                <h2 className="text-lg font-semibold text-white mb-4">Default Personas</h2>
                <p className="text-zinc-400 text-sm mb-6">
                    These personas are automatically available in all meeting rooms.
                </p>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {placeholderPersonas.map((persona, i) => (
                        <Card key={i} className="bg-zinc-900/50 border-zinc-800">
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center"
                                        style={{ backgroundColor: persona.color }}
                                    >
                                        <Bot className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-white text-base">{persona.name}</CardTitle>
                                        <CardDescription className="text-xs" style={{ color: persona.color }}>
                                            {persona.role}
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-zinc-500">{persona.description}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </main>
        </div>
    );
}
