import { readableTextOn } from "@/lib/readable-color";

import { dynamiteMarkFor } from "./dynamite-marks";

type MarkSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<MarkSize, string> = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

const GLYPH_CLASS: Record<MarkSize, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
  lg: "h-9 w-9",
};

/**
 * The visible name and role carry identity. The mark is a stable, decorative
 * companion derived from the immutable participant id, never a replacement for
 * the name or a claim about the participant's status.
 */
export function ParticipantMark({
  participant,
  size = "md",
}: {
  participant: { id: string; name: string; color: string };
  size?: MarkSize;
}) {
  const mark = dynamiteMarkFor(participant.id);
  return (
    <span
      aria-hidden="true"
      data-participant-mark={mark.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${SIZE_CLASS[size]}`}
      style={{
        backgroundColor: participant.color,
        color: readableTextOn(participant.color),
      }}
    >
      <svg
        viewBox="0 0 200 200"
        className={GLYPH_CLASS[size]}
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={mark.path} />
      </svg>
    </span>
  );
}

/** The director gets a mark from the same family, not a letter avatar. */
export function DirectorMark({ size = "md" }: { size?: MarkSize }) {
  const mark = dynamiteMarkFor("sabha-director");
  return (
    <span
      aria-hidden="true"
      data-participant-mark={mark.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-action text-action-foreground ${SIZE_CLASS[size]}`}
    >
      <svg
        viewBox="0 0 200 200"
        className={GLYPH_CLASS[size]}
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={mark.path} />
      </svg>
    </span>
  );
}
