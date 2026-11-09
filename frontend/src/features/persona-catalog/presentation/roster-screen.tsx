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
    backLabel?: string;
    highlightedPersonaId?: string;
    confirmDelete?: (persona: RosterPersonaView) => boolean;
    /** Optional stable identity for the participant mark. */
    markIdFor?: (persona: Persona) => string | undefined;
    /** Optional purpose summary supplied by the demo workspace. */
    descriptionFor?: (persona: Persona) => string | undefined;
}

function toView(
    persona: Persona,
    markIdFor?: (persona: Persona) => string | undefined,
    descriptionFor?: (persona: Persona) => string | undefined
): RosterPersonaView {
    return {
        id: persona.id,
        markId: markIdFor?.(persona),
        name: persona.name,
        subtitle: persona.subtitle,
        description: descriptionFor?.(persona),
        color: persona.color,
        activePromptVersion: persona.active_prompt_version,
    };
}

export function RosterScreen({
    client,
    hrefs,
    heading,
    description,
    backLabel,
    highlightedPersonaId,
    confirmDelete,
    markIdFor,
    descriptionFor,
}: RosterScreenProps) {
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
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
    }, [client]);

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
        if (
            persona &&
            confirmDelete &&
            !confirmDelete(toView(persona, markIdFor, descriptionFor))
        )
            return;
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
                toView(persona, markIdFor, descriptionFor)
            )}
            loading={loading}
            error={error}
            hrefs={hrefs}
            heading={heading}
            description={description}
            backLabel={backLabel}
            highlightedPersonaId={highlightedPersonaId}
            onDuplicate={(persona) => void handleDuplicate(persona)}
            onDelete={(id) => void handleDelete(id)}
        />
    );
}
