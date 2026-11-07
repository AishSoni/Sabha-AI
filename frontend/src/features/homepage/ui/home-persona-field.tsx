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

import { emblemById } from "../presentation/emblems";
import { FIELD_PALETTES } from "../presentation/field-palette";
import {
  HOME_FIELD_SLOTS,
  type FieldDensity,
} from "../presentation/field-layout";
import { EmblemSvg } from "./emblem-svg";
import type { FieldEngine, FieldMask } from "./home-field-webgl";

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
  const resolved: ResolvedAppearance = appearance?.resolved ?? "dark";

  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FieldEngine | null>(null);
  const maskRef = useRef<FieldMask | null>(null);
  const resolvedRef = useRef<ResolvedAppearance>(resolved);
  const densityRef = useRef<FieldDensity>("wide");
  const pauseStateRef = useRef(false);

  const [engineState, setEngineState] = useState<EngineState>("static");
  const [density, setDensity] = useState<FieldDensity>("wide");
  const [inView, setInView] = useState(true);
  const [documentHidden, setDocumentHidden] = useState(false);

  resolvedRef.current = resolved;
  densityRef.current = density;
  pauseStateRef.current = reducedMotion || !inView || documentHidden;

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

      const foreground = [
        content.querySelector(".home-headline"),
        content.querySelector(".home-hero__actions"),
      ]
        .filter((element): element is Element => element !== null)
        .map((element) => element.getBoundingClientRect());
      const bounds = foreground.length ? foreground : [contentRect];
      const left = Math.min(...bounds.map((rect) => rect.left));
      const right = Math.max(...bounds.map((rect) => rect.right));
      const top = Math.min(...bounds.map((rect) => rect.top));
      const bottom = Math.max(...bounds.map((rect) => rect.bottom));

      const centerX = (left + right) / 2 - fieldRect.left;
      const centerY = (top + bottom) / 2 - fieldRect.top;
      const radiusX = (right - left) / 2 + 110;
      const radiusY = Math.max((bottom - top) / 2 + 130, radiusX / 1.4);

      const cx = clamp((centerX / fieldRect.width) * 100, 12, 88);
      const cy = clamp((centerY / fieldRect.height) * 100, 12, 88);
      const rx = clamp((radiusX / fieldRect.width) * 100, 30, 72);
      const ry = clamp((radiusY / fieldRect.height) * 100, 24, 68);

      field.style.setProperty("--home-mask-cx", `${cx}%`);
      field.style.setProperty("--home-mask-cy", `${cy}%`);
      field.style.setProperty("--home-mask-rx", `${rx}%`);
      field.style.setProperty("--home-mask-ry", `${ry}%`);

      const mask: FieldMask = {
        centerX: (cx / 100) * fieldRect.width,
        centerY: (cy / 100) * fieldRect.height,
        radiusX: (rx / 100) * fieldRect.width,
        radiusY: (ry / 100) * fieldRect.height,
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
  }, [reducedMotion]);

  useEffect(() => {
    engineRef.current?.setDensity(density);
  }, [density]);

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
      data-density={density}
      aria-hidden="true"
    >
      <div className="home-persona-field__stage">
        <div
          className="home-persona-field__static"
          data-testid="home-persona-static"
        >
          {HOME_FIELD_SLOTS.map((slot) => {
            const emblem = emblemById(slot.emblemId);
            const style = {
              left: `${slot.x}%`,
              top: `${slot.y}%`,
              width: `${slot.width}%`,
              height: `${slot.height}%`,
              "--home-slot-rotation": `${slot.rotation}rad`,
              "--home-slot-opacity": String(slot.opacity),
              "--home-slot-accent": emblem.accent,
            } as CSSProperties;

            return (
              <span
                key={slot.id}
                className="home-slot"
                data-compact="true"
                data-medium="true"
                data-emblem={slot.emblemId}
                data-testid="home-persona-slot"
                style={style}
              >
                <EmblemSvg emblemId={slot.emblemId} variant="glyph" />
              </span>
            );
          })}
        </div>
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
