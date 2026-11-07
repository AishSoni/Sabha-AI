"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

import { HOME_COPY } from "../presentation/copy";
import { HOME_CTA_PARTICLES } from "../presentation/cta-particles";

const SWEEP_MS = 1050;

export function HomeDemoCta() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (leavingRef.current) {
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

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      event.preventDefault();
      leavingRef.current = true;
      setLeaving(true);
      timeoutRef.current = window.setTimeout(() => {
        router.push("/demo");
      }, SWEEP_MS);
    },
    [router],
  );

  return (
    <span
      className="home-demo-cta-shell"
      data-leaving={leaving ? "true" : undefined}
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

      <Link href="/demo" className="home-demo-cta" onClick={handleClick}>
        <span className="home-demo-cta__label">{HOME_COPY.demoCta}</span>
        <span className="home-demo-cta__badge" aria-hidden="true">
          <Sparkles className="size-5" strokeWidth={2} />
        </span>
        <span className="home-demo-cta__sweep" aria-hidden="true">
          <span className="home-demo-cta__sweep-arrow">
            <span className="home-demo-cta__sweep-trail" />
            <ArrowRight className="size-7" strokeWidth={2.2} />
          </span>
        </span>
      </Link>
    </span>
  );
}
