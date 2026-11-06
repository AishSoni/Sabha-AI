export interface HomeStar {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly opacity: number;
}

const STAR_SEED = 0x5ab4a;
const STAR_COUNT = 72;

export function createHomeStars(
  seed = STAR_SEED,
  count = STAR_COUNT,
): readonly HomeStar[] {
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  return Array.from({ length: count }, () => {
    const depth = random();
    return {
      x: Math.round(random() * 1600),
      y: Math.round(random() * 1000),
      radius: 0.45 + depth * 1.05,
      opacity: 0.18 + depth * 0.44,
    };
  });
}
