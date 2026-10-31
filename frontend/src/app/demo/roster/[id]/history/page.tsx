'use client';

import { use } from 'react';
import { DemoPersonaDetail } from '@/features/persona-catalog/local';

export default function DemoPersonaHistoryPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    return <DemoPersonaDetail personaId={id} initialTab="prompt" />;
}
