import Link from "next/link";

import { SabhaLogo } from "@/components/brand/sabha-logo";

import { HOME_COPY } from "../presentation/copy";

export function HomeFooter() {
  return (
    <footer className="home-footer">
      <div className="home-footer__inner">
        <div className="home-footer__summary">
          <div className="home-footer__brand">
            <SabhaLogo idPrefix="home-footer-logo" />
          </div>
          <p className="home-footer__description">
            {HOME_COPY.footer.description}
          </p>
        </div>
        <nav className="home-footer__links" aria-label="Footer">
          <Link href="/demo">{HOME_COPY.footer.demoLink}</Link>
          <Link href="/login">{HOME_COPY.footer.operatorLink}</Link>
        </nav>
      </div>
    </footer>
  );
}
