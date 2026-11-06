"use client";

import * as React from "react";

export type AppearancePreference = "system" | "light" | "dark";
export type ResolvedAppearance = "light" | "dark";
export type BackgroundAnimation = "on" | "paused";

type AppearanceContextValue = {
  preference: AppearancePreference;
  resolved: ResolvedAppearance;
  setPreference: (preference: AppearancePreference) => void;
  backgroundAnimation: BackgroundAnimation;
  resolvedBackgroundAnimation: BackgroundAnimation;
  reducedMotion: boolean;
  setBackgroundAnimation: (value: BackgroundAnimation) => void;
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
 * A reload returns to System and background motion On by design.
 */
export function AppearanceProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [preference, setPreferenceState] =
    React.useState<AppearancePreference>("system");
  const [backgroundAnimation, setBackgroundAnimationState] =
    React.useState<BackgroundAnimation>("on");
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
  const resolvedBackgroundAnimation: BackgroundAnimation = reducedMotion
    ? "paused"
    : backgroundAnimation;

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
      resolvedBackgroundAnimation,
    );
  }, [resolvedBackgroundAnimation]);

  const setPreference = React.useCallback((next: AppearancePreference) => {
    setPreferenceState(next);
  }, []);

  const setBackgroundAnimation = React.useCallback(
    (next: BackgroundAnimation) => {
      setBackgroundAnimationState(next);
    },
    [],
  );

  const value = React.useMemo(
    () => ({
      preference,
      resolved,
      setPreference,
      backgroundAnimation,
      resolvedBackgroundAnimation,
      reducedMotion,
      setBackgroundAnimation,
    }),
    [
      preference,
      resolved,
      setPreference,
      backgroundAnimation,
      resolvedBackgroundAnimation,
      reducedMotion,
      setBackgroundAnimation,
    ],
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
