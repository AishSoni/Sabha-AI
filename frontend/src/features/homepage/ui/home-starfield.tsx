import { createHomeStars } from "../presentation/starfield";

const STARS = createHomeStars();

export function HomeStarfield() {
  return (
    <div
      className="home-starfield"
      data-testid="home-starfield"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        {STARS.map((star, index) => (
          <circle
            key={index}
            className="home-star"
            cx={star.x}
            cy={star.y}
            r={star.radius}
            opacity={star.opacity}
          />
        ))}
      </svg>
    </div>
  );
}
