'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { NewPersonaScreen } from '../presentation/new-persona-screen';
import { DemoCatalogGate } from './demo-catalog-gate';
import { useLocalPersonaCatalog } from './use-local-persona-catalog';

export function DemoPersonaNew() {
    return (
        <DemoCatalogGate>
            <Content />
        </DemoCatalogGate>
    );
}

function Content() {
    const router = useRouter();
    const { client, stacks } = useLocalPersonaCatalog();
    const loadStacks = useCallback(async () => stacks, [stacks]);

    return (
        <NewPersonaScreen
            client={client}
            loadStacks={loadStacks}
            stacksHint="These defaults apply to new practice participant snapshots. They do not change the prepared board; document management arrives with the next demo chapter."
            routes={{
                roster: '/demo/roster',
                persona: (id) => `/demo/roster/${id}`,
                afterCreate: (id) => router.push(`/demo/roster/${id}`),
                cancel: () => router.back(),
            }}
        />
    );
}
