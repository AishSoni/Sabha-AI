"use client";

import { createContext, useContext } from "react";

const ActiveReplayIntentContext = createContext<string | null>(null);

export function ActiveReplayIntentProvider({
    intentId,
    children,
}: {
    intentId: string | null;
    children: React.ReactNode;
}) {
    return (
        <ActiveReplayIntentContext.Provider value={intentId}>
            {children}
        </ActiveReplayIntentContext.Provider>
    );
}

export function useActiveReplayIntentId(): string | null {
    return useContext(ActiveReplayIntentContext);
}
