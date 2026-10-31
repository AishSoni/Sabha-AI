'use client';

/**
 * Roster screen shared by the operator roster and the demo workspace.
 *
 * The data source, navigation, and optional delete confirmation are injected.
 * The command flow is the one from the base app: list, create a copy with the
 * copied metadata and active prompt, then delete by id.
 */
import { useEffect, useState } from 'react';

import type { PersonaCatalogClient } from '../model/client';
import type { Persona } from '../model/types';
import { RosterList, type RosterHrefs, type RosterPersonaView } from './roster-list';

export interface RosterScreenProps {
    client: PersonaCatalogClient;
    hrefs: RosterHrefs;
    heading?: string;
    confirmDelete?: (persona: RosterPersonaView) => boolean;
}

function toView(persona: Persona): RosterPersonaView {
    return {
        id: persona.id,
        name: persona.name,
        subtitle: persona.subtitle,
        color: persona.color,
        activePrompt: persona.active_prompt,
        activePromptVersion: persona.active_prompt_version,
    };
}

export function RosterScreen({ client, hrefs, heading, confirmDelete }: RosterScreenProps) {
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        setLoading(true);
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
        const source = personas.find((item) => item.id === persona.id);
        if (!source) return;
        try {
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
        }
    }

    async function handleDelete(personaId: string) {
        const persona = personas.find((item) => item.id === personaId);
        if (persona && confirmDelete && !confirmDelete(toView(persona))) return;
        try {
            setError(null);
            await client.delete(personaId);
            setPersonas((current) => current.filter((p) => p.id !== personaId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete persona');
        }
    }

    return (
        <RosterList
            personas={personas.map(toView)}
            loading={loading}
            error={error}
            hrefs={hrefs}
            heading={heading}
            onDuplicate={(persona) => void handleDuplicate(persona)}
            onDelete={(id) => void handleDelete(id)}
        />
    );
}
