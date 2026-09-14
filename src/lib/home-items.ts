import { findPetSpawn, type PetFootprint } from "./pet-placement";
import type { WanderObstacle } from "./wander";

export type CleanableKind = "poop" | "trash";
export type CleanableItem = { id: string; kind: CleanableKind; x: number; z: number; createdAt: number; petId?: string };
export type HomeCare = {
  coins: number;
  items: CleanableItem[];
  activeMsByPet: Record<string, number>;
  trashRemainingMs: number;
  accountedThrough: number;
};
export type CareTick = {
  from: number;
  to: number;
  pets: (PetFootprint & { id: string; active: boolean; yaw: number })[];
  obstacles: WanderObstacle[];
};
export const CLEAN_REWARD = 5;
export const PET_ACTIVE_MS = 2 * 60 * 60 * 1000;
export const MAX_CLEANABLES = 12;
export const CLEANABLE_RADIUS = 0.28;
export const CARE_TICK_MS = 5000;

export function createHomeCare(random = Math.random): HomeCare {
  return { coins: 0, items: [], activeMsByPet: {}, trashRemainingMs: (30 + random() * 30) * 1000, accountedThrough: 0 };
}

export function findCleanableSpot(tick: CareTick, items: readonly CleanableItem[], near?: CareTick["pets"][number], random = Math.random) {
  const radius = CLEANABLE_RADIUS;
  const obstacles = [
    ...tick.obstacles.map((o) => ({ minX: o.minX - radius - .1, maxX: o.maxX + radius + .1, minZ: o.minZ - radius - .1, maxZ: o.maxZ + radius + .1 })),
    // Match the conservative boxes used in navigation so a new pile cannot
    // surround a pet's current position and leave it unable to walk away.
    ...tick.pets.map((p) => ({ minX: p.x - p.radius - radius - .1, maxX: p.x + p.radius + radius + .1, minZ: p.z - p.radius - radius - .1, maxZ: p.z + p.radius + radius + .1 })),
  ];
  const others = [...tick.pets, ...items.map((item) => ({ ...item, radius }))];
  // Prefer the floor just behind the pet; never create a pile inside its feet.
  if (near) for (let i = 0; i < 16; i++) {
    const angle = near.yaw + Math.PI + i * Math.PI / 8;
    const distance = near.radius + radius + .24;
    const x = near.x + Math.sin(angle) * distance, z = near.z + Math.cos(angle) * distance;
    if (Math.abs(x) < 5.4 && Math.abs(z) < 5.4 && !obstacles.some((o) => x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ) && others.every((p) => Math.hypot(x - p.x, z - p.z) >= radius + p.radius + .18)) return { x, z };
  }
  return findPetSpawn(5.4, obstacles, radius, others, false, random);
}

/** Only elapsed, visible play time is submitted. Overlapping tabs cannot count it twice. */
export function advanceHomeCare(state: HomeCare, tick: CareTick, random = Math.random): HomeCare {
  const elapsed = Math.max(0, Math.min(CARE_TICK_MS + 1000, tick.to - Math.max(tick.from, state.accountedThrough)));
  if (!Number.isFinite(elapsed) || elapsed === 0) return state;
  const next: HomeCare = { ...state, items: [...state.items], activeMsByPet: { ...state.activeMsByPet }, accountedThrough: tick.to };
  for (const pet of tick.pets) {
    if (!pet.active) continue;
    const active = Math.min(PET_ACTIVE_MS, (next.activeMsByPet[pet.id] ?? 0) + elapsed);
    next.activeMsByPet[pet.id] = active;
    if (active < PET_ACTIVE_MS || next.items.length >= MAX_CLEANABLES) continue;
    const position = findCleanableSpot(tick, next.items, pet, random);
    if (!position) continue;
    next.items.push({ id: `poop:${pet.id}:${tick.to}`, kind: "poop", petId: pet.id, ...position, createdAt: tick.to });
    next.activeMsByPet[pet.id] = 0;
  }
  next.trashRemainingMs = Math.max(0, next.trashRemainingMs - elapsed);
  if (next.trashRemainingMs === 0 && next.items.length < MAX_CLEANABLES) {
    const position = findCleanableSpot(tick, next.items, undefined, random);
    if (position) {
      next.items.push({ id: `trash:${tick.to}`, kind: "trash", ...position, createdAt: tick.to });
      next.trashRemainingMs = (3 + random() * 3) * 60 * 1000;
    }
  }
  return next;
}

export function cleanHomeItem(state: HomeCare, id: string): HomeCare {
  if (!state.items.some((item) => item.id === id)) return state;
  return { ...state, coins: state.coins + CLEAN_REWARD, items: state.items.filter((item) => item.id !== id) };
}
