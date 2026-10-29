import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThinkingBlock } from './ThinkingBlock';

describe('ThinkingBlock', () => {
    it('labels prepared replay reasoning', () => {
        render(
            <ThinkingBlock
                content="Check the record before answering."
                isStreaming={false}
                provenance="Prepared reasoning"
            />
        );

        expect(screen.getByText('Prepared reasoning')).toBeInTheDocument();
    });

    it('omits provenance when the caller does not supply it', () => {
        render(<ThinkingBlock content="Live reasoning" isStreaming={false} />);

        expect(screen.queryByText('Prepared reasoning')).not.toBeInTheDocument();
    });

    it('expands a persisted block on demand', () => {
        render(<ThinkingBlock content="Hidden until opened" isStreaming={false} />);

        expect(screen.queryByText('Hidden until opened')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /thinking/i }));
        expect(screen.getByText('Hidden until opened')).toBeInTheDocument();
    });
});
