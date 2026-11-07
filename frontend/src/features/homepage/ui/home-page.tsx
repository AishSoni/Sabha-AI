import { HomeChrome } from "./home-chrome";
import { HomeEmblemSprite } from "./home-emblem-sprite";
import { HomeEvidence } from "./home-evidence";
import { HomeFooter } from "./home-footer";
import { HomeHero } from "./home-hero";

export function HomePage() {
  return (
    <div className="home-page">
      <HomeEmblemSprite />
      <HomeChrome />
      <main id="main-content" tabIndex={-1}>
        <HomeHero />
        <HomeEvidence />
      </main>
      <HomeFooter />
    </div>
  );
}
