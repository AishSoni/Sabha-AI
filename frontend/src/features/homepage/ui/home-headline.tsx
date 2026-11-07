"use client";

import { useEffect, useRef, useState } from "react";

import { useAppearanceOptional } from "@/components/appearance";

import { EMBLEMS } from "../presentation/emblems";

const FLIP_INTERVAL = 7000;
const FLIP_DURATION = 700;
const ICON_COUNT = 3;

function iconsFor(index: number) {
  return Array.from({ length: ICON_COUNT }, (_, offset) => {
    const emblem = EMBLEMS[(index * ICON_COUNT + offset) % EMBLEMS.length];
    return emblem!;
  });
}

export function HomeHeadline({ id }: { id?: string }) {
  const appearance = useAppearanceOptional();
  const paused = appearance?.resolvedBackgroundAnimation === "paused";
  const reducedMotion = appearance?.reducedMotion ?? false;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [inView, setInView] = useState(true);
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);

  useEffect(() => {
    const node = headingRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? true),
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || !inView) return;
    const timer = window.setInterval(() => {
      setPrevious((current) => current ?? index);
      setIndex((current) => (current + 1) % 18);
    }, FLIP_INTERVAL);
    return () => window.clearInterval(timer);
  }, [index, inView, paused, reducedMotion]);

  useEffect(() => {
    if (previous === null) return;
    const timer = window.setTimeout(() => setPrevious(null), FLIP_DURATION);
    return () => window.clearTimeout(timer);
  }, [previous]);

  const current = iconsFor(index);
  const outgoing = previous === null ? null : iconsFor(previous);

  return (
    <h1
      ref={headingRef}
      id={id}
      className="home-headline"
      data-motion={reducedMotion ? "reduced" : "full"}
      aria-label="Bring more minds to your next decision."
    >
      <span className="home-headline__line">Bring more minds</span>
      <span className="home-headline__tail">
        <span className="home-headline__tail-text">to your next decision.</span>
        <span className="home-headline__icons" aria-hidden="true">
          {outgoing ? (
            <span
              key={`out-${previous}`}
              className="home-headline__icon-group home-headline__icon-group--out"
            >
              {outgoing.map((emblem, offset) => (
                <span
                  key={`${emblem.id}-${offset}`}
                  className="home-headline__icon"
                  data-emblem={emblem.id}
                >
                  <svg viewBox="0 0 100 100" focusable="false">
                    <use href={`#home-emblem-card-${emblem.id}`} />
                  </svg>
                </span>
              ))}
            </span>
          ) : null}
          <span
            key={`in-${index}`}
            className="home-headline__icon-group home-headline__icon-group--in"
          >
            {current.map((emblem, offset) => (
              <span
                key={`${emblem.id}-${offset}`}
                className="home-headline__icon"
                data-emblem={emblem.id}
              >
                <svg viewBox="0 0 100 100" focusable="false">
                  <use href={`#home-emblem-card-${emblem.id}`} />
                </svg>
              </span>
            ))}
          </span>
        </span>
      </span>
    </h1>
  );
}
