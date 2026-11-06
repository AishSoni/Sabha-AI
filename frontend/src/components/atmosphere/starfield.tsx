type Star = {
  x: number;
  y: number;
  r: number;
  opacity: number;
};

function field(seed: number, count: number, maxRadius: number): Star[] {
  let state = seed >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };

  return Array.from({ length: count }, () => {
    const depth = next();
    return {
      x: next() * 1600,
      y: next() * 1000,
      r: 0.55 + depth * maxRadius,
      opacity: 0.2 + next() * 0.65,
    };
  });
}

const NEAR_STARS = field(0x5a6b71, 34, 1.4);
const FAR_STARS = field(0x1d2f43, 72, 0.75);

function Plane({
  stars,
  className,
}: {
  stars: readonly Star[];
  className: string;
}) {
  return (
    <svg
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      className={`atmosphere-stars ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {stars.map((star, index) => (
        <circle
          key={index}
          cx={star.x}
          cy={star.y}
          r={star.r}
          fill="currentColor"
          opacity={star.opacity}
        />
      ))}
    </svg>
  );
}

/**
 * A fixed, pointer-transparent stellar field for application routes. The two
 * planes move independently at a small, slow offset; the Appearance owner can
 * pause them without touching any room, replay or workspace state.
 */
export function Starfield() {
  return (
    <div
      className="atmosphere-field"
      data-testid="atmosphere-field"
      aria-hidden="true"
    >
      <Plane stars={FAR_STARS} className="atmosphere-drift-b" />
      <Plane stars={NEAR_STARS} className="atmosphere-drift-a" />
    </div>
  );
}
