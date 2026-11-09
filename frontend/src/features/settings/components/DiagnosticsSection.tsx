'use client';

/**
 * Read-only capability diagnostics (spec-38).
 *
 * This section reports deployment prerequisites without probing providers or
 * storage. A configured value is never presented as a successful connection.
 */
import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { describeApiOrigin } from '@/shared/access';
import { useSettingsDiagnostics } from '../api';
import type {
    CapabilityDiagnosticView,
    CapabilityStateView,
    SettingsDiagnosticsView,
} from '../api';

const STATE_COPY: Record<
    CapabilityStateView,
    { label: string; tone: StatusTone }
> = {
    missing: { label: 'Missing', tone: 'danger' },
    disabled: { label: 'Disabled', tone: 'neutral' },
    unverified: { label: 'Unverified', tone: 'warning' },
    available: { label: 'Available', tone: 'success' },
    failed: { label: 'Failed', tone: 'danger' },
    unsupported: { label: 'Unsupported', tone: 'neutral' },
};

function CapabilityCard({
    title,
    state,
    detail,
    effect,
    remediation,
    meta,
}: {
    title: string;
    state: CapabilityStateView;
    detail: string;
    effect: string;
    remediation: string;
    meta?: ReactNode;
}) {
    const copy = STATE_COPY[state];
    return (
        <div className="rounded-group border border-separator bg-surface/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="type-item-title text-ink">{title}</h3>
                <StatusBadge tone={copy.tone}>{copy.label}</StatusBadge>
            </div>
            {meta ? <div className="mt-1 type-meta text-ink-muted">{meta}</div> : null}
            <p className="mt-3 type-body text-ink-secondary">{detail}</p>
            <p className="mt-2 type-body text-ink-secondary">
                <span className="font-medium text-ink">Effect:</span> {effect}
            </p>
            <p className="mt-2 type-body text-ink-secondary">
                <span className="font-medium text-ink">Next step:</span> {remediation}
            </p>
        </div>
    );
}

function CapabilityDetails({
    capability,
    title,
    meta,
}: {
    capability: CapabilityDiagnosticView;
    title: string;
    meta: string;
}) {
    return (
        <CapabilityCard
            title={title}
            state={capability.state}
            detail={capability.detail}
            effect={capability.effect}
            remediation={capability.remediation}
            meta={meta}
        />
    );
}

export function ApiOriginCard({
    pageOrigin,
}: {
    pageOrigin?: string | null;
}) {
    const resolvedPageOrigin =
        pageOrigin === undefined
            ? typeof window === 'undefined'
                ? null
                : window.location.origin
            : pageOrigin;
    const apiOrigin = describeApiOrigin(
        process.env.NEXT_PUBLIC_API_URL,
        resolvedPageOrigin,
    );
    const originReady = apiOrigin.issue === null;

    return (
        <div className="rounded-group border border-separator bg-surface/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="type-item-title text-ink">API origin</h3>
                {resolvedPageOrigin === null ? (
                    <StatusBadge tone="pending">Checking</StatusBadge>
                ) : (
                    <StatusBadge tone={originReady ? 'success' : 'danger'}>
                        {originReady ? 'Ready' : 'Misconfigured'}
                    </StatusBadge>
                )}
            </div>
            <p className="mt-3 type-body text-ink-secondary">
                {resolvedPageOrigin === null
                    ? 'Checking where this page would send live requests.'
                    : originReady
                      ? apiOrigin.source === 'configured'
                          ? 'Live requests use the API origin configured for this build.'
                          : 'Live requests use the local development default for this local page.'
                      : apiOrigin.detail}
            </p>
            {apiOrigin.issue ? (
                <p className="mt-2 type-body text-ink-secondary">
                    <span className="font-medium text-ink">Next step:</span>{' '}
                    {apiOrigin.remediation}
                </p>
            ) : null}
        </div>
    );
}

