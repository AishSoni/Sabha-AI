'use client';

import Link from 'next/link';
import { ArrowLeft, Settings, Key, Palette, Bell, Shield } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
    const settingSections = [
        { icon: Key, title: 'API Keys', description: 'Configure your LLM provider API keys', color: 'text-amber-400' },
        { icon: Palette, title: 'Appearance', description: 'Theme and display preferences', color: 'text-purple-400' },
        { icon: Bell, title: 'Notifications', description: 'Manage notification settings', color: 'text-blue-400' },
        { icon: Shield, title: 'Privacy', description: 'Data and security settings', color: 'text-emerald-400' },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
            {/* Header */}
            <header className="border-b border-zinc-800/50 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
                    <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-white">Settings</h1>
                        <p className="text-xs text-zinc-500">Configure your Sabha experience</p>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-6 py-8">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-8">
                    <p className="text-amber-400 text-sm">
                        <strong>Coming Soon:</strong> Full settings panel with API key management, theme customization, and more.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                    {settingSections.map((section, i) => (
                        <Card
                            key={i}
                            className="bg-zinc-900/50 border-zinc-800 opacity-60 cursor-not-allowed"
                        >
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                                        <section.icon className={`w-5 h-5 ${section.color}`} />
                                    </div>
                                    <div>
                                        <CardTitle className="text-white text-base">{section.title}</CardTitle>
                                        <CardDescription className="text-zinc-500 text-sm">
                                            {section.description}
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            </main>
        </div>
    );
}
