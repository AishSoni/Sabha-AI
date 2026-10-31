'use client';

/**
 * Live persona-editor route wrapper (spec-06).
 *
 * The editor body is shared with the demo; this module only injects the live
 * client, stack read, and operator routes.
 */
import { use } from 'react';

import { stackClient, type KnowledgeStack } from '@/features/knowledge';
import { personaClient } from '../api';
import { PersonaEditorScreen } from '../presentation/persona-editor-screen';
import type { PersonaStackOption } from '../model/types';

const LIVE_ROUTES = { roster: '/roster' };

async function loadLiveStacks(): Promise<PersonaStackOption[]> {
    const response = await stackClient.list();
    return response.stacks.map((stack: KnowledgeStack) => ({
        id: stack.id,
        name: stack.name,
        description: stack.description,
    }));
}

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function PersonaDetailScreen({ params }: PageProps) {
    const { id } = use(params);
    return <PersonaDetailContent personaId={id} />;
}

export function PersonaDetailContent({ personaId }: { personaId: string }) {
    return (
        <PersonaEditorScreen
            personaId={personaId}
            client={personaClient}
            loadStacks={loadLiveStacks}
            routes={LIVE_ROUTES}
        />
    );
}
