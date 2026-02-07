'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Key, Palette, Bell, Shield } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiKeysSection } from '@/components/settings/api-keys-section';

type SettingsSection = 'api-keys' | 'appearance' | 'notifications' | 'privacy' | null;

export default function SettingsPage() {
    const [activeSection, setActiveSection] = useState<SettingsSection>('api-keys');

    const settingSections = [
        {
            id: 'api-keys' as const,
            icon: Key,
            title: 'API Keys',
            description: 'Configure your LLM provider API keys',
            color: 'text-amber-400',
            enabled: true,
        },
        {
            id: 'appearance' as const,
            icon: Palette,
            title: 'Appearance',
            description: 'Theme and display preferences',
            color: 'text-purple-400',
            enabled: false,
        },
        {
            id: 'notifications' as const,
            icon: Bell,
            title: 'Notifications',
            description: 'Manage notification settings',
            color: 'text-blue-400',
            enabled: false,
        },
        {
            id: 'privacy' as const,
            icon: Shield,
            title: 'Privacy',
            description: 'Data and security settings',
            color: 'text-emerald-400',
            enabled: false,
        },
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
                <div className="flex gap-8">
                    {/* Sidebar Navigation */}
                    <div className="w-64 flex-shrink-0">
                        <nav className="space-y-1">
                            {settingSections.map((section) => (
                                <button
                                    key={section.id}
                                    onClick={() => section.enabled && setActiveSection(section.id)}
                                    disabled={!section.enabled}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left ${activeSection === section.id
                                            ? 'bg-zinc-800 text-white'
                                            : section.enabled
                                                ? 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
                                                : 'text-zinc-600 cursor-not-allowed'
                                        }`}
                                >
                                    <div className={`w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center ${!section.enabled ? 'opacity-50' : ''
                                        }`}>
                                        <section.icon className={`w-4 h-4 ${section.color}`} />
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm">{section.title}</div>
                                        {!section.enabled && (
                                            <div className="text-xs text-zinc-600">Coming soon</div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 min-w-0">
                        {activeSection === 'api-keys' && <ApiKeysSection />}

                        {activeSection === 'appearance' && (
                            <ComingSoonSection title="Appearance" description="Theme and display customization options" />
                        )}

                        {activeSection === 'notifications' && (
                            <ComingSoonSection title="Notifications" description="Control how Sabha notifies you" />
                        )}

                        {activeSection === 'privacy' && (
                            <ComingSoonSection title="Privacy" description="Data and security preferences" />
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

function ComingSoonSection({ title, description }: { title: string; description: string }) {
    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                <p className="text-sm text-zinc-400">{description}</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-6 text-center">
                <p className="text-amber-400">
                    <strong>Coming Soon</strong>
                </p>
                <p className="text-sm text-zinc-400 mt-1">
                    This feature is under development and will be available in a future update.
                </p>
            </div>
        </div>
    );
}