function DiagnosticsContent({ diagnostics }: { diagnostics: SettingsDiagnosticsView }) {
    return (
        <div className="space-y-4">
            <div className="rounded-group border border-separator bg-surface/40 p-4">
                <h3 className="type-item-title text-ink">Runtime</h3>
                <p className="mt-2 type-body text-ink-secondary">
                    Runtime mode: <span className="font-medium text-ink">{diagnostics.runtimeMode}</span>
                    {' · '}Environment:{' '}
                    <span className="font-medium text-ink">{diagnostics.appEnv}</span>
                </p>
                <p className="mt-2 type-meta text-ink-muted">
                    These diagnostics read deployment configuration. They do not contact
                    providers or storage and do not expose credentials.
                </p>
            </div>

            <h3 className="type-item-title text-ink">Model providers</h3>
            {diagnostics.providers.map((provider) => (
                <CapabilityCard
                    key={provider.id}
                    title={provider.name}
                    state={provider.state}
                    detail={provider.detail}
                    effect={provider.effect}
                    remediation={provider.remediation}
                    meta={
                        provider.credentialRequired
                            ? provider.serverCredentialConfigured
                                ? 'Server credential configured'
                                : 'Server credential missing'
                            : 'No server credential required'
                    }
                />
            ))}

            <h3 className="type-item-title text-ink">Knowledge</h3>
            <CapabilityDetails
                capability={diagnostics.embedding}
                title={`Embedding · ${diagnostics.embedding.provider}`}
                meta={`${diagnostics.embedding.model} · ${diagnostics.embedding.dimension} dimensions · ${
                    diagnostics.embedding.credentialRequired
                        ? diagnostics.embedding.serverCredentialConfigured
                            ? 'server credential configured'
                            : 'server credential missing'
                        : 'no server credential required'
                }`}
            />
            <CapabilityCard
                title="Knowledge storage"
                state={diagnostics.knowledge.state}
                detail={diagnostics.knowledge.detail}
                effect={diagnostics.knowledge.effect}
                remediation={diagnostics.knowledge.remediation}
                meta={`Qdrant ${diagnostics.knowledge.qdrantConfigured ? 'configured' : 'not configured'} · ${
                    diagnostics.knowledge.qdrantCredentialConfigured
                        ? 'credential present'
                        : 'no credential'
                } · bucket ${
                    diagnostics.knowledge.bucketConfigured ? 'configured' : 'not configured'
                }`}
            />

            <h3 className="type-item-title text-ink">Execution</h3>
            <CapabilityCard
                title="Turn execution"
                state={diagnostics.execution.state}
                detail={diagnostics.execution.detail}
                effect={diagnostics.execution.effect}
                remediation={diagnostics.execution.remediation}
                meta={`In-process runner ${
                    diagnostics.execution.inProcessRunner
                } · external worker cannot be established`}
            />
            <p className="type-meta text-ink-muted">
                {diagnostics.execution.livenessScope}
            </p>

            <h3 className="type-item-title text-ink">System AI</h3>
            <CapabilityDetails
                capability={{
                    state:
                        diagnostics.systemAI.state === 'available'
                            ? 'available'
                            : diagnostics.systemAI.state === 'missing'
                              ? 'missing'
                              : 'failed',
                    detail: diagnostics.systemAI.message,
                    effect:
                        diagnostics.systemAI.degraded
                            ? 'Environment defaults are being used until the saved policy can be read.'
                            : 'The effective System AI policy is shown in the System AI section.',
                    remediation:
                        diagnostics.systemAI.state === 'failed'
                            ? 'Check the settings database and reload diagnostics.'
                            : 'Open System AI to review or edit the effective policy.',
                }}
                title="System AI policy"
                meta={`Source: ${diagnostics.systemAI.source}`}
            />
        </div>
    );
}

export function DiagnosticsSection() {
    const diagnosticsQuery = useSettingsDiagnostics();

    return (
        <section aria-labelledby="settings-diagnostics-title" className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h2 id="settings-diagnostics-title" className="type-section-title">
                        Diagnostics
                    </h2>
                    <p className="type-body text-ink-secondary">
                        Read-only checks of deployment prerequisites. Nothing here contacts a
                        provider or changes settings.
                    </p>
                </div>
                <StatusBadge tone="neutral">Read-only</StatusBadge>
            </div>

            <ApiOriginCard />

            {diagnosticsQuery.isLoading ? (
                <div role="status" className="flex items-center justify-center gap-2 py-12 text-ink-muted">
                    <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
                    <span className="type-body">Loading diagnostics</span>
                </div>
            ) : diagnosticsQuery.error || !diagnosticsQuery.data ? (
                <div role="alert" className="rounded-group border border-danger/40 bg-danger-soft p-4">
                    <p className="type-body text-danger">Failed to load diagnostics</p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void diagnosticsQuery.refetch()}
                        className="mt-3"
                    >
                        Retry
                    </Button>
                </div>
            ) : (
                <DiagnosticsContent diagnostics={diagnosticsQuery.data} />
            )}
        </section>
    );
}
