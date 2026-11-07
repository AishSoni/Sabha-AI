import { EMBLEMS, type EmblemPart } from "../presentation/emblems";

function partOpacity(part: EmblemPart, fallback: number): number {
  return part.opacity ?? fallback;
}

function partWidth(part: EmblemPart, fallback: number): number {
  return part.width ?? fallback;
}

/**
 * A single hidden sprite keeps the 189 static persona cards cheap: each slot
 * only renders a tiny <use> reference to one of the 18 authored card symbols.
 */
export function HomeEmblemSprite() {
  return (
    <svg
      className="home-emblem-sprite"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {EMBLEMS.map((emblem) => (
          <linearGradient
            key={`fill-${emblem.id}`}
            id={`home-card-fill-${emblem.id}`}
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop offset="0%" stopColor="var(--home-card-top)" />
            <stop offset="100%" stopColor="var(--home-card-bottom)" />
          </linearGradient>
        ))}
        {EMBLEMS.map((emblem) => (
          <radialGradient
            key={`glow-${emblem.id}`}
            id={`home-card-glow-${emblem.id}`}
            cx="50%"
            cy="42%"
            r="58%"
          >
            <stop offset="0%" stopColor={emblem.accent} stopOpacity="0.42" />
            <stop offset="100%" stopColor={emblem.accent} stopOpacity="0" />
          </radialGradient>
        ))}
        {EMBLEMS.map((emblem) => (
          <linearGradient
            key={`ink-${emblem.id}`}
            id={`home-card-ink-${emblem.id}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor="var(--home-card-glyph)" />
            <stop offset="100%" stopColor={emblem.accent} />
          </linearGradient>
        ))}
        <linearGradient id="home-card-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="46%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {EMBLEMS.map((emblem) => (
        <symbol
          key={emblem.id}
          id={`home-emblem-card-${emblem.id}`}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <rect
            x="1.5"
            y="1.5"
            width="97"
            height="97"
            rx="18"
            fill={`url(#home-card-fill-${emblem.id})`}
          />
          <circle
            cx="50"
            cy="48"
            r="40"
            fill={`url(#home-card-glow-${emblem.id})`}
          />
          <ellipse
            cx="50"
            cy="50"
            rx="34"
            ry="21"
            fill="none"
            stroke={emblem.accent}
            strokeOpacity="0.22"
            strokeWidth="0.7"
            transform="rotate(-24 50 50)"
          />
          <rect
            x="1.5"
            y="1.5"
            width="97"
            height="97"
            rx="18"
            fill="url(#home-card-sheen)"
          />
          {emblem.parts.map((part, index) =>
            part.mode === "fill" ? (
              <path
                key={`${emblem.id}-${index}`}
                d={part.d}
                fill={`url(#home-card-ink-${emblem.id})`}
                fillRule="evenodd"
                opacity={partOpacity(part, 0.96)}
              />
            ) : (
              <path
                key={`${emblem.id}-${index}`}
                d={part.d}
                fill="none"
                stroke={emblem.accent}
                strokeWidth={partWidth(part, 2.4)}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={partOpacity(part, 0.9)}
              />
            ),
          )}
          <rect
            x="2.1"
            y="2.1"
            width="95.8"
            height="95.8"
            rx="17.4"
            fill="none"
            stroke={emblem.accent}
            strokeOpacity="0.5"
            strokeWidth="0.8"
          />
        </symbol>
      ))}
    </svg>
  );
}
