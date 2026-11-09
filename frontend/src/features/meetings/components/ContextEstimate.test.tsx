// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ContextStats } from '../api/decoders';
import { ContextEstimate } from './ContextEstimate';

const highStats: ContextStats = {
    current_tokens: 121_600,
    max_tokens: 128_000,
    usage_percent: 95,
    message_tokens: 96_000,
    system_tokens: 20_000,
    agenda_tokens: 5_600,
    message_count: 42,
    participant_count: 5,
};

describe('ContextEstimate', () => {
    it('names the saved-text scope instead of implying a model capacity warning', () => {
        render(<ContextEstimate stats={highStats} />);

        expect(
            screen.getByRole('heading', { name: 'Saved-text token estimate' })
        ).toBeInTheDocument();
        const estimate = screen.getByText(
            (_, element) =>
                element?.tagName === 'P' &&
                element.textContent?.startsWith('≈') === true &&
                element.textContent.includes('tokens')
        );
        expect(estimate.textContent).toContain(
            (121_600).toLocaleString()
        );
        expect(
            screen.getByText(/not model context usage or a context-window capacity/)
        ).toBeInTheDocument();
        const counts = screen.getByText(
            (_, element) =>
                element?.tagName === 'P' &&
                element.textContent?.includes('messages ·') === true &&
                element.textContent.includes('participants')
        );
        expect(counts.textContent).toContain('42 messages');
        expect(counts.textContent).toContain('5 participants');
        expect(counts.textContent).toContain(
            `Messages ${(96_000).toLocaleString()}`
        );
        expect(counts.textContent).toContain(
            `Prompts ${(20_000).toLocaleString()}`
        );
        expect(counts.textContent).toContain(
            `Agenda ${(5_600).toLocaleString()}`
        );

        // A high percentage of the endpoint's fixed denominator is not a
        // capacity warning and must not be presented as one.
        expect(
            screen.queryByRole('heading', { name: 'Context usage' })
        ).toBeNull();
        expect(
            screen.queryByText((128_000).toLocaleString())
        ).toBeNull();
        expect(screen.queryByText(/%/)).toBeNull();
    });

    it('keeps counts useful when the breakdown is unavailable', () => {
        render(
            <ContextEstimate
                stats={{
                    current_tokens: 900,
                    max_tokens: 128_000,
                    usage_percent: 0.7,
                    message_count: 3,
                    participant_count: 2,
                }}
            />
        );

        const estimate = screen.getByText(
            (_, element) =>
                element?.tagName === 'P' &&
                element.textContent?.startsWith('≈') === true &&
                element.textContent.includes('tokens')
        );
        expect(estimate.textContent).toContain((900).toLocaleString());
        const counts = screen.getByText(
            (_, element) =>
                element?.tagName === 'P' &&
                element.textContent?.includes('messages ·') === true &&
                element.textContent.includes('participants')
        );
        expect(counts.textContent).toContain('3 messages');
        expect(counts.textContent).toContain('2 participants');
        expect(counts.textContent).not.toContain('Messages');
    });
});
