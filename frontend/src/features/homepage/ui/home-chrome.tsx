import Link from "next/link";
import { Sparkles } from "lucide-react";

import { HOME_COPY } from "../presentation/copy";

export function HomeChrome() {
  return (
    <div className="home-chrome">
      <div className="home-chrome__inner">
        <Link href="/" className="home-chrome__brand" aria-label="Sabha home">
          <span className="home-chrome__mark" aria-hidden="true">
            <Sparkles className="size-5" strokeWidth={2} />
          </span>
          <span className="home-chrome__wordmark">{HOME_COPY.brand}</span>
        </Link>
      </div>
    </div>
  );
}
