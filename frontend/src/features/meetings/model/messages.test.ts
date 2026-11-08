import { describe, expect, it } from 'vitest';
import { upsertMessageById } from './messages';

describe('upsertMessageById', () => {
    it('replaces a message a GET already installed instead of duplicating it', () => {
        const cached = [{ id: 'message-1', content: 'Saved once' }];
        const response = { id: 'message-1', content: 'Saved once' };
        expect(upsertMessageById(cached, response)).toHaveLength(1);
    });

    it('appends a genuinely new canonical message', () => {
        const cached = [{ id: 'message-1', content: 'First' }];
        const response = { id: 'message-2', content: 'Second' };
        expect(upsertMessageById(cached, response)).toEqual([
            { id: 'message-1', content: 'First' },
            { id: 'message-2', content: 'Second' },
        ]);
    });
});
