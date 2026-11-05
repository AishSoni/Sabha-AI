import * as React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppearanceMenu } from "./menu";
import { AppearanceProvider, useAppearance } from "./provider";

type MediaListener = (event: MediaQueryListEvent) => void;

let originalMatchMedia: typeof window.matchMedia | undefined;
let mountCount = 0;

function installMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<MediaListener>();
  const query = {
    get matches() {
      return dark;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: MediaListener) => {
      listeners.delete(listener);
    },
    addListener: (listener: MediaListener) => listeners.add(listener),
    removeListener: (listener: MediaListener) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;

  const matchMedia = vi.fn(() => query);
  Object.defineProperty(window, "matchMedia", {
    value: matchMedia,
    configurable: true,
    writable: true,
  });
  vi.stubGlobal("matchMedia", matchMedia);

  return {
    setDark(next: boolean) {
      dark = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
    listenerCount: () => listeners.size,
  };
}

function Probe() {
  const { preference, resolved, setPreference } = useAppearance();

  React.useEffect(() => {
    mountCount += 1;
  }, []);

  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="resolved">{resolved}</span>
      <button type="button" onClick={() => setPreference("dark")}>
        dark
      </button>
      <button type="button" onClick={() => setPreference("light")}>
        light
      </button>
      <button type="button" onClick={() => setPreference("system")}>
        system
      </button>
    </div>
  );
}

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
  mountCount = 0;
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalMatchMedia) {
    Object.defineProperty(window, "matchMedia", {
      value: originalMatchMedia,
      configurable: true,
      writable: true,
    });
  }
  document.documentElement.removeAttribute("data-theme");
});

describe("AppearanceProvider", () => {
  it("defaults to System and resolves from the operating system", () => {
    installMatchMedia(true);
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );

    expect(screen.getByTestId("preference")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("sets an explicit appearance and returns to System without storage", () => {
    const media = installMatchMedia(false);
    const localSet = vi.spyOn(window.localStorage, "setItem");
    const sessionSet = window.sessionStorage
      ? vi.spyOn(window.sessionStorage, "setItem")
      : null;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const cookie = document.cookie;

    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    expect(screen.getByTestId("preference")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    fireEvent.click(screen.getByRole("button", { name: "light" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    fireEvent.click(screen.getByRole("button", { name: "system" }));
    expect(screen.getByTestId("preference")).toHaveTextContent("system");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");

    expect(media.listenerCount()).toBe(1);
    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.cookie).toBe(cookie);
  });

  it("follows operating-system changes while in System mode", () => {
    const media = installMatchMedia(false);
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );

    expect(screen.getByTestId("resolved")).toHaveTextContent("light");

    act(() => media.setDark(true));
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(document.documentElement).not.toHaveAttribute("data-theme");

    act(() => media.setDark(false));
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
  });

  it("does not remount the tree when appearance changes", () => {
    installMatchMedia(false);
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );

    expect(mountCount).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    fireEvent.click(screen.getByRole("button", { name: "light" }));
    expect(mountCount).toBe(1);
  });

  it("exposes a labelled appearance menu", () => {
    installMatchMedia(false);
    render(
      <AppearanceProvider>
        <AppearanceMenu />
      </AppearanceProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Appearance: System" }),
    ).toBeInTheDocument();
  });
});
