import { HomeEvidence } from "./home-evidence";
import { HomeFooter } from "./home-footer";
import { HomeHeader } from "./home-header";
import { HomeHero } from "./home-hero";

export function HomePage() {
  return (
    <div className="home-page">
      <HomeHeader />
      <main id="main-content" tabIndex={-1}>
        <HomeHero />
        <HomeEvidence />
      </main>
      <HomeFooter />
    </div>
  );
}
