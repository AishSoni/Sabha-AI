'use client';

/**
 * Settings screen (spec-10, spec-38).
 *
 * Section navigation owns only presentation. Server metadata, credentials,
 * appearance and diagnostics remain in their feature-owned sections; there
 * are no placeholder sections or "coming soon" controls.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Activity, Cpu, KeyRound, Palette, Plug } from 'lucide-react';
import { AppearanceSection } from './AppearanceSection';
import { CredentialsSection } from './CredentialsSection';
import { DiagnosticsSection } from './DiagnosticsSection';
import { ProvidersSection } from './ProvidersSection';
import { SystemAiSection } from './SystemAiSection';

type SettingsSection = 'providers' | 'system-ai' | 'credentials' | 'appearance' | 'diagnostics';

const SETTING_SECTIONS = [
    {
        id: 'providers' as const,
        icon: Plug,
        title: 'Providers',
        description: 'Models, defaults and connection tests',
    },
    {
        id: 'system-ai' as const,
        icon: Cpu,
        title: 'System AI',
        description: 'Saved policy and effective defaults',
    },
    {
        id: 'credentials' as const,
        icon: KeyRound,
        title: 'Credentials',
        description: 'Browser key vault',
    },
    {
        id: 'appearance' as const,
        icon: Palette,
        title: 'Appearance',
        description: 'System, light or dark',
    },
    {
        id: 'diagnostics' as const,
        icon: Activity,
        title: 'Diagnostics',
        description: 'Read-only prerequisite checks',
    },
];

export function SettingsScreen() {
    const [activeSection, setActiveSection] = useState<SettingsSection>('providers');

    return (
        <div className="min-h-full text-ink">
            <header className="material-chrome sticky top-0 z-chrome border-b border-separator">
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

            <main id="main-content" className="max-w-6xl mx-auto px-6 py-8" tabIndex={-1}>
                <div className="flex flex-col gap-8 md:flex-row">
                    <div className="w-full shrink-0 md:w-64">
                        <nav aria-label="Settings sections" className="space-y-1">
                            {SETTING_SECTIONS.map((section) => {
                                const selected = activeSection === section.id;
                                return (
                                    <button
                                        key={section.id}
                                        type="button"
                                        onClick={() => setActiveSection(section.id)}
                                        aria-current={selected ? 'page' : undefined}
                                        className={`m-control flex w-full items-center gap-3 rounded-control px-4 py-3 text-left ${
                                            selected
                                                ? 'bg-surface-selected text-ink'
                                                : 'text-ink-secondary hover:bg-surface-raised hover:text-ink'
                                        }`}
                                    >
                                        <div className="flex size-8 items-center justify-center rounded-control bg-surface-raised">
                                            <section.icon className="size-4 text-ink-secondary" />
                                        </div>
                                        <div>
                                            <div className="type-control font-medium">{section.title}</div>
                                            <div className="type-meta text-ink-muted">{section.description}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </nav>
                    </div>

                    <div className="flex-1 min-w-0">
                        {activeSection === 'providers' && <ProvidersSection />}
                        {activeSection === 'system-ai' && <SystemAiSection />}
                        {activeSection === 'credentials' && <CredentialsSection />}
                        {activeSection === 'appearance' && <AppearanceSection />}
                        {activeSection === 'diagnostics' && <DiagnosticsSection />}
                    </div>
                </div>
            </main>
        </div>
    );
}
