import { Suspense } from 'react';

import { LoginScreen } from '@/features/access';

function LoginFallback() {
    return (
        <main id="main-content" className="flex min-h-screen items-center justify-center bg-canvas type-body text-ink-muted" tabIndex={-1}>
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
