"use client";

import * as React from "react";

export type AppearancePreference = "system" | "light" | "dark";
export type ResolvedAppearance = "light" | "dark";

type AppearanceContextValue = {
  preference: AppearancePreference;
  resolved: ResolvedAppearance;
  setPreference: (preference: AppearancePreference) => void;
  reducedMotion: boolean;
};

const AppearanceContext = React.createContext<AppearanceContextValue | null>(
  null,
);

const DARK_QUERY = "(prefers-color-scheme: dark)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToQuery(queryText: string, callback: () => void) {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }

  const query = window.matchMedia(queryText);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getQuerySnapshot(queryText: string) {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia(queryText).matches;
}

function getServerSnapshot() {
  return false;
}

function subscribeToSystem(callback: () => void) {
  return subscribeToQuery(DARK_QUERY, callback);
}

function subscribeToReducedMotion(callback: () => void) {
  return subscribeToQuery(REDUCED_MOTION_QUERY, callback);
}

/**
 * Memory-only appearance owner. It deliberately never reads or writes
 * localStorage, sessionStorage, cookies, IndexedDB, Auth, vault, or queries.
 * A reload returns to System; the OS reduced-motion preference remains the
 * only authority that pauses decorative CSS animation.
 */
export function AppearanceProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [preference, setPreferenceState] =
    React.useState<AppearancePreference>("system");
  const systemDark = React.useSyncExternalStore(
    subscribeToSystem,
    () => getQuerySnapshot(DARK_QUERY),
    getServerSnapshot,
  );
  const reducedMotion = React.useSyncExternalStore(
    subscribeToReducedMotion,
    () => getQuerySnapshot(REDUCED_MOTION_QUERY),
    getServerSnapshot,
  );
  const resolved: ResolvedAppearance =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  React.useEffect(() => {
    const root = document.documentElement;
    if (preference === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", preference);
    }
  }, [preference]);

  React.useEffect(() => {
    document.documentElement.setAttribute(
      "data-background",
      reducedMotion ? "paused" : "on",
    );
  }, [reducedMotion]);

  const setPreference = React.useCallback((next: AppearancePreference) => {
    setPreferenceState(next);
  }, []);

  const value = React.useMemo(
    () => ({
      preference,
      resolved,
      setPreference,
      reducedMotion,
    }),
    [preference, resolved, setPreference, reducedMotion],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const value = React.useContext(AppearanceContext);
  if (!value) {
    throw new Error("useAppearance must be used inside AppearanceProvider");
  }
  return value;
}

/**
 * Presentational chrome may be rendered outside the root owner in a test or
 * isolated composition. In that case the menu simply does not render rather
 * than creating a second appearance owner.
 */
export function useAppearanceOptional(): AppearanceContextValue | null {
  return React.useContext(AppearanceContext);
}
