'use client';

import { useDemoWorkspace } from '@/features/demo-workspace';
import { RosterScreen } from '../presentation/roster-screen';
import { DemoCatalogGate } from './demo-catalog-gate';
import { useLocalPersonaCatalog } from './use-local-persona-catalog';

export function DemoPersonaRoster() {
    return (
        <DemoCatalogGate>
            <Content />
        </DemoCatalogGate>
    );
}

function Content() {
    const { client } = useLocalPersonaCatalog();
    const { seed } = useDemoWorkspace();

    return (
        <RosterScreen
            client={client}
            highlightedPersonaId={seed?.highlightedPersonaId ?? undefined}
            hrefs={{
                home: '/demo',
                create: '/demo/roster/new',
                persona: (id) => `/demo/roster/${id}`,
            }}
            heading="Practice personas"
            description="Temporary templates for this browser tab. They never rename, replace, or rerun the prepared participants."
            confirmDelete={(persona) =>
                window.confirm(
                    `Delete ${persona.name} and its practice prompt history? Captured practice snapshots and the recorded participants are not affected.`
                )
            }
        />
    );
}
