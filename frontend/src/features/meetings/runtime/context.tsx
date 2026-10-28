"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MeetingsRuntime } from "./contract";

const MeetingsRuntimeContext = createContext<MeetingsRuntime | null>(null);

export function MeetingsRuntimeProvider({
    runtime,
    children,
}: {
    runtime: MeetingsRuntime;
    children: ReactNode;
}) {
    return (
        <MeetingsRuntimeContext.Provider value={runtime}>
            {children}
        </MeetingsRuntimeContext.Provider>
    );
}

export function useMeetingsRuntime(): MeetingsRuntime {
    const runtime = useContext(MeetingsRuntimeContext);
    if (!runtime) {
        throw new Error("Meetings runtime is not configured for this screen.");
    }
    return runtime;
}
