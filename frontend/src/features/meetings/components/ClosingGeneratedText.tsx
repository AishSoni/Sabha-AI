import type { ClosingTextItem } from '../model/closing-text';

export interface ClosingGeneratedTextProps {
    item: ClosingTextItem | null | undefined;
    className?: string;
}

/**
 * Render one scoped closing text item. React updates this same node when the
 * canonical item replaces its provisional text; the panel never renders the
 * snapshot and the streamed item as separate copies.
 */
export function ClosingGeneratedText({
    item,
    className,
}: ClosingGeneratedTextProps) {
    if (!item || !item.text) return null;

    return (
        <p
            className={className}
            data-closing-id={item.closingId}
            data-closing-item-id={item.itemId}
            data-closing-text-provenance={item.provenance}
            data-closing-text-state={item.terminal ? 'terminal' : 'provisional'}
        >
            {item.text}
        </p>
    );
}
