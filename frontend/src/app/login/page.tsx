import { Suspense } from 'react';

import { LoginScreen } from '@/features/access';

function LoginFallback() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-400">
            Loading operator sign-in…
        </main>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<LoginFallback />}>
            <LoginScreen />
        </Suspense>
    );
}
