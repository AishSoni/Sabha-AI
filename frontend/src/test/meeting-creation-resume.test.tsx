// @vitest-environment happy-dom
/**
 * Regression (spec-02 D'): meeting creation must be resumable.
 *
 * - the meeting row is created exactly once; upload retries never create
 *   duplicates;
 * - uploads run via Promise.allSettled with per-file status; late successes
 *   still reconcile;
 * - a retry re-uploads ONLY the files that did not succeed;
 * - navigation happens once, only after every file reached a terminal state;
 * - a creation failure is distinguishable from an upload failure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    createMeeting: vi.fn(),
    uploadDocument: vi.fn(),
    listPersonas: vi.fn(),
    push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mocks.push, back: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
    api: { createMeeting: mocks.createMeeting },
    personaApi: { listPersonas: mocks.listPersonas },
    documentsApi: { uploadDocument: mocks.uploadDocument },
}));

import NewMeetingPage from '../app/meetings/new/page';

const FILE_ONE = () => new File(['one'], 'market-scan.pdf', { type: 'application/pdf' });
const FILE_TWO = () => new File(['two'], 'unit-economics.xlsx', { type: 'application/vnd.ms-excel' });
const MEETING = { id: 'meeting-new-1', name: 'Pricing committee kickoff' };

/* eslint-disable no-inner-declarations */
// (removed duplicated disable comment during diagnostic cleanup)
async function seedValidForm() {
    // Seed the agenda first: the create button stays disabled until an agenda
    // and at least one selected persona are present.
    fireEvent.input(screen.getByLabelText(/Meeting Agenda/i), {
        target: { value: 'Pricing committee kickoff' },
    });
    fireEvent.click(screen.getByRole('button', { name: /select all/i }));
    await waitFor(() =>
        expect(screen.getByRole('button', { name: /create meeting room/i })).toBeEnabled()
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPersonas.mockResolvedValue({
        personas: [{ id: 'persona-1', name: 'The Investor', subtitle: null, color: '#38bdf8' }],
    });
});

describe('resumable meeting creation', () => {
    function seedFiles(files: File[]) {
        const input = document.querySelector('#file-upload') as HTMLInputElement;
        Object.defineProperty(input, 'files', { value: files, configurable: true });
        fireEvent.change(input);
    }

    it('create failure is distinguishable from upload failure and creates nothing twice', async () => {
        mocks.createMeeting.mockRejectedValueOnce(new Error('database unreachable'));
        const { container } = render(<NewMeetingPage />);
        await seedValidForm(); seedFiles([FILE_ONE()]);

        fireEvent.click(screen.getByRole('button', { name: 'Create Meeting Room' }));
        // Distinct creation-failure copy; no upload was ever attempted.
        await screen.findByText(/Failed to create the meeting/i);
        expect(mocks.uploadDocument).not.toHaveBeenCalled();
        expect(mocks.push).not.toHaveBeenCalled();

        // Recovering the creation attempt must not be possible by blind retry:
        // after fixing nothing further, a second click re-attempts creation.
        mocks.createMeeting.mockResolvedValueOnce(MEETING);
        mocks.uploadDocument.mockResolvedValue({ id: 'doc-1' });
        fireEvent.click(screen.getByRole('button', { name: 'Create Meeting Room' }));
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/meetings/meeting-new-1'));
        expect(mocks.createMeeting).toHaveBeenCalledTimes(2);
    });

    it('upload failures keep the meeting and retry only the failed files', async () => {
        mocks.createMeeting.mockResolvedValue(MEETING);
        const callLog: File[] = [];
        mocks.uploadDocument.mockImplementation(async (file: unknown) => {
            callLog.push(file as File);
            if (callLog.length === 2) throw new Error('storage down');
            return { id: 'doc' };
        });

        const { container } = render(<NewMeetingPage />);
        await seedValidForm(); seedFiles([FILE_ONE(), FILE_TWO()]);

        fireEvent.click(screen.getByRole('button', { name: 'Create Meeting Room' }));

        await screen.findByText(/storage down/i);
        expect(screen.getByText('market-scan.pdf').closest('div')?.textContent).toContain('Uploaded');
        expect(screen.getByText('unit-economics.xlsx').closest('div')?.textContent).toContain('Failed');
        // Upload failure does not navigate away and does not lose the meeting.
        expect(mocks.push).not.toHaveBeenCalled();

        // Retry uploads: only the failed file is attempted again.
        fireEvent.click(screen.getByRole('button', { name: /retry uploads/i }));
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/meetings/meeting-new-1'));
        expect(mocks.uploadDocument).toHaveBeenCalledTimes(3);
        expect(callLog.map(f => f.name)).toEqual(['market-scan.pdf', 'unit-economics.xlsx', 'unit-economics.xlsx']);
        // The meeting was created exactly once across both phases.
        expect(mocks.createMeeting).toHaveBeenCalledTimes(1);
        // Navigation happened exactly once.
        expect(mocks.push).toHaveBeenCalledTimes(1);
    });

    it('all-success run navigates once with every file uploaded', async () => {
        mocks.createMeeting.mockResolvedValue(MEETING);
        mocks.uploadDocument.mockResolvedValue({ id: 'doc' });

        render(<NewMeetingPage />);
        await seedValidForm(); seedFiles([FILE_ONE(), FILE_TWO()]);

        fireEvent.click(screen.getByRole('button', { name: 'Create Meeting Room' }));

        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/meetings/meeting-new-1'));
        expect(screen.getByText('market-scan.pdf').closest('div')?.textContent).toContain('Uploaded');
        expect(screen.getByText('unit-economics.xlsx').closest('div')?.textContent).toContain('Uploaded');
        expect(mocks.push).toHaveBeenCalledTimes(1);
    });
});


