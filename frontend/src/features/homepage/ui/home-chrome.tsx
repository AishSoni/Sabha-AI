"use client";

import Link from "next/link";
import { Pause, Play, Sparkles } from "lucide-react";

import {
  AppearanceMenu,
  useAppearanceOptional,
} from "@/components/appearance";
import { Button } from "@/components/ui/button";

import { HOME_COPY } from "../presentation/copy";

export function HomeChrome() {
  const appearance = useAppearanceOptional();
  const reducedMotion = appearance?.reducedMotion ?? false;
  const paused = appearance?.resolvedBackgroundAnimation === "paused";
  const motionLabel = reducedMotion
    ? "Animation paused by your reduced-motion setting"
    : paused
      ? "Resume animation"
      : "Pause animation";
  const visibleMotionLabel = reducedMotion
    ? "Paused"
    : paused
      ? "Resume"
      : "Pause";

  return (
    <div className="home-chrome">
      <noscript>
        <style>{`.home-chrome__appearance,.home-chrome__pause{display:none}`}</style>
      </noscript>
      <div className="home-chrome__inner">
        <Link href="/" className="home-chrome__brand" aria-label="Sabha home">
          <span className="home-chrome__mark" aria-hidden="true">
            <Sparkles className="size-5" strokeWidth={2} />
          </span>
          <span className="home-chrome__wordmark">{HOME_COPY.brand}</span>
        </Link>

        <div className="home-chrome__controls">
          <span className="home-chrome__appearance">
            <AppearanceMenu />
          </span>
          {appearance ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="home-chrome__pause"
              aria-label={motionLabel}
              title={motionLabel}
              data-testid="home-motion-toggle"
              data-state={reducedMotion ? "reduced" : paused ? "paused" : "on"}
              disabled={reducedMotion}
              onClick={() =>
                appearance.setBackgroundAnimation(paused ? "on" : "paused")
              }
            >
              {paused || reducedMotion ? (
                <Play className="size-4" aria-hidden="true" />
              ) : (
                <Pause className="size-4" aria-hidden="true" />
              )}
              <span className="home-chrome__pause-label">
                {visibleMotionLabel}
              </span>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
