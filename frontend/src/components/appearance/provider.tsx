"use client";

import * as React from "react";

export type AppearancePreference = "system" | "light" | "dark";
export type ResolvedAppearance = "light" | "dark";

type AppearanceContextValue = {
  preference: AppearancePreference;
  resolved: ResolvedAppearance;
  setPreference: (preference: AppearancePreference) => void;
};

const AppearanceContext = React.createContext<AppearanceContextValue | null>(
  null,
);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystem(callback: () => void) {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }

  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getSystemSnapshot() {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia(DARK_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * Memory-only appearance owner. It deliberately never reads or writes
 * localStorage, sessionStorage, cookies, IndexedDB, Auth, vault, or queries.
 * A reload returns to System by design.
 */
export function AppearanceProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [preference, setPreferenceState] =
    React.useState<AppearancePreference>("system");
  const systemDark = React.useSyncExternalStore(
    subscribeToSystem,
    getSystemSnapshot,
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

  const setPreference = React.useCallback((next: AppearancePreference) => {
    setPreferenceState(next);
  }, []);

  const value = React.useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
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
