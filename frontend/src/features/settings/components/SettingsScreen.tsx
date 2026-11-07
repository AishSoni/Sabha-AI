'use client';

/**
 * Settings screen (spec-10, spec-33).
 *
 * The route renders this feature-owned screen; section navigation and the
 * provider section live here, not in the app tree. Server metadata and
 * credentials remain owned by the settings feature query/command layer.
 */
import { useState } from 'react';
import { Key, Palette } from 'lucide-react';
import { AppearanceControl } from '@/components/appearance';
import { PageContainer, PageHeader } from '@/components/shell';
import { ApiKeysSection } from './ApiKeysSection';
import { VaultSection } from './VaultSection';

type SettingsSection = 'appearance' | 'providers';

const SETTING_SECTIONS = [
    {
        id: 'appearance' as const,
        icon: Palette,
        title: 'Appearance',
        description: 'Theme and display preferences',
    },
    {
        id: 'providers' as const,
        icon: Key,
        title: 'Providers & vault',
        description: 'Credentials and model providers',
    },
];

export function SettingsScreen() {
    const [activeSection, setActiveSection] =
        useState<SettingsSection>('appearance');

    return (
        <main id="main-content" tabIndex={-1}>
            <PageHeader
                title="Settings"
                description="Configure appearance, model providers, and the local credential vault."
                backHref="/meetings"
                backLabel="Back to meetings"
            />

            <PageContainer>
                <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
                    <nav
                        aria-label="Settings sections"
                        className="flex gap-1 overflow-x-auto lg:block lg:space-y-1"
                    >
                        {SETTING_SECTIONS.map((section) => (
                            <button
                                key={section.id}
                                type="button"
                                aria-current={
                                    activeSection === section.id
                                        ? 'page'
                                        : undefined
                                }
                                onClick={() =>
                                    setActiveSection(section.id)
                                }
                                className={`m-control flex min-h-11 shrink-0 items-center gap-3 rounded-control px-3 py-2 text-left lg:w-full ${
                                    activeSection === section.id
                                        ? 'bg-surface-selected text-ink'
                                        : 'text-ink-secondary hover:bg-surface-raised hover:text-ink'
                                }`}
                            >
                                <section.icon
                                    aria-hidden="true"
                                    className="size-4"
                                />
                                <span>
                                    <span className="block type-control font-medium">
                                        {section.title}
                                    </span>
                                    <span className="hidden type-meta text-ink-muted lg:block">
                                        {section.description}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </nav>

                    <div className="min-w-0 space-y-6">
                        {activeSection === 'appearance' ? (
                            <section className="material-raised rounded-group border border-separator p-5">
                                <AppearanceControl />
                            </section>
                        ) : (
                            <>
                                <VaultSection />
                                <ApiKeysSection />
                            </>
                        )}
                    </div>
                </div>
            </PageContainer>
        </main>
    );
}
