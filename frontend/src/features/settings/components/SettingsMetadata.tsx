'use client';

/**
 * Shared metadata boundary for settings sections.
 *
 * Server provider metadata is read through TanStack Query and hydrated into
 * the local preference store whenever a fetch succeeds. Loading and recovery
 * stay identical across the sections that depend on it.
 */
import { useEffect, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProvidersEnvironment } from '../api';
import type { ProvidersEnvironment } from '../api';
import { useSettingsStore } from '../state/settings-store';

export function SettingsMetadata({
    children,
}: {
    children: (metadata: ProvidersEnvironment) => ReactNode;
}) {
    const providersQuery = useProvidersEnvironment();
    const initializeFromServer = useSettingsStore(
        (state) => state.initializeFromServer
    );
    const metadata = providersQuery.data;

    useEffect(() => {
        if (!metadata) {
            return;
        }
        initializeFromServer({
            isProduction: metadata.environment.isProduction,
            configuredProviders: metadata.environment.configuredProviders,
            defaultProvider: metadata.environment.defaultProvider,
            defaultModels: metadata.environment.defaultModels,
        });
    }, [metadata, initializeFromServer]);

    if (providersQuery.isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-ink-muted motion-reduce:animate-none" />
            </div>
        );
    }

    if (providersQuery.error || !metadata) {
        return (
            <div role="alert" className="rounded-group border border-danger/40 bg-danger-soft p-4">
                <p className="type-body text-danger">Failed to load providers</p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void providersQuery.refetch()}
                    className="mt-3"
                >
                    Retry
                </Button>
            </div>
        );
    }

    return <>{children(metadata)}</>;
}
