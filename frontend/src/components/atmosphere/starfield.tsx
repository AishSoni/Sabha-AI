"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";

type StarTone = "violet" | "warm" | "cool";

type Star = {
  x: number;
  y: number;
  r: number;
  opacity: number;
  tone: StarTone;
  hero?: boolean;
};

type LayerConfig = {
  count: number;
  minRadius: number;
  maxRadius: number;
  minOpacity: number;
  maxOpacity: number;
};

type DensityConfig = {
  far: LayerConfig;
  mid: LayerConfig;
  near: LayerConfig;
  heroes: number;
};

export type StarfieldDensity = "subtle" | "standard";

export type StarfieldProps = {
  density?: StarfieldDensity;
  parallax?: boolean;
  meteors?: boolean;
  className?: string;
};

const DENSITIES: Record<StarfieldDensity, DensityConfig> = {
  subtle: {
    far: {
      count: 160,
      minRadius: 0.3,
      maxRadius: 0.55,
      minOpacity: 0.16,
      maxOpacity: 0.36,
    },
    mid: {
      count: 70,
      minRadius: 0.55,
      maxRadius: 1,
      minOpacity: 0.22,
      maxOpacity: 0.52,
    },
    near: {
      count: 35,
      minRadius: 0.9,
      maxRadius: 1.6,
      minOpacity: 0.3,
      maxOpacity: 0.75,
    },
    heroes: 5,
  },
  standard: {
    far: {
      count: 240,
      minRadius: 0.3,
      maxRadius: 0.55,
      minOpacity: 0.16,
      maxOpacity: 0.36,
    },
    mid: {
      count: 100,
      minRadius: 0.55,
      maxRadius: 1,
      minOpacity: 0.22,
      maxOpacity: 0.52,
    },
    near: {
      count: 47,
      minRadius: 0.9,
      maxRadius: 1.6,
      minOpacity: 0.3,
      maxOpacity: 0.75,
    },
    heroes: 7,
  },
};

const TONE_FILL: Record<StarTone, string> = {
  violet: "var(--atmosphere-star)",
  warm: "var(--atmosphere-star-warm)",
  cool: "var(--atmosphere-star-cool)",
};

function field(
  seed: number,
  config: LayerConfig,
  heroes = 0,
): Star[] {
  let state = seed >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const tone = (): StarTone => {
    const roll = next();
    if (roll < 0.74) return "violet";
    if (roll < 0.9) return "warm";
    return "cool";
  };

  return Array.from({ length: config.count }, (_, index) => {
    const hero = index < heroes;
    const depth = next();
    return {
      x: next() * 1600,
      y: next() * 1000,
      r: hero
        ? 1.7 + next() * 0.8
        : config.minRadius +
          depth * (config.maxRadius - config.minRadius),
      opacity: hero
        ? 0.82 + next() * 0.14
        : config.minOpacity +
          next() * (config.maxOpacity - config.minOpacity),
      tone: tone(),
      hero,
    };
  });
}

function Plane({
  stars,
  className,
}: {
  stars: readonly Star[];
  className: string;
}) {
  return (
    <svg
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      className={`atmosphere-stars ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {stars.map((star, index) => (
        <circle
          key={index}
          cx={star.x}
          cy={star.y}
          r={star.r}
          fill={TONE_FILL[star.tone]}
          opacity={star.opacity}
          className={
            star.hero
              ? "atmosphere-star atmosphere-star--hero"
              : "atmosphere-star"
          }
          style={
            {
              "--star-opacity": star.opacity,
              animationDelay: `${(index % 19) * 0.31}s`,
              animationDuration: star.hero
                ? `${12 + (index % 4) * 2}s`
                : `${6 + (index % 5)}s`,
            } as CSSProperties
          }
        />
      ))}
    </svg>
  );
}

function usePointerParallax(
  ref: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let frame = 0;
    let targetX = 0;
    let targetY = 0;

    const apply = () => {
      frame = 0;
      element.style.setProperty("--parallax-x", `${targetX.toFixed(2)}px`);
      element.style.setProperty("--parallax-y", `${targetY.toFixed(2)}px`);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      targetX = ((event.clientX / window.innerWidth) - 0.5) * 16;
      targetY = ((event.clientY / window.innerHeight) - 0.5) * 16;
      schedule();
    };
    const reset = () => {
      targetX = 0;
      targetY = 0;
      schedule();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
    };
  }, [enabled, ref]);
}

/**
 * A fixed, pointer-transparent stellar field for application routes. Three
 * seeded depth planes drift at different speeds, a faint galaxy band gives the
 * field structure, and a few sparse meteors keep it from feeling mechanical.
 * The Appearance owner can pause every layer without touching room state.
 */
export function Starfield({
  density = "subtle",
  parallax = true,
  meteors = true,
  className,
}: StarfieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  usePointerParallax(fieldRef, parallax);

  const config = DENSITIES[density];
  const far = field(0x1d2f43, config.far);
  const mid = field(0x5a6b71, config.mid);
  const near = field(0x7f4a2d, config.near, config.heroes);

  return (
    <div
      ref={fieldRef}
      className={className ? `atmosphere-field ${className}` : "atmosphere-field"}
      data-testid="atmosphere-field"
      data-density={density}
      data-parallax={parallax ? "on" : "off"}
      aria-hidden="true"
    >
      <div className="atmosphere-galaxy" />
      <div
        className="atmosphere-parallax atmosphere-parallax--far"
        style={{ "--parallax-depth": 0.25 } as CSSProperties}
      >
        <Plane stars={far} className="atmosphere-drift-c" />
      </div>
      <div
        className="atmosphere-parallax atmosphere-parallax--mid"
        style={{ "--parallax-depth": 0.55 } as CSSProperties}
      >
        <Plane stars={mid} className="atmosphere-drift-b" />
      </div>
      <div
        className="atmosphere-parallax atmosphere-parallax--near"
        style={{ "--parallax-depth": 1 } as CSSProperties}
      >
        <Plane stars={near} className="atmosphere-drift-a" />
      </div>
      {meteors ? (
        <>
          <span className="atmosphere-meteor atmosphere-meteor--a" />
          <span className="atmosphere-meteor atmosphere-meteor--b" />
        </>
      ) : null}
    </div>
  );
}
