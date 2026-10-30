// @vitest-environment happy-dom
/**
 * Page wiring for the create-meeting flow (spec-05).
 *
 * The resume invariants (create the row exactly once, re-upload only failed
 * files, navigate once) are pinned against the feature hook in
 * src/features/meetings/hooks/use-meeting-creation.test.tsx; this suite
 * pins that THIS screen drives those capabilities and surfaces their state.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
    pipeline: {
        isCreating: false,
        uploads: [] as Array<{ file: { name: string }; status: string; error: string | null }>,
        createdMeetingId: null as string | null,
        creationError: null as string | null,
        uploadError: null as string | null,
        navigationDone: false,
        stageFiles: vi.fn(),
        removeUpload: vi.fn(),
        createMeeting: vi.fn(),
        retryUploads: vi.fn(),
    },
    refetch: vi.fn(),
    // Stable view object: the seeding effect depends on `data` identity, so a
    // fresh literal per render would loop forever.
    personaView: {
        data: {
            personas: [{ id: 'persona-1', name: 'The Investor', subtitle: null, color: '#38bdf8' }],
            total: 1,
        } as unknown,
        isLoading: false,
        refetch: null as unknown as () => void,
    },
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/features/meetings', () => ({
    useMeetingCreation: () => mocks.pipeline,
}));

vi.mock('@/features/persona-catalog', () => ({
    usePersonaList: () => mocks.personaView,
}));

import NewMeetingPage from './page';

const FILE_ONE = () => new File(['one'], 'market-scan.pdf', { type: 'application/pdf' });

function resetPipeline() {
    mocks.pipeline.isCreating = false;
    mocks.pipeline.uploads = [];
    mocks.pipeline.createdMeetingId = null;
    mocks.pipeline.creationError = null;
    mocks.pipeline.uploadError = null;
    mocks.pipeline.navigationDone = false;
    mocks.pipeline.stageFiles.mockReset();
    mocks.pipeline.removeUpload.mockReset();
    mocks.pipeline.createMeeting.mockReset().mockResolvedValue(undefined);
    mocks.pipeline.retryUploads.mockReset().mockResolvedValue(undefined);
    mocks.refetch.mockReset();
    mocks.personaView.refetch = mocks.refetch;
}

/** The header link and the footer submit both read "Create Meeting Room"; the footer one is the action under test. */
function createButton() {
    const buttons = screen.getAllByRole('button', { name: /create meeting room/i });
    return buttons[buttons.length - 1]!;
}

beforeEach(resetPipeline);

describe('create flow page wiring', () => {
    it('renders the roster from the catalog and refreshes through the catalog query', async () => {
        render(<NewMeetingPage />);
        await screen.findByText('The Investor');
        expect(screen.getByText(/1 selected/i)).toBeTruthy();

        // All rows start selected, so the header toggle reads "Deselect All".
        fireEvent.click(screen.getByRole('button', { name: /deselect all/i }));
        expect(screen.getByText(/0 selected/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: /select all/i })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /select all/i }));
        expect(screen.getByText(/1 selected/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: /deselect all/i })).toBeTruthy();

        const refreshIcon = document.querySelector('svg.lucide-refresh-cw');
        expect(refreshIcon).not.toBeNull();
        fireEvent.click(refreshIcon!.closest('button')!);
        expect(mocks.refetch).toHaveBeenCalledTimes(1);
    });

    it('stages files and commands one creation through the feature hook', async () => {
        render(<NewMeetingPage />);
        await screen.findByText('The Investor');

        fireEvent.input(screen.getByLabelText(/Meeting Agenda/i), {
            target: { value: 'Pricing committee kickoff' },
        });
        await waitFor(() => expect(createButton()).toBeEnabled());

        const input = document.querySelector('#file-upload') as HTMLInputElement;
        Object.defineProperty(input, 'files', { value: [FILE_ONE()], configurable: true });
        fireEvent.change(input);
        expect(mocks.pipeline.stageFiles).toHaveBeenCalledWith(expect.anything());

        fireEvent.click(createButton());
        await waitFor(() =>
            expect(mocks.pipeline.createMeeting).toHaveBeenCalledWith({
                agenda: 'Pricing committee kickoff',
                context: '',
                personaIds: ['persona-1'],
            })
        );
    });

    it('surfaces creation and upload failures and retries uploads through the hook', async () => {
        mocks.pipeline.creationError = 'Failed to create the meeting: database unreachable';
        mocks.pipeline.uploadError = '1 of 2 files failed to upload. You can retry below; nothing was lost.';
        mocks.pipeline.createdMeetingId = 'meeting-new-1';
        mocks.pipeline.uploads = [
            { file: { name: 'market-scan.pdf' }, status: 'uploaded', error: null },
            { file: { name: 'unit-economics.xlsx' }, status: 'failed', error: 'storage down' },
        ];
        const { container } = render(<NewMeetingPage />);
        await screen.findByText('The Investor');

        const alerts = screen.getAllByRole('alert');
        expect(alerts.some((node) => node.textContent?.includes('Failed to create the meeting'))).toBe(true);
        expect(alerts.some((node) => node.textContent?.includes('1 of 2 files failed to upload'))).toBe(true);
        expect(screen.getByText('market-scan.pdf').closest('div')?.textContent).toContain('Uploaded');
        expect(screen.getByText('unit-economics.xlsx').closest('div')?.textContent).toContain('Failed');

        // The failed row keeps its remove affordance; the uploaded row does not.
        const removeButtons = container.querySelectorAll("button[class*='hover:text-red-400']");
        expect(removeButtons).toHaveLength(1);
        fireEvent.click(removeButtons[0]!);
        expect(mocks.pipeline.removeUpload).toHaveBeenCalledWith(1);

        fireEvent.click(screen.getByRole('button', { name: /retry uploads/i }));
        expect(mocks.pipeline.retryUploads).toHaveBeenCalledTimes(1);
    });

    it('disables creation while the pipeline is busy, then again after navigation', async () => {
        mocks.pipeline.isCreating = true;
        const view = render(<NewMeetingPage />);
        await screen.findByText('The Investor');
        // While busy the submit reads "Creating..." instead of its idle label.
        expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
        view.unmount();

        mocks.pipeline.isCreating = false;
        mocks.pipeline.navigationDone = true;
        render(<NewMeetingPage />);
        expect(createButton()).toBeDisabled();
    });
});
