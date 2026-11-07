export type EmblemMode = "fill" | "stroke";

export interface EmblemPart {
  readonly d: string;
  readonly mode: EmblemMode;
  readonly opacity?: number;
  readonly width?: number;
}

export interface Emblem {
  readonly id: string;
  readonly accent: string;
  readonly parts: readonly EmblemPart[];
}

/**
 * Original persona sigils for the homepage field.
 *
 * Each sigil is an authored geometric sketch of an archetype someone might
 * bring into a meeting. They are intentionally unnamed on the public page and
 * are not tied to a roster or a recorded participant.
 */
export const EMBLEMS = [
  {
    id: "strategist",
    accent: "#c4b5fd",
    parts: [
      {
        mode: "fill",
        d: "M50 12 L60 40 L88 50 L60 60 L50 88 L40 60 L12 50 L40 40 Z",
      },
      { mode: "stroke", d: "M50 36 V64", width: 2.4 },
      { mode: "stroke", d: "M36 50 H64", width: 2.4 },
    ],
  },
  {
    id: "investor",
    accent: "#f0abfc",
    parts: [
      { mode: "fill", d: "M24 82 H34 V62 H24 Z" },
      { mode: "fill", d: "M45 82 H55 V48 H45 Z" },
      { mode: "fill", d: "M66 82 H76 V34 H66 Z" },
      { mode: "stroke", d: "M22 52 L42 36 L56 44 L78 24", width: 2.6 },
      { mode: "fill", d: "M78 20 L82 28 L74 28 Z" },
    ],
  },
  {
    id: "operator",
    accent: "#93c5fd",
    parts: [
      { mode: "stroke", d: "M50 16 L80 33 V67 L50 84 L20 67 V33 Z", width: 2.2 },
      { mode: "fill", d: "M55 32 L39 56 H50 L45 80 L65 48 H54 Z" },
    ],
  },
  {
    id: "analyst",
    accent: "#67e8f9",
    parts: [
      { mode: "stroke", d: "M50 18 L84 84 H16 Z", width: 2.2 },
      { mode: "stroke", d: "M50 42 V84", width: 1.8 },
      { mode: "stroke", d: "M32 64 H68", width: 1.8 },
      { mode: "fill", d: "M50 48 L60 66 H40 Z", opacity: 0.85 },
    ],
  },
  {
    id: "engineer",
    accent: "#a5b4fc",
    parts: [
      { mode: "stroke", d: "M32 22 H16 V78 H32", width: 2.4 },
      { mode: "stroke", d: "M68 22 H84 V78 H68", width: 2.4 },
      { mode: "fill", d: "M40 42 H60 V58 H40 Z" },
      { mode: "stroke", d: "M46 42 V30", width: 2 },
      { mode: "stroke", d: "M54 42 V30", width: 2 },
      { mode: "stroke", d: "M46 58 V70", width: 2 },
      { mode: "stroke", d: "M54 58 V70", width: 2 },
    ],
  },
  {
    id: "designer",
    accent: "#fda4af",
    parts: [
      { mode: "fill", d: "M50 14 L76 58 L50 86 L24 58 Z" },
      { mode: "stroke", d: "M50 14 V42", width: 2.2 },
      {
        mode: "stroke",
        d: "M50 54 m-12 0 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0",
        width: 2.2,
      },
    ],
  },
  {
    id: "legal",
    accent: "#fcd34d",
    parts: [
      { mode: "stroke", d: "M50 18 V84", width: 2.6 },
      { mode: "stroke", d: "M24 32 H76", width: 2.6 },
      { mode: "stroke", d: "M24 32 L14 52 H34 Z", width: 2.2 },
      { mode: "stroke", d: "M76 32 L66 52 H86 Z", width: 2.2 },
      { mode: "fill", d: "M34 84 H66 V90 H34 Z" },
    ],
  },
  {
    id: "scientist",
    accent: "#6ee7b7",
    parts: [
      { mode: "stroke", d: "M40 18 H60 V42 L78 82 H22 L40 42 Z", width: 2.2 },
      { mode: "fill", d: "M28 70 H72 L78 82 H22 Z", opacity: 0.7 },
      {
        mode: "stroke",
        d: "M50 54 m-24 0 a24 13 0 1 0 48 0 a24 13 0 1 0 -48 0",
        width: 2,
      },
      { mode: "fill", d: "M50 47 A5 5 0 1 1 49.9 47 Z" },
    ],
  },
  {
    id: "writer",
    accent: "#fbcfe8",
    parts: [
      { mode: "stroke", d: "M28 16 H62 L74 28 V84 H28 Z", width: 2.2 },
      { mode: "stroke", d: "M40 38 H62", width: 1.8 },
      { mode: "stroke", d: "M40 50 H62", width: 1.8 },
      { mode: "stroke", d: "M40 62 H56", width: 1.8 },
      { mode: "fill", d: "M52 76 L74 42 L66 38 L44 72 Z", opacity: 0.85 },
    ],
  },
  {
    id: "founder",
    accent: "#fdba74",
    parts: [
      {
        mode: "fill",
        d: "M50 12 C68 28 72 52 64 74 H36 C28 52 32 28 50 12 Z",
      },
      {
        mode: "stroke",
        d: "M50 34 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0",
        width: 2.2,
      },
      { mode: "stroke", d: "M36 58 L20 76 L36 72", width: 2.2 },
      { mode: "stroke", d: "M64 58 L80 76 L64 72", width: 2.2 },
      { mode: "fill", d: "M42 74 H58 L50 92 Z", opacity: 0.8 },
    ],
  },
  {
    id: "researcher",
    accent: "#bae6fd",
    parts: [
      {
        mode: "stroke",
        d: "M16 28 C30 22 42 26 50 34 C58 26 70 22 84 28 V76 C70 70 58 72 50 80 C42 72 30 70 16 76 Z",
        width: 2.2,
      },
      { mode: "stroke", d: "M50 34 V80", width: 1.8 },
      {
        mode: "stroke",
        d: "M64 54 m-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0",
        width: 2,
      },
      { mode: "stroke", d: "M72 62 L82 72", width: 2.4 },
    ],
  },
  {
    id: "marketer",
    accent: "#f9a8d4",
    parts: [
      { mode: "fill", d: "M22 42 L58 26 V74 L22 58 Z" },
      { mode: "stroke", d: "M30 58 L38 80 H50 L42 60", width: 2.2 },
      { mode: "stroke", d: "M66 34 C76 42 76 58 66 66", width: 2.2 },
      { mode: "stroke", d: "M74 26 C88 38 88 62 74 74", width: 2.2 },
    ],
  },
  {
    id: "finance",
    accent: "#fde68a",
    parts: [
      {
        mode: "stroke",
        d: "M50 26 m-24 0 a24 10 0 1 0 48 0 a24 10 0 1 0 -48 0",
        width: 2,
      },
      {
        mode: "stroke",
        d: "M26 42 C26 48 38 54 50 54 C62 54 74 48 74 42",
        width: 2,
      },
      {
        mode: "stroke",
        d: "M26 58 C26 64 38 70 50 70 C62 70 74 64 74 58",
        width: 2,
      },
      { mode: "fill", d: "M26 78 H74 V84 H26 Z" },
    ],
  },
  {
    id: "risk",
    accent: "#fca5a5",
    parts: [
      {
        mode: "stroke",
        d: "M50 14 L82 27 V52 C82 70 67 84 50 90 C33 84 18 70 18 52 V27 Z",
        width: 2.2,
      },
      { mode: "fill", d: "M46 32 H54 L52 62 H48 Z" },
      { mode: "fill", d: "M46 70 H54 V78 H46 Z" },
    ],
  },
  {
    id: "product",
    accent: "#c4b5fd",
    parts: [
      { mode: "stroke", d: "M50 16 L82 34 V66 L50 84 L18 66 V34 Z", width: 2.2 },
      { mode: "stroke", d: "M18 34 L50 52 L82 34", width: 2 },
      { mode: "stroke", d: "M50 52 V84", width: 2 },
      { mode: "fill", d: "M50 16 L82 34 L50 52 L18 34 Z", opacity: 0.34 },
    ],
  },
  {
    id: "data",
    accent: "#7dd3fc",
    parts: [
      { mode: "stroke", d: "M26 28 L50 50 L74 28", width: 2 },
      { mode: "stroke", d: "M26 72 L50 50 L74 72", width: 2 },
      { mode: "stroke", d: "M26 28 V72", width: 2 },
      { mode: "stroke", d: "M74 28 V72", width: 2 },
      { mode: "fill", d: "M26 22 A6 6 0 1 1 25.9 22 Z" },
      { mode: "fill", d: "M74 22 A6 6 0 1 1 73.9 22 Z" },
      { mode: "fill", d: "M50 44 A6 6 0 1 1 49.9 44 Z" },
      { mode: "fill", d: "M26 66 A6 6 0 1 1 25.9 66 Z" },
      { mode: "fill", d: "M74 66 A6 6 0 1 1 73.9 66 Z" },
    ],
  },
  {
    id: "people",
    accent: "#f5d0fe",
    parts: [
      {
        mode: "stroke",
        d: "M50 50 m-32 0 a32 18 0 1 0 64 0 a32 18 0 1 0 -64 0",
        width: 2,
      },
      {
        mode: "stroke",
        d: "M50 50 m-18 0 a18 32 0 1 0 36 0 a18 32 0 1 0 -36 0",
        width: 2,
      },
      { mode: "fill", d: "M50 16 A7 7 0 1 1 49.9 16 Z" },
      { mode: "fill", d: "M76 58 A7 7 0 1 1 75.9 58 Z" },
      { mode: "fill", d: "M28 62 A7 7 0 1 1 27.9 62 Z" },
    ],
  },
  {
    id: "wildcard",
    accent: "#fef08a",
    parts: [
      {
        mode: "fill",
        d: "M50 10 L58 38 L86 30 L66 50 L86 70 L58 62 L50 90 L42 62 L14 70 L34 50 L14 30 L42 38 Z",
      },
      { mode: "fill", d: "M50 44 A6 6 0 1 1 49.9 44 Z", opacity: 0.9 },
    ],
  },
] as const satisfies readonly Emblem[];

export type EmblemId = (typeof EMBLEMS)[number]["id"];

export function emblemById(id: EmblemId): Emblem {
  return EMBLEMS.find((emblem) => emblem.id === id) ?? EMBLEMS[0];
}

export function emblemSvgMarkup(
  emblem: Emblem,
  options: {
    color?: string;
    size?: number;
  } = {},
): string {
  const { color = "#ffffff", size = 256 } = options;

  const parts = emblem.parts
    .map((part) => {
      if (part.mode === "fill") {
        return `<path d="${part.d}" fill="${color}" fill-rule="evenodd"${
          part.opacity ? ` opacity="${part.opacity}"` : ""
        }/>`;
      }
      return `<path d="${part.d}" fill="none" stroke="${color}" stroke-width="${
        part.width ?? 2.4
      }" stroke-linecap="round" stroke-linejoin="round"${
        part.opacity ? ` opacity="${part.opacity}"` : ""
      }/>`;
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">`,
    parts,
    "</svg>",
  ].join("");
}
