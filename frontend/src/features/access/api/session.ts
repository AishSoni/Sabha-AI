/**
 * Authoritative backend admission probe. Never returns workspace data.
 */
import { isApiError } from '@/shared/api/transport';
import { requestLiveJson } from '@/shared/access';

export type OperatorProbe =
    | { status: 'ready' }
    | { status: 'signed-out' }
    | { status: 'forbidden' }
    | { status: 'unavailable' };

export async function probeOperatorSession(): Promise<OperatorProbe> {
    try {
        await requestLiveJson<{ authorized: boolean }>('/access/session');
        return { status: 'ready' };
    } catch (error) {
        if (isApiError(error)) {
            if (error.status === 401) {
                return { status: 'signed-out' };
            }
            if (error.status === 403) {
                return { status: 'forbidden' };
            }
        }
        return { status: 'unavailable' };
    }
}
