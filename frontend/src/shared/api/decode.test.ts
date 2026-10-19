/**
 * Contract for the shared decode primitives (spec-05).
 *
 * Generated TypeScript types only pin shapes at compile time; the decoders pin
 * them at runtime so a drifting backend fails loudly at the transport boundary
 * instead of smuggling `undefined` into feature state. These primitives stay
 * shape-agnostic — concrete record decoders live with the feature that owns
 * the endpoint, mirroring the generated `components` shapes.
 */
import { describe, expect, it } from 'vitest';
import {
    DecodeError,
    decodeObject,
    optionalBoolean,
    optionalNumber,
    optionalString,
    requireArray,
    requireBoolean,
    requireNumber,
    requireString,
} from './decode';

describe('decodeObject', () => {
    it('accepts a plain object and rejects everything else', () => {
        expect(decodeObject({ id: 'm-1' }, 'meeting')).toEqual({ id: 'm-1' });

        expect(() => decodeObject(null, 'meeting')).toThrow(DecodeError);
        expect(() => decodeObject('nope', 'meeting')).toThrow(DecodeError);
        expect(() => decodeObject([1], 'meeting')).toThrow(DecodeError);
        expect(() => decodeObject(undefined, 'meeting')).toThrow('meeting: expected an object');
    });
});

describe('requireString', () => {
    it('accepts strings and rejects other types with a breadcrumb', () => {
        expect(requireString('m-1', 'meeting.id')).toBe('m-1');

        expect(() => requireString(42, 'meeting.id')).toThrow('meeting.id: expected a string');
        expect(() => requireString(null, 'meeting.id')).toThrow('meeting.id: expected a string');
    });
});

describe('optionalString', () => {
    it('maps null and missing keys to undefined and rejects wrong types', () => {
        expect(optionalString('hello', 'meeting.agenda')).toBe('hello');
        expect(optionalString(null, 'meeting.agenda')).toBeUndefined();
        expect(optionalString(undefined, 'meeting.agenda')).toBeUndefined();

        expect(() => optionalString(7, 'meeting.agenda')).toThrow(
            'meeting.agenda: expected a string'
        );
    });
});

describe('requireNumber', () => {
    it('accepts numbers and rejects other types', () => {
        expect(requireNumber(0.5, 'meeting.total_cost')).toBe(0.5);

        expect(() => requireNumber('0.5', 'meeting.total_cost')).toThrow('expected a number');
        expect(() => requireNumber(null, 'meeting.total_cost')).toThrow('expected a number');
    });
});

describe('optionalNumber', () => {
    it('maps null and missing keys to undefined and rejects wrong types', () => {
        expect(optionalNumber(3, 'message.estimated_cost')).toBe(3);
        expect(optionalNumber(null, 'message.estimated_cost')).toBeUndefined();
        expect(optionalNumber(undefined, 'message.estimated_cost')).toBeUndefined();

        expect(() => optionalNumber('3', 'message.estimated_cost')).toThrow('expected a number');
    });
});

describe('requireBoolean', () => {
    it('accepts booleans and rejects other types', () => {
        expect(requireBoolean(true, 'vote.vote')).toBe(true);
        expect(requireBoolean(false, 'vote.vote')).toBe(false);

        expect(() => requireBoolean('yes', 'vote.vote')).toThrow('expected a boolean');
        expect(() => requireBoolean(null, 'vote.vote')).toThrow('expected a boolean');
    });
});

describe('optionalBoolean', () => {
    it('maps null and missing keys to undefined and rejects wrong types', () => {
        expect(optionalBoolean(true, 'response.success')).toBe(true);
        expect(optionalBoolean(null, 'response.success')).toBeUndefined();
        expect(optionalBoolean(undefined, 'response.success')).toBeUndefined();

        expect(() => optionalBoolean(1, 'response.success')).toThrow('expected a boolean');
    });
});

describe('requireArray', () => {
    it('decodes each item through the given decoder', () => {
        const names = requireArray(
            ['alpha', 'beta'],
            'participants',
            (value, path) => requireString(value, path)
        );

        expect(names).toEqual(['alpha', 'beta']);
    });

    it('rejects non-arrays', () => {
        expect(() => requireArray({ length: 2 }, 'participants', requireString)).toThrow(
            'participants: expected an array'
        );
    });

    it('reports the failing item index in the breadcrumb', () => {
        expect(() =>
            requireArray(
                ['alpha', 3],
                'participants',
                (value, path) => requireString(value, path)
            )
        ).toThrow('participants[1]: expected a string');
    });
});

describe('DecodeError', () => {
    it('is a plain runtime error', () => {
        const error = new DecodeError('bad');
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('DecodeError');
        expect(error.message).toBe('bad');
    });
});

describe('composed record decoding', () => {
    it('decodes nested records with accumulated breadcrumbs', () => {
        const record: Record<string, unknown> = {
            id: 'm-1',
            name: 'Budget review',
            status: 'active',
            participants: [{ name: 'Investor' }, { name: 'The CTO' }],
        };

        const decoded = decodeObject(record, 'meeting');
        expect(requireString(decoded.id, 'meeting.id')).toBe('m-1');

        const participants = requireArray(decoded.participants, 'meeting.participants', (value, path) =>
            requireString(decodeObject(value, path).name, `${path}.name`)
        );
        expect(participants).toEqual(['Investor', 'The CTO']);

        const broken: Record<string, unknown> = {
            ...record,
            participants: [{ name: 'Investor' }, {}],
        };
        const brokenDecoded = decodeObject(broken, 'meeting');
        expect(() =>
            requireArray(
                brokenDecoded.participants,
                'meeting.participants',
                (value, path) => requireString(decodeObject(value, path).name, `${path}.name`)
            )
        ).toThrow('meeting.participants[1].name: expected a string');
    });
});
