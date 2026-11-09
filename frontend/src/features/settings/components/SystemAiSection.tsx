'use client';

/**
 * System AI section (spec-38).
 *
 * The saved policy and its provenance are read-only server facts; editing is
 * the existing PUT command. Section visibility is independent of provider
 * credentials so a stored policy can still be inspected when a provider key is
 * missing.
 */
import { Cpu } from 'lucide-react';
import { SettingsMetadata } from './SettingsMetadata';
import { SystemAiCard } from './SystemAiCard';

export function SystemAiSection() {
    return (
        <section aria-labelledby="settings-system-ai-title" className="space-y-6">
            <div className="space-y-1">
                <h2 id="settings-system-ai-title" className="type-section-title">
                    System AI
                </h2>
                <p className="type-body text-ink-secondary">
                    The judge and summarizer used by Sabha when a participant does not choose
                    its own provider.
                </p>
            </div>

            <SettingsMetadata>
                {(metadata) => (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-ink">
                            <Cpu className="size-4" />
                            <span className="type-control font-medium">Effective policy</span>
                        </div>
                        <SystemAiCard
                            providers={metadata.providers}
                            systemAI={metadata.systemAI}
                            defaultProvider={metadata.environment.defaultProvider}
                        />
                    </div>
                )}
            </SettingsMetadata>
        </section>
    );
}
