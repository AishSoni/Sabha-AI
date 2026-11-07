export interface HomeCtaParticle {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly duration: number;
  readonly delay: number;
  readonly opacity: number;
  readonly tone: "lilac" | "violet";
}

const PARTICLE_SEED = 0x5ab4a;
const PARTICLE_COUNT = 34;

/**
 * Deterministic halo around the demo CTA. The field is wider than it is tall
 * so the particles stay around the pill instead of climbing into the
 * headline.
 */
export function createHomeCtaParticles(
  count = PARTICLE_COUNT,
  seed = PARTICLE_SEED,
): readonly HomeCtaParticle[] {
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  return Array.from({ length: count }, (_, index) => {
    const angle = random() * Math.PI * 2;
    const radius = 92 + random() * 138;

    return {
      id: index,
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius * 0.78),
      size: Math.round((1.2 + random() * 2.4) * 100) / 100,
      duration: Math.round((3.4 + random() * 4) * 100) / 100,
      delay: Math.round(-random() * 8 * 100) / 100,
      opacity: Math.round((0.17 + random() * 0.39) * 100) / 100,
      tone: random() > 0.5 ? "lilac" : "violet",
    };
  });
}

export const HOME_CTA_PARTICLES = createHomeCtaParticles();
