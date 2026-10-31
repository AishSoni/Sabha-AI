'use client';

/**
 * Live new-persona route wrapper (spec-06).
 *
 * The form body, templates, and request shape are the shared screen; this
 * module injects the live client, stack read, and operator navigation.
 */
import { useRouter } from 'next/navigation';

import { stackClient, type KnowledgeStack } from '@/features/knowledge';
import { personaClient } from '../api';
import { NewPersonaScreen } from '../presentation/new-persona-screen';
import type { PersonaStackOption } from '../model/types';

async function loadLiveStacks(): Promise<PersonaStackOption[]> {
    const response = await stackClient.list();
    return response.stacks.map((stack: KnowledgeStack) => ({
        id: stack.id,
        name: stack.name,
        description: stack.description,
    }));
}

export default function NewPersonaScreenRoute() {
    const router = useRouter();

    return (
        <NewPersonaScreen
            client={personaClient}
            loadStacks={loadLiveStacks}
            routes={{
                roster: '/roster',
                persona: (id) => `/roster/${id}`,
                afterCreate: () => router.push('/roster'),
                cancel: () => router.back(),
                stacks: '/knowledge-stacks/new',
            }}
        />
    );
}
