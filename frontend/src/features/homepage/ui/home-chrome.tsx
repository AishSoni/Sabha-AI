import Link from "next/link";

import { SabhaLogo } from "@/components/brand/sabha-logo";

export function HomeChrome() {
  return (
    <div className="home-chrome">
      <div className="home-chrome__inner">
        <Link href="/" className="home-chrome__brand" aria-label="Sabha home">
          <SabhaLogo idPrefix="home-chrome-logo" />
        </Link>
      </div>
    </div>
  );
}
