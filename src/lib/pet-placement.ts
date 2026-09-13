import type { WanderObstacle } from "./wander";

export type PetFootprint = { x: number; z: number; radius: number };
// Both radii already include the animated feet's reach.
export const PET_GAP = 0.18;

export function findPetSpawn(
  bound: number,
  obstacles: readonly WanderObstacle[],
  radius: number,
  others: readonly PetFootprint[],
  preferCenter: boolean,
  random: () => number = Math.random,
): { x: number; z: number } | null {
  const free = (x: number, z: number) =>
    Math.abs(x) <= bound && Math.abs(z) <= bound &&
    !obstacles.some((o) => x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ) &&
    others.every((pet) => Math.hypot(x - pet.x, z - pet.z) >= radius + pet.radius + PET_GAP);

  if (preferCenter) {
    if (free(0, 0)) return { x: 0, z: 0 };
    // Search outwards from the actual center; do not move furniture to make room.
    for (let distance = 0.05; distance <= bound * Math.SQRT2; distance += 0.05) {
      for (let direction = 0; direction < 64; direction += 1) {
        const angle = direction * Math.PI / 32;
        const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
        if (free(x, z)) return { x, z };
      }
    }
  } else {
    for (let attempt = 0; attempt < 96; attempt += 1) {
      const x = (random() * 2 - 1) * bound, z = (random() * 2 - 1) * bound;
      if (free(x, z)) return { x, z };
    }
    // A bounded fallback also works with an unlucky or repeated random value.
    const candidates: { x: number; z: number }[] = [];
    for (let x = -bound; x <= bound; x += 0.2) {
      for (let z = -bound; z <= bound; z += 0.2) {
        if (free(x, z)) candidates.push({ x, z });
      }
    }
    if (candidates.length) return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  }
  return null;
}
