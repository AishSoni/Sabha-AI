'use client';

/**
 * Roster list screen (spec-06).
 *
 * Reads and mutations ride the live feature client; the presentation is the
 * shared `RosterList` that the demo adapter can reuse without live access.
 */

import { useEffect, useState } from 'react';

import { personaClient, type Persona } from '../api';
import { RosterList, type RosterPersonaView } from '../presentation/roster-list';

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

export default function RosterScreen() {
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadPersonas();
    }, []);

    async function loadPersonas() {
        try {
            setLoading(true);
            const response = await personaClient.list();
            setPersonas(response.personas);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load personas');
        } finally {
            setLoading(false);
        }
    }

    async function handleDuplicate(persona: RosterPersonaView) {
        const source = personas.find((item) => item.id === persona.id);
        if (!source) return;
        try {
            const created = await personaClient.create({
                name: `${source.name} (Copy)`,
                subtitle: source.subtitle || undefined,
                color: source.color,
                system_prompt: source.active_prompt || undefined,
            });
            setPersonas([created, ...personas]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to duplicate persona');
        }
    }

    async function handleDelete(personaId: string) {
        try {
            await personaClient.delete(personaId);
            setPersonas(personas.filter((p) => p.id !== personaId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete persona');
        }
    }

    return (
        <RosterList
            personas={personas.map(toView)}
            loading={loading}
            error={error}
            hrefs={{
                home: '/',
                create: '/roster/new',
                persona: (id) => `/roster/${id}`,
            }}
            onDuplicate={(persona) => void handleDuplicate(persona)}
            onDelete={(id) => void handleDelete(id)}
        />
    );
}
