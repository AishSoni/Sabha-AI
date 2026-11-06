"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  useAppearanceOptional,
  type ResolvedAppearance,
} from "@/components/appearance";

import { FIELD_PALETTES } from "../presentation/field-palette";
import {
  HOME_FIELD_SLOTS,
  resolveFieldSlot,
  type FieldDensity,
} from "../presentation/field-layout";
import { EmblemSvg } from "./emblem-svg";
import type { FieldEngine } from "./home-field-webgl";

type EngineState = "static" | "ready" | "failed";

function densityForWidth(width: number): FieldDensity {
  if (width >= 1200) return "wide";
  if (width >= 768) return "medium";
  return "compact";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function HomePersonaField() {
  const appearance = useAppearanceOptional();
  const reducedMotion = appearance?.reducedMotion ?? false;
  const paused = appearance?.resolvedBackgroundAnimation === "paused";
  const resolved: ResolvedAppearance = appearance?.resolved ?? "light";

  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FieldEngine | null>(null);
  const resolvedRef = useRef<ResolvedAppearance>(resolved);
  const densityRef = useRef<FieldDensity>("wide");
  const pauseStateRef = useRef(false);

  const [engineState, setEngineState] = useState<EngineState>("static");
  const [density, setDensity] = useState<FieldDensity>("wide");
  const [inView, setInView] = useState(true);
  const [documentHidden, setDocumentHidden] = useState(false);

  resolvedRef.current = resolved;
  densityRef.current = density;
  pauseStateRef.current = reducedMotion || paused || !inView || documentHidden;

  useEffect(() => {
    const update = () => setDensity(densityForWidth(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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

  useEffect(() => {
    const field = fieldRef.current;
    const content = document.getElementById("home-hero-content");
    if (!field || !content) return;

    const updateMask = () => {
      const fieldRect = field.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      if (!fieldRect.width || !fieldRect.height) return;

      const centerX =
        ((contentRect.left + contentRect.width / 2 - fieldRect.left) /
          fieldRect.width) *
        100;
      const centerY =
        ((contentRect.top + contentRect.height / 2 - fieldRect.top) /
          fieldRect.height) *
        100;
      const radiusX =
        ((contentRect.width / 2 + 64) / fieldRect.width) * 100;
      const radiusY =
        ((contentRect.height / 2 + 56) / fieldRect.height) * 100;

      field.style.setProperty(
        "--home-mask-cx",
        `${clamp(centerX, 12, 88)}%`,
      );
      field.style.setProperty(
        "--home-mask-cy",
        `${clamp(centerY, 12, 88)}%`,
      );
      field.style.setProperty(
        "--home-mask-rx",
        `${clamp(radiusX, 30, 72)}%`,
      );
      field.style.setProperty(
        "--home-mask-ry",
        `${clamp(radiusY, 24, 68)}%`,
      );
    };

    updateMask();
    window.addEventListener("resize", updateMask);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateMask);
    observer?.observe(field);
    observer?.observe(content);

    return () => {
      window.removeEventListener("resize", updateMask);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setEngineState("static");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let engine: FieldEngine | null = null;

    const load = async () => {
      try {
        const engineModule = await import("./home-field-webgl");
        if (disposed) return;

        engine = await engineModule.createHomeFieldEngine({
          canvas,
          palette: FIELD_PALETTES[resolvedRef.current],
          dprCap: window.innerWidth < 768 ? 1.5 : 2,
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
        engine.setDensity(densityRef.current);
        engine.setPalette(FIELD_PALETTES[resolvedRef.current]);
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
  }, [reducedMotion]);

  useEffect(() => {
    engineRef.current?.setDensity(density);
  }, [density]);

  useEffect(() => {
    engineRef.current?.setPalette(FIELD_PALETTES[resolved]);
  }, [resolved]);

  useEffect(() => {
    engineRef.current?.setPaused(
      reducedMotion || paused || !inView || documentHidden,
    );
  }, [reducedMotion, paused, inView, documentHidden]);

  return (
    <div
      ref={fieldRef}
      className="home-persona-field"
      data-testid="home-persona-field"
      data-webgl={engineState}
      data-motion={reducedMotion ? "reduced" : "full"}
      data-density={density}
      aria-hidden="true"
    >
      <div
        className="home-persona-field__static"
        data-testid="home-persona-static"
      >
        {HOME_FIELD_SLOTS.map((slot) => {
          const position = resolveFieldSlot(slot);
          const style = {
            left: `${position.x}%`,
            top: `${position.y}%`,
            width: `${slot.size}px`,
            "--home-slot-rotation": `${position.rotation}rad`,
            "--home-slot-opacity": String(slot.opacity),
          } as CSSProperties;

          return (
            <span
              key={slot.id}
              className="home-slot"
              data-compact={slot.compact}
              data-medium={slot.medium}
              data-emblem={slot.emblemId}
              data-testid="home-persona-slot"
              style={style}
            >
              <EmblemSvg emblemId={slot.emblemId} />
            </span>
          );
        })}
      </div>
      <canvas
        ref={canvasRef}
        className="home-persona-field__canvas"
        data-testid="home-persona-canvas"
        aria-hidden="true"
      />
    </div>
  );
}
