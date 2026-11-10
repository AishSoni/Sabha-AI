export type DemoEntryStatus = "idle" | "loading" | "ready" | "error";

export interface DemoEntryReadiness {
    sessionStatus: DemoEntryStatus;
    sessionError: Error | null;
    safeConfigStatus: DemoEntryStatus;
    safeConfigError: Error | null;
    retry(): void;
    retrySafeConfig(): void;
    retryEntry(): void;
}
