'use client';

/**
 * Live roster route wrapper (spec-06).
 *
 * The screen itself is shared with the demo; this module only injects the
 * live client and operator routes.
 */
import { personaClient } from '../api';
import { RosterScreen as SharedRosterScreen } from '../presentation/roster-screen';

export default function RosterScreen() {
    return (
        <SharedRosterScreen
            client={personaClient}
            hrefs={{
                home: '/',
                create: '/roster/new',
                persona: (id) => `/roster/${id}`,
            }}
        />
    );
}
