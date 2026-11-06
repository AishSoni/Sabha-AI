import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";

import { HOME_COPY } from "../presentation/copy";
import { HomePersonaField } from "./home-persona-field";
import { HomeStarfield } from "./home-starfield";

export function HomeHero() {
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      <HomeStarfield />
      <HomePersonaField />

      <div className="home-hero__content" id="home-hero-content">
        <h1 id="home-hero-title" className="home-hero__title type-display">
          <span>{HOME_COPY.title.lead}</span>
          <span>{HOME_COPY.title.tail}</span>
        </h1>
        <p className="home-hero__lead type-lead">{HOME_COPY.lead}</p>

        <div className="home-hero__actions">
          <Link href="/demo" className="home-demo-cta material-glass">
            <span>{HOME_COPY.demoCta}</span>
            <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
          <Link href="/login" className="home-operator-link">
            {HOME_COPY.operatorCta}
          </Link>
        </div>

        <p className="home-hero__disclosure type-meta">
          {HOME_COPY.disclosure}
        </p>

        <a href="#evidence" className="home-hero__anchor">
          <span>{HOME_COPY.evidenceAnchor}</span>
          <ChevronDown className="size-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
