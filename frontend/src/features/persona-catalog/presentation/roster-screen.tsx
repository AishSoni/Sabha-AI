'use client';

/**
 * Roster screen shared by the operator roster and the demo workspace.
 *
 * The data source, navigation, and optional delete confirmation are injected.
 * The command flow is the one from the base app: list, create a copy with the
 * copied metadata and active prompt, then delete by id.
 */
import { useEffect, useRef, useState } from 'react';

import type { PersonaCatalogClient } from '../model/client';
import type { Persona } from '../model/types';
import { RosterList, type RosterHrefs, type RosterPersonaView } from './roster-list';

export interface RosterScreenProps {
    client: PersonaCatalogClient;
    hrefs: RosterHrefs;
    heading?: string;
    description?: string;
    highlightedPersonaId?: string;
    confirmDelete?: (persona: RosterPersonaView) => boolean;
    /** Optional stable identity for the participant mark. */
    markIdFor?: (persona: Persona) => string | undefined;
    /** Optional readable names for knowledge stacks assigned to personas. */
    stackLabels?: Record<string, string>;
}

function toView(
    persona: Persona,
    markIdFor?: (persona: Persona) => string | undefined,
    stackLabels?: Record<string, string>
): RosterPersonaView {
    return {
        id: persona.id,
        markId: markIdFor?.(persona),
        name: persona.name,
        subtitle: persona.subtitle,
        color: persona.color,
        activePrompt: persona.active_prompt,
        activePromptVersion: persona.active_prompt_version,
        stackIds: persona.stack_ids,
        stackLabels: persona.stack_ids?.map(
            (stackId) => stackLabels?.[stackId] ?? stackId
        ),
    };
}

export function RosterScreen({
    client,
    hrefs,
    heading,
    description,
    highlightedPersonaId,
    confirmDelete,
    markIdFor,
    stackLabels,
}: RosterScreenProps) {
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadToken, setReloadToken] = useState(0);
    const actionRef = useRef(false);

    useEffect(() => {
        let active = true;
        client
            .list()
            .then((response) => {
                if (active) setPersonas(response.personas);
            })
            .catch((err) => {
                if (active) setError(err instanceof Error ? err.message : 'Failed to load personas');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [client, reloadToken]);

    async function handleDuplicate(persona: RosterPersonaView) {
        if (actionRef.current) return;
        const source = personas.find((item) => item.id === persona.id);
        if (!source) return;
        try {
            actionRef.current = true;
            setError(null);
            const created = await client.create({
                name: `${source.name} (Copy)`,
                subtitle: source.subtitle || undefined,
                color: source.color,
                system_prompt: source.active_prompt || undefined,
            });
            setPersonas((current) => [created, ...current]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to duplicate persona');
        } finally {
            actionRef.current = false;
        }
    }

    async function handleDelete(personaId: string) {
        if (actionRef.current) return;
        const persona = personas.find((item) => item.id === personaId);
        if (persona && confirmDelete && !confirmDelete(toView(persona))) return;
        try {
            actionRef.current = true;
            setError(null);
            await client.delete(personaId);
            setPersonas((current) => current.filter((p) => p.id !== personaId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete persona');
        } finally {
            actionRef.current = false;
        }
    }

    return (
        <RosterList
            personas={personas.map((persona) =>
                toView(persona, markIdFor, stackLabels)
            )}
            loading={loading}
            error={error}
            hrefs={hrefs}
            heading={heading}
            description={description}
            highlightedPersonaId={highlightedPersonaId}
            onDuplicate={(persona) => void handleDuplicate(persona)}
            onDelete={(id) => void handleDelete(id)}
            onRetry={() => {
                setLoading(true);
                setError(null);
                setReloadToken((token) => token + 1);
            }}
        />
    );
}
