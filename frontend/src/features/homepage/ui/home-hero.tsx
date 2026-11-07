import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { HOME_COPY } from "../presentation/copy";
import { HomeHeadline } from "./home-headline";
import { HomePersonaField } from "./home-persona-field";
import { HomeStarfield } from "./home-starfield";

export function HomeHero() {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <HomeStarfield />
      <HomePersonaField />

      <div className="home-hero__content" id="home-hero-content">
        <HomeHeadline id="home-hero-title" />

        <div className="home-hero__actions">
          <Link href="/demo" className="home-demo-cta">
            {HOME_COPY.demoCta}
          </Link>
          <Link href="/login" className="home-operator-link">
            {HOME_COPY.operatorCta}
          </Link>
        </div>

      </div>

      <a
        href="#evidence"
        className="home-hero__anchor"
        aria-label={HOME_COPY.evidenceAnchor}
      >
        <ChevronDown className="size-5" aria-hidden="true" />
      </a>
    </section>
  );
}
