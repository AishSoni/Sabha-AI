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
            heading="Personas"
            description="Temporary persona templates for this browser tab. They never rename, replace, or rerun the meeting participants."
            backLabel="Back to demo board"
            markIdFor={(persona) =>
                seed?.personas.find(
                    (template) => template.personaId === persona.id
                )?.recordedParticipantId ?? undefined
            }
            descriptionFor={(persona) =>
                seed?.personas.find(
                    (template) => template.personaId === persona.id
                )?.description
            }
            confirmDelete={(persona) =>
                window.confirm(
                    `Delete ${persona.name} and its prompt history? Captured participant snapshots and the meeting participants are not affected.`
                )
            }
        />
    );
}
