"use client";

import Link from "next/link";
import { Pause, Play, Sparkles } from "lucide-react";

import {
  AppearanceMenu,
  useAppearanceOptional,
} from "@/components/appearance";
import { Button } from "@/components/ui/button";

import { HOME_COPY } from "../presentation/copy";

export function HomeHeader() {
  const appearance = useAppearanceOptional();
  const reducedMotion = appearance?.reducedMotion ?? false;
  const paused = appearance?.resolvedBackgroundAnimation === "paused";
  const motionLabel = reducedMotion
    ? "Animation paused by your reduced-motion setting"
    : paused
      ? "Resume animation"
      : "Pause animation";
  const visibleMotionLabel = reducedMotion ? "Paused" : paused ? "Resume" : "Pause";

  return (
    <header className="home-header">
      <noscript>
        <style>{`.home-header__appearance,.home-header__pause{display:none}`}</style>
      </noscript>
      <div className="home-header__inner">
        <Link href="/" className="home-header__brand" aria-label="Sabha home">
          <span className="home-header__mark" aria-hidden="true">
            <Sparkles className="size-4" strokeWidth={1.8} />
          </span>
          <span className="home-header__wordmark">{HOME_COPY.brand}</span>
          <span className="home-header__subtitle">
            {HOME_COPY.brandSubtitle}
          </span>
        </Link>

        <div className="home-header__controls">
          <span className="home-header__appearance">
            <AppearanceMenu />
          </span>
          {appearance ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="home-header__pause"
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
              <span className="hidden sm:inline">{visibleMotionLabel}</span>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
