'use client';

import { use } from 'react';
import { DemoPersonaRoute } from './persona-route';

export default function DemoPersonaDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    return <DemoPersonaRoute personaId={id} />;
}
