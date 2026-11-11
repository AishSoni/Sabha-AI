"use client";

import { useEffect, useRef, useState } from "react";

import {
  useAppearanceOptional,
  type ResolvedAppearance,
} from "@/components/appearance";

import { FIELD_PALETTES } from "../presentation/field-palette";
import type { FieldEngine, FieldMask } from "./home-field-webgl";

type EngineState = "static" | "ready" | "failed" | "skipped";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Data-saver and low-memory visitors never pay for the spiral. The hero is
 * still complete without it, so the field simply stays empty.
 */
function wantsReducedData(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  if (connection?.saveData) return true;
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-data: reduce)").matches === true
  );
}

/** Resolves after the first frame that follows hydration has been painted. */
function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      window.setTimeout(resolve, 16);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Yields the main thread once the hero has painted. The spiral is decorative,
 * so it is always better to let the headline, CTA, and fonts settle first.
 */
function whenIdle(timeout = 1000): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => resolve(), { timeout });
      return;
    }
    // Safari has no requestIdleCallback; a short timer is a close enough
    // approximation for a decorative canvas.
    window.setTimeout(resolve, 180);
  });
}

export function HomePersonaField() {
  const appearance = useAppearanceOptional();
  const reducedMotion = appearance?.reducedMotion ?? false;
  const resolved: ResolvedAppearance = appearance?.resolved ?? "dark";

  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FieldEngine | null>(null);
  const maskRef = useRef<FieldMask | null>(null);
  const resolvedRef = useRef<ResolvedAppearance>(resolved);
  const pauseStateRef = useRef(false);

  const [engineState, setEngineState] = useState<EngineState>("static");
  const [inView, setInView] = useState(true);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [shouldBoot, setShouldBoot] = useState(false);

  resolvedRef.current = resolved;
  pauseStateRef.current = reducedMotion || !inView || documentHidden;

  useEffect(() => {
    const update = () => setDocumentHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? true),
      { threshold: 0.05 },
    );
    observer.observe(field);
    return () => observer.disconnect();
  }, []);

  // Deep links land past the hero. Do not spend a frame budget on a canvas
  // nobody is looking at; boot the first time the field is actually seen.
  useEffect(() => {
    if (inView) setShouldBoot(true);
  }, [inView]);

  useEffect(() => {
    const field = fieldRef.current;
    const content = document.getElementById("home-hero-content");
    if (!field || !content) return;

    const updateMask = () => {
      const fieldRect = field.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      if (!fieldRect.width || !fieldRect.height) return;

      // The headline block spans the whole content column, so measure the
      // rendered text lines instead of the element box. Using the block box
      // would leave no room for the falloff and collapse it to a hard edge.
      const foreground: DOMRect[] = [];
      const headline = content.querySelector(".home-headline");
      if (headline) {
        const range = document.createRange();
        range.selectNodeContents(headline);
        foreground.push(range.getBoundingClientRect());
      }
      content
        .querySelectorAll(".home-demo-cta-shell, .home-operator-link")
        .forEach((element) => {
          foreground.push(element.getBoundingClientRect());
        });

      const bounds = foreground.filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );
      const measured = bounds.length ? bounds : [contentRect];
      const left = Math.min(...measured.map((rect) => rect.left));
      const right = Math.max(...measured.map((rect) => rect.right));
      const top = Math.min(...measured.map((rect) => rect.top));
      const bottom = Math.max(...measured.map((rect) => rect.bottom));

      const centerX = (left + right) / 2 - fieldRect.left;
      const centerY = (top + bottom) / 2 - fieldRect.top;

      // A protected core around the readable content, then a wide falloff
      // sized from the viewport rather than the leftover room. The band has
      // its own floor so the edge stays soft on short or narrow screens.
      const coreRadiusX = (right - left) / 2 + 88;
      const coreRadiusY = (bottom - top) / 2 + 112;
      const fadeBand = clamp(
        Math.min(fieldRect.width, fieldRect.height) * 0.22,
        96,
        210,
      );
      const fadeScale = (coreRadiusX + fadeBand) / Math.max(coreRadiusX, 1);
      const radiusX = coreRadiusX * fadeScale;
      // Keep the protected oval from flattening into a band on wide screens.
      const radiusY = Math.max(coreRadiusY * fadeScale, radiusX * 0.72);
      const plateau = clamp((1 / fadeScale) * 100, 55, 88);

      const cx = clamp((centerX / fieldRect.width) * 100, 12, 88);
      const cy = clamp((centerY / fieldRect.height) * 100, 12, 88);
      const rx = (radiusX / fieldRect.width) * 100;
      const ry = (radiusY / fieldRect.height) * 100;

      field.style.setProperty("--home-mask-cx", `${cx}%`);
      field.style.setProperty("--home-mask-cy", `${cy}%`);
      field.style.setProperty("--home-mask-rx", `${rx}%`);
      field.style.setProperty("--home-mask-ry", `${ry}%`);
      field.style.setProperty("--home-mask-plateau", `${plateau}%`);

      const mask: FieldMask = {
        centerX: (cx / 100) * fieldRect.width,
        centerY: (cy / 100) * fieldRect.height,
        radiusX: (rx / 100) * fieldRect.width,
        radiusY: (ry / 100) * fieldRect.height,
        plateau: plateau / 100,
      };
      maskRef.current = mask;
      engineRef.current?.setMask(mask);
    };

    updateMask();
    window.addEventListener("resize", updateMask);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateMask);
    observer?.observe(field);
    observer?.observe(content);

    // Satoshi is served with `display: swap`. If it settles after mount the
    // headline reflows, so the protected oval has to be measured again.
    let active = true;
    if (typeof document !== "undefined" && document.fonts) {
      void document.fonts.ready.then(() => {
        if (active) updateMask();
      });
    }

    return () => {
      active = false;
      window.removeEventListener("resize", updateMask);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setEngineState("static");
      return;
    }
    if (!shouldBoot) return;
    if (engineRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (wantsReducedData()) {
      setEngineState("skipped");
      return;
    }

    let disposed = false;
    let engine: FieldEngine | null = null;

    const load = async () => {
      await afterNextPaint();
      if (disposed) return;
      await whenIdle();
      if (disposed) return;

      try {
        const engineModule = await import("./home-field-webgl");
        if (disposed) return;

        engine = await engineModule.createHomeFieldEngine({
          canvas,
          palette: FIELD_PALETTES[resolvedRef.current],
          startPaused: pauseStateRef.current,
          onReady: () => {
            if (!disposed) setEngineState("ready");
          },
          onFailure: () => {
            if (!disposed) setEngineState("failed");
          },
        });

        if (disposed) {
          engine.destroy();
          return;
        }

        engineRef.current = engine;
        engine.setPalette(FIELD_PALETTES[resolvedRef.current]);
        if (maskRef.current) engine.setMask(maskRef.current);
        engine.setPaused(pauseStateRef.current);
      } catch {
        if (!disposed) setEngineState("failed");
      }
    };

    void load();

    return () => {
      disposed = true;
      engine?.destroy();
      engineRef.current = null;
    };
  }, [reducedMotion, shouldBoot]);

  useEffect(() => {
    engineRef.current?.setPalette(FIELD_PALETTES[resolved]);
  }, [resolved]);

  useEffect(() => {
    engineRef.current?.setPaused(
      reducedMotion || !inView || documentHidden,
    );
  }, [reducedMotion, inView, documentHidden]);

  return (
    <div
      ref={fieldRef}
      className="home-persona-field"
      data-testid="home-persona-field"
      data-webgl={engineState}
      data-motion={reducedMotion ? "reduced" : "full"}
      data-activity={
        reducedMotion
          ? "reduced"
          : documentHidden
            ? "hidden"
            : !inView
              ? "offscreen"
              : engineState === "failed" || engineState === "skipped"
                ? "fallback"
                : engineState === "static"
                  ? "static"
                  : "running"
      }
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="home-persona-field__canvas"
        data-testid="home-persona-canvas"
        aria-hidden="true"
      />
    </div>
  );
}
