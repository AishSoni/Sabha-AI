/**
 * Structured failure vocabulary for the Sabha transport (spec-05).
 *
 * Every request failure resolves to an `ApiError` so callers can make
 * deliberate decisions without string matching. There is no auth-shaped
 * kind: Sabha is a no-sign-in workspace, so an HTTP 401 is an ordinary
 * resource error, never a signal to route a visitor toward a login.
 */

export type ApiErrorKind = "http" | "network" | "aborted";

export class ApiError extends Error {
    readonly kind: ApiErrorKind;
    /** HTTP status when kind is "http"; null for transport-level failures. */
    readonly status: number | null;
    /** Safe human-readable detail; never carries credential values. */
    readonly detail: string;

    constructor(
        kind: ApiErrorKind,
        status: number | null,
        detail: string,
        options?: { cause?: unknown }
    ) {
        super(detail, options?.cause !== undefined ? { cause: options.cause } : undefined);
        this.name = "ApiError";
        this.kind = kind;
        this.status = status;
        this.detail = detail;
    }
}

export function isApiError(value: unknown): value is ApiError {
    return value instanceof ApiError;
}

/** Builds the structured result of a non-2xx HTTP response. */
export function httpApiError(status: number, detail: string): ApiError {
    return new ApiError("http", status, detail);
}

/**
 * Maps a rejected `fetch` call to a structured failure. Abortions keep
 * their own kind; every other rejection is a network condition with a
 * safe, credential-free detail.
 */
export function transportApiError(cause: unknown): ApiError {
    const name = (cause as { name?: unknown } | null)?.name;
    if (name === "AbortError") {
        return new ApiError("aborted", null, "Request aborted", { cause });
    }
    return new ApiError("network", null, "Network request failed", { cause });
}

/**
 * Reads the backend failure body and keeps the legacy detail protocol:
 * a present `detail` wins, an unreadable body falls back to
 * "Unknown error", and a body without `detail` falls back per status.
 */
export async function readFailureDetail(response: Response): Promise<string> {
    const parsed = (await response
        .json()
        .catch(() => ({ detail: "Unknown error" }))) as { detail?: string };
    return parsed.detail || `API Error: ${response.status}`;
}
