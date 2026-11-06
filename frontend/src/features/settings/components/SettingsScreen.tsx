'use client';

/**
 * Settings screen (spec-10).
 *
 * The route renders this feature-owned screen; section navigation and the
 * provider section live here, not in the app tree. Server metadata and
 * credentials remain owned by the settings feature query/command layer.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Key, Palette, Bell, Shield } from 'lucide-react';
import { ApiKeysSection } from './ApiKeysSection';

type SettingsSection = 'api-keys' | 'appearance' | 'notifications' | 'privacy' | null;

const SETTING_SECTIONS = [
    {
        id: 'api-keys' as const,
        icon: Key,
        title: 'API Keys',
        description: 'Configure your LLM provider API keys',
        enabled: true,
    },
    {
        id: 'appearance' as const,
        icon: Palette,
        title: 'Appearance',
        description: 'Theme and display preferences',
        enabled: false,
    },
    {
        id: 'notifications' as const,
        icon: Bell,
        title: 'Notifications',
        description: 'Manage notification settings',
        enabled: false,
    },
    {
        id: 'privacy' as const,
        icon: Shield,
        title: 'Privacy',
        description: 'Data and security settings',
        enabled: false,
    },
];

export function SettingsScreen() {
    const [activeSection, setActiveSection] = useState<SettingsSection>('api-keys');

    return (
        <div className="min-h-screen bg-gradient-to-br from-canvas via-surface to-canvas text-ink">
            {/* Header */}
            <header className="sticky top-0 z-chrome border-b border-separator bg-canvas/80 backdrop-blur-sm">
                <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
                    <Link href="/" aria-label="Back to home" className="m-control text-ink-secondary hover:text-ink">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-ink">Settings</h1>
                        <p className="text-xs text-ink-muted">Configure your Sabha experience</p>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main id="main-content" className="max-w-6xl mx-auto px-6 py-8" tabIndex={-1}>
                <div className="flex flex-col gap-8 md:flex-row">
                    {/* Sidebar Navigation */}
                    <div className="w-full shrink-0 md:w-64">
                        <nav className="space-y-1">
                            {SETTING_SECTIONS.map((section) => (
                                <button
                                    key={section.id}
                                    type="button"
                                    onClick={() => section.enabled && setActiveSection(section.id)}
                                    disabled={!section.enabled}
                                    className={`m-control flex w-full items-center gap-3 rounded-control px-4 py-3 text-left ${
                                        activeSection === section.id
                                            ? 'bg-surface-selected text-ink'
                                            : section.enabled
                                              ? 'text-ink-secondary hover:bg-surface-raised hover:text-ink'
                                              : 'cursor-not-allowed text-ink-muted'
                                    }`}
                                >
                                    <div
                                        className={`flex size-8 items-center justify-center rounded-control bg-surface-raised ${
                                            !section.enabled ? 'opacity-50' : ''
                                        }`}
                                    >
                                        <section.icon className="size-4 text-ink-secondary" />
                                    </div>
                                    <div>
                                        <div className="type-control font-medium">{section.title}</div>
                                        {!section.enabled && (
                                            <div className="type-meta text-ink-muted">Coming soon</div>
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
                            <ComingSoonSection
                                title="Appearance"
                                description="Theme and display customization options"
                            />
                        )}

                        {activeSection === 'notifications' && (
                            <ComingSoonSection
                                title="Notifications"
                                description="Control how Sabha notifies you"
                            />
                        )}

                        {activeSection === 'privacy' && (
                            <ComingSoonSection
                                title="Privacy"
                                description="Data and security preferences"
                            />
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
                <h2 className="type-section-title">{title}</h2>
                <p className="type-body text-ink-secondary">{description}</p>
            </div>
            <div className="rounded-group border border-warning/40 bg-warning-soft p-6 text-center">
                <p className="type-item-title text-warning">Coming Soon</p>
                <p className="mt-1 type-body text-ink-secondary">
                    This feature is under development and will be available in a future update.
                </p>
            </div>
        </div>
    );
}
