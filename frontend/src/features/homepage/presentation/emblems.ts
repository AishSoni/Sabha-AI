export type EmblemPaint = "fill" | "stroke" | "soft";

export interface Emblem {
  readonly id: string;
  readonly fill: string;
  readonly strokes: readonly string[];
}

/**
 * Original abstract role emblems for the homepage field.
 *
 * These are intentionally unnamed and not tied to a roster or recording. The
 * shapes are authored geometry, not third-party artwork.
 */
export const EMBLEMS = [
  {
    id: "prism",
    fill: "M50 12 L88 80 H12 Z",
    strokes: ["M50 12 V80", "M30 46 H70", "M12 80 H88"],
  },
  {
    id: "orbit",
    fill: "M50 38 A12 12 0 1 1 49.99 38 Z",
    strokes: [
      "M50 50 m-38 0 a38 22 0 1 0 76 0 a38 22 0 1 0 -76 0",
      "M18 70 L82 30",
      "M78 50 A28 16 0 1 1 22 50 A28 16 0 1 1 78 50",
    ],
  },
  {
    id: "ledger",
    fill: "M22 22 H78 V38 H22 Z M22 44 H62 V60 H22 Z M22 66 H72 V82 H22 Z",
    strokes: ["M22 22 H78", "M22 82 H72", "M30 30 H70"],
  },
  {
    id: "compass",
    fill: "M50 10 L82 50 L50 90 L18 50 Z",
    strokes: [
      "M50 22 V78",
      "M30 50 H70",
      "M50 30 L60 54 L50 70 L40 54 Z",
    ],
  },
  {
    id: "wave",
    fill: "M10 58 C26 38 40 38 54 52 C66 64 78 64 90 48 V70 C74 86 60 86 46 72 C34 60 22 60 10 76 Z",
    strokes: [
      "M10 46 C26 26 40 26 54 40 C66 52 78 52 90 36",
      "M10 58 C26 38 40 38 54 52 C66 64 78 64 90 48",
      "M10 70 C26 50 40 50 54 64 C66 76 78 76 90 60",
    ],
  },
  {
    id: "quadrant",
    fill: "M50 50 L50 10 A40 40 0 0 1 90 50 Z",
    strokes: [
      "M18 18 H82 V82 H18 Z",
      "M50 18 V50 H82",
      "M18 82 L82 18",
    ],
  },
  {
    id: "lens",
    fill: "M50 18 C72 34 72 66 50 82 C28 66 28 34 50 18 Z",
    strokes: [
      "M50 50 m-34 0 a34 34 0 1 0 68 0 a34 34 0 1 0 -68 0",
      "M50 26 V74",
      "M28 50 H72",
    ],
  },
  {
    id: "seed",
    fill: "M50 12 C68 34 80 48 80 62 A30 30 0 0 1 20 62 C20 48 32 34 50 12 Z",
    strokes: ["M50 30 V74", "M32 48 L68 60", "M68 48 L32 60"],
  },
] as const satisfies readonly Emblem[];

export type EmblemId = (typeof EMBLEMS)[number]["id"];

export function emblemById(id: EmblemId): Emblem {
  return EMBLEMS.find((emblem) => emblem.id === id) ?? EMBLEMS[0];
}

export function emblemSvgMarkup(
  emblem: Emblem,
  options: {
    fill?: string;
    stroke?: string;
    soft?: string;
    size?: number;
  } = {},
): string {
  const {
    fill = "#ffffff",
    stroke = "#ffffff",
    soft = "rgba(255,255,255,0.12)",
    size = 256,
  } = options;

  const strokes = emblem.strokes
    .map(
      (path) =>
        `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">`,
    `<circle cx="50" cy="50" r="44" fill="${soft}"/>`,
    `<path d="${emblem.fill}" fill="${fill}" fill-rule="evenodd"/>`,
    strokes,
    "</svg>",
  ].join("");
}
