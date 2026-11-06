import type { EmblemId } from "../presentation/emblems";
import { emblemById } from "../presentation/emblems";

export function EmblemSvg({
  emblemId,
  className,
}: {
  emblemId: EmblemId;
  className?: string;
}) {
  const emblem = emblemById(emblemId);

  return (
    <svg
      viewBox="0 0 100 100"
      className={className ? `home-emblem ${className}` : "home-emblem"}
      aria-hidden="true"
      focusable="false"
    >
      <circle className="home-emblem__disc" cx="50" cy="50" r="44" />
      <path className="home-emblem__fill" d={emblem.fill} fillRule="evenodd" />
      {emblem.strokes.map((path) => (
        <path key={path} className="home-emblem__stroke" d={path} />
      ))}
    </svg>
  );
}
