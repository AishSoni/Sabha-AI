/**
 * Shared decode primitives (spec-05).
 *
 * Runtime validation for the generated DTO bindings: every decoded record
 * proves its shape before it can enter query caches or feature state, and a
 * drifting backend surfaces as a `DecodeError` naming the exact path that no
 * longer matches the frozen contract. Primitives stay shape-agnostic — the
 * record-shaped decoders live beside the feature that owns each endpoint.
 */
export class DecodeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DecodeError';
    }
}

export function decodeObject(value: unknown, path: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new DecodeError(`${path}: expected an object`);
    }
    return value as Record<string, unknown>;
}

export function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string') {
        throw new DecodeError(`${path}: expected a string`);
    }
    return value;
}

export function optionalString(value: unknown, path: string): string | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    return requireString(value, path);
}

export function requireNumber(value: unknown, path: string): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new DecodeError(`${path}: expected a number`);
    }
    return value;
}

export function optionalNumber(value: unknown, path: string): number | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    return requireNumber(value, path);
}

export function requireBoolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') {
        throw new DecodeError(`${path}: expected a boolean`);
    }
    return value;
}

export function optionalBoolean(value: unknown, path: string): boolean | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    return requireBoolean(value, path);
}

export function requireArray<T>(
    value: unknown,
    path: string,
    decodeItem: (item: unknown, path: string) => T
): T[] {
    if (!Array.isArray(value)) {
        throw new DecodeError(`${path}: expected an array`);
    }
    return value.map((item, index) => decodeItem(item, `${path}[${index}]`));
}
