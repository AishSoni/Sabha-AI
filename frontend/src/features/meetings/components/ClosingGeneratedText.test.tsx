import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { ClosingTextItem } from '../model/closing-text';
import { ClosingGeneratedText } from './ClosingGeneratedText';

function item(overrides: Partial<ClosingTextItem> = {}): ClosingTextItem {
    return {
        closingId: 'closing-1',
        itemId: 'ballot:investor',
        kind: 'ballot',
        sequence: 1,
        text: 'Half a thought',
        provisional: true,
        terminal: false,
        result: null,
        provenance: 'recorded-stream',
        subjectId: 'investor',
        ...overrides,
    };
}

describe('ClosingGeneratedText', () => {
    it('updates one node in place when canonical text replaces provisional text', () => {
        const { container, rerender } = render(
            <ClosingGeneratedText item={item()} className="reason" />
        );

        expect(container.querySelectorAll('[data-closing-item-id]')).toHaveLength(1);
        expect(
            container.querySelector('[data-closing-text-state="provisional"]')
        ).toHaveTextContent('Half a thought');

        rerender(
            <ClosingGeneratedText
                item={item({
                    sequence: 2,
                    text: 'Canonical reason',
                    provisional: false,
                    terminal: true,
                    result: 'yes',
                })}
                className="reason"
            />
        );

        expect(container.querySelectorAll('[data-closing-item-id]')).toHaveLength(1);
        expect(
            container.querySelector('[data-closing-text-state="terminal"]')
        ).toHaveTextContent('Canonical reason');
        expect(container.textContent).not.toContain('Half a thought');
    });

    it('renders nothing when no scoped item or text exists', () => {
        const { container, rerender } = render(
            <ClosingGeneratedText item={undefined} />
        );
        expect(container).toBeEmptyDOMElement();

        rerender(<ClosingGeneratedText item={item({ text: '' })} />);
        expect(container).toBeEmptyDOMElement();
    });
});
