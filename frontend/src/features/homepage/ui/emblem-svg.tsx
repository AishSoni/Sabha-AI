import type { EmblemId } from "../presentation/emblems";

export function EmblemSvg({
  emblemId,
  className,
}: {
  emblemId: EmblemId;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={className ? `home-emblem ${className}` : "home-emblem"}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`#home-emblem-card-${emblemId}`} />
    </svg>
  );
}
