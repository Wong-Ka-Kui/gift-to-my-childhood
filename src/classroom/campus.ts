import type { WanderObstacle } from "../lib/wander";
import type { PetFootprint } from "../lib/pet-placement";
import { PET_GAP } from "../lib/pet-placement";
import { CLASSROOM_SIZE } from "./model";

/** Place floor-standing visitors without intersecting furniture, walls or one another. */
export function findClassroomSpot(radius: number, obstacles: readonly WanderObstacle[], others: readonly PetFootprint[], index: number) {
  const boundX = CLASSROOM_SIZE.width / 2 - radius - .22;
  const boundZ = CLASSROOM_SIZE.depth / 2 - radius - .22;
  const free = (x: number, z: number) => Math.abs(x) <= boundX && Math.abs(z) <= boundZ &&
    !obstacles.some(o => x > o.minX - radius - .12 && x < o.maxX + radius + .12 && z > o.minZ - radius - .12 && z < o.maxZ + radius + .12) &&
    others.every(p => Math.hypot(x - p.x, z - p.z) >= radius + p.radius + PET_GAP);
  const preferred = [{ x: -3.55, z: 2.25 }, { x: 3.55, z: 2.15 }, { x: 0, z: .25 }][index % 3];
  const candidates = [preferred];
  for (let x = -boundX; x <= boundX; x += .12) for (let z = -boundZ; z <= boundZ; z += .12) candidates.push({ x, z });
  candidates.sort((a, b) => Math.hypot(a.x - preferred.x, a.z - preferred.z) - Math.hypot(b.x - preferred.x, b.z - preferred.z));
  return candidates.find(p => free(p.x, p.z)) ?? null;
}
