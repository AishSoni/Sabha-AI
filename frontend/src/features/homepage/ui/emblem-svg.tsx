import type { EmblemId } from "../presentation/emblems";

export function EmblemSvg({
  emblemId,
  className,
  variant = "card",
}: {
  emblemId: EmblemId;
  className?: string;
  variant?: "card" | "glyph";
}) {
  const base =
    variant === "glyph" ? "home-emblem home-emblem--glyph" : "home-emblem";
  return (
    <svg
      viewBox="0 0 100 100"
      className={className ? `${base} ${className}` : base}
      aria-hidden="true"
      focusable="false"
    >
      <use
        href={`#home-emblem-${variant === "glyph" ? "glyph" : "card"}-${emblemId}`}
      />
    </svg>
  );
}
