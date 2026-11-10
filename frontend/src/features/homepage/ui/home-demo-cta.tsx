"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { ArrowRight } from "lucide-react";

import { SabhaMark } from "@/components/brand/sabha-logo";
import {
  ReplayEntryError,
  loadReplayEntry,
  replayEntryFailureMessage,
  stageEntryHandoff,
  type ReplayEntrySessionIdentity,
  type ReplayEntryStage,
} from "@/features/demo-entry";

import { HOME_COPY } from "../presentation/copy";
import { HOME_CTA_PARTICLES } from "../presentation/cta-particles";

const SWEEP_MS = 1050;
const PENDING_LABEL = "Preparing the demo.";

type DeparturePhase = "idle" | "departing" | "pending" | "error";

export function HomeDemoCta() {
  const router = useRouter();
  const [phase, setPhase] = useState<DeparturePhase>("idle");
  const [error, setError] = useState<{
    message: string;
    stage: ReplayEntryStage;
  } | null>(null);
  const busyRef = useRef(false);
  const attemptRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const pinnedSessionRef = useRef<ReplayEntrySessionIdentity | null>(null);
  const sweepTimerRef = useRef<number | null>(null);
  const sweepResolveRef = useRef<(() => void) | null>(null);

  const settleSweep = useCallback(() => {
    if (sweepTimerRef.current !== null) {
      window.clearTimeout(sweepTimerRef.current);
      sweepTimerRef.current = null;
    }
    sweepResolveRef.current?.();
    sweepResolveRef.current = null;
  }, []);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      settleSweep();
    },
    [settleSweep]
  );

  const departure = useCallback(
    (reducedMotion: boolean): Promise<void> => {
      if (reducedMotion) {
        setPhase("pending");
        return Promise.resolve();
      }
      setPhase("departing");
      return new Promise<void>((resolve) => {
        sweepResolveRef.current = resolve;
        sweepTimerRef.current = window.setTimeout(() => {
          sweepTimerRef.current = null;
          sweepResolveRef.current = null;
          setPhase("pending");
          resolve();
        }, SWEEP_MS);
      });
    },
    []
  );

  const begin = useCallback(
    (reducedMotion: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const attempt = attemptRef.current + 1;
      attemptRef.current = attempt;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setError(null);

      const sweep = departure(reducedMotion);

      void loadReplayEntry({
        signal: controller.signal,
        session: pinnedSessionRef.current ?? undefined,
      })
        .then(async (entry) => {
          pinnedSessionRef.current = entry.session;
          await sweep;
          if (attempt !== attemptRef.current || controller.signal.aborted) {
            return;
          }
          busyRef.current = false;
          stageEntryHandoff(entry);
          router.push("/demo");
        })
        .catch(async (cause) => {
          await sweep;
          if (attempt !== attemptRef.current || controller.signal.aborted) {
            return;
          }
          const failure =
            cause instanceof ReplayEntryError
              ? cause
              : new ReplayEntryError("session", "The demo is unavailable.", {
                  cause,
                });
          pinnedSessionRef.current =
            failure.stage === "metadata" ? failure.session : null;
          setError({
            stage: failure.stage,
            message: replayEntryFailureMessage(failure.stage, failure),
          });
          setPhase("error");
          busyRef.current = false;
        });
    },
    [departure, router]
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (busyRef.current) {
        event.preventDefault();
        return;
      }
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      begin(reducedMotion);
    },
    [begin]
  );

  const busy = phase === "departing" || phase === "pending";
  const label = busy ? PENDING_LABEL : HOME_COPY.demoCta;

  const retry = () => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    begin(reducedMotion);
  };

  return (
    <span className="home-demo-cta-wrap">
      <span
        className="home-demo-cta-shell"
        data-leaving={phase === "departing" ? "true" : undefined}
        data-pending={phase === "pending" ? "true" : undefined}
      >
        <span className="home-demo-cta-shell__particles" aria-hidden="true">
          {HOME_CTA_PARTICLES.map((particle) => {
            const style = {
              "--home-particle-x": `${particle.x}px`,
              "--home-particle-y": `${particle.y}px`,
              "--home-particle-size": `${particle.size}px`,
              "--home-particle-duration": `${particle.duration}s`,
              "--home-particle-delay": `${particle.delay}s`,
              "--home-particle-opacity": String(particle.opacity),
            } as CSSProperties;

            return (
              <span
                key={particle.id}
                className="home-demo-cta-particle"
                data-tone={particle.tone}
                style={style}
              />
            );
          })}
        </span>
        <span className="home-demo-cta-shell__glow" aria-hidden="true" />
        <span className="home-demo-cta-shell__ring" aria-hidden="true" />

        <Link
          href="/demo"
          className="home-demo-cta"
          onClick={handleClick}
          aria-busy={busy || undefined}
          aria-disabled={busy || undefined}
        >
          <span className="home-demo-cta__label">{label}</span>
          <span className="home-demo-cta__badge" aria-hidden="true">
            <SabhaMark idPrefix="home-cta-logo" className="home-demo-cta__mark" />
          </span>
          <span className="home-demo-cta__sweep" aria-hidden="true">
            <span className="home-demo-cta__sweep-arrow">
              <span className="home-demo-cta__sweep-trail" />
              <ArrowRight className="size-7" strokeWidth={2.2} />
            </span>
          </span>
        </Link>
      </span>

      <span className="sr-only" role="status" aria-live="polite">
        {busy ? PENDING_LABEL : ""}
      </span>

      {phase === "error" && error ? (
        <span className="home-demo-cta-status" role="alert">
          <span>{error.message}</span>
          <button
            type="button"
            className="home-demo-cta-status__retry"
            onClick={retry}
          >
            Try again
          </button>
        </span>
      ) : null}
    </span>
  );
}
