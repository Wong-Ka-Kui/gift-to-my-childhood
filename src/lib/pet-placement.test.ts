import { describe, expect, it } from "vitest";
import { findPetSpawn, PET_GAP, type PetFootprint } from "./pet-placement";
import { createWander, resumeWander, stepWander } from "./wander";

function seededRandom(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
}

describe("multiple pet placement", () => {
  it("uses the exact center if free, or the nearest safe area beside furniture", () => {
    expect(findPetSpawn(5, [], 0.8, [], true)).toEqual({ x: 0, z: 0 });
    const obstacles = [{ minX: -3, maxX: 0.07, minZ: -1, maxZ: 3 }];
    const point = findPetSpawn(5, obstacles, 0.8, [], true)!;
    expect(point.x).toBeGreaterThan(0.07);
    expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(0.1);
  });

  it("randomly places subsequent pets clear of furniture, other pets and the edges", () => {
    const random = seededRandom(37);
    const originals = [{ minX: -5, maxX: -2, minZ: -4, maxZ: 2 }];
    const positions = new Set<string>();
    for (let run = 0; run < 80; run += 1) {
      const others: PetFootprint[] = [];
      for (const [index, radius] of [0.8, 1.05, 0.6].entries()) {
        const obstacles = originals.map((o) => ({ minX: o.minX - radius, maxX: o.maxX + radius, minZ: o.minZ - radius, maxZ: o.maxZ + radius }));
        const point = findPetSpawn(6 - radius, obstacles, radius, others, index === 0, random)!;
        expect(point).not.toBeNull();
        expect(Math.max(Math.abs(point.x), Math.abs(point.z)) + radius).toBeLessThanOrEqual(6);
        expect(obstacles.some((o) => point.x > o.minX && point.x < o.maxX && point.z > o.minZ && point.z < o.maxZ)).toBe(false);
        for (const other of others) expect(Math.hypot(point.x - other.x, point.z - other.z)).toBeGreaterThanOrEqual(radius + other.radius + PET_GAP);
        others.push({ ...point, radius });
        if (index) positions.add(`${point.x.toFixed(2)},${point.z.toFixed(2)}`);
      }
    }
    expect(positions.size).toBeGreaterThan(100);
  });

  it("falls back after unlucky random choices and reports a genuinely full floor", () => {
    const others = [{ x: 0, z: 0, radius: 1 }];
    const point = findPetSpawn(4, [], 1, others, false, () => 0.5)!;
    expect(Math.hypot(point.x, point.z)).toBeGreaterThanOrEqual(2 + PET_GAP);
    const all = [{ minX: -5, maxX: 5, minZ: -5, maxZ: 5 }];
    expect(findPetSpawn(4, all, 0.8, [], false)).toBeNull();
    expect(findPetSpawn(4, all, 0.8, [], true)).toBeNull();
  });

  it("keeps three wandering pets separated, including when one is stopped", () => {
    const random = seededRandom(854);
    const radius = 0.81;
    const obstacles = [{ minX: -4, maxX: -1.5, minZ: -3, maxZ: 1 }];
    const states = [{ x: 0, z: 0 }, { x: 3, z: 2 }, { x: 1, z: -3 }].map((p) => createWander(4.5, random, obstacles, p));
    let distance = 0;
    for (let frame = 0; frame < 18000; frame += 1) {
      states.forEach((state, index) => {
        const before = { x: state.x, z: state.z };
        state.neighbors = states.filter((other) => other !== state).map((other) => ({ x: other.x, z: other.z, radius: radius * 2 + PET_GAP }));
        if (index !== 0 || frame > 3000) stepWander(state, 1 / 60, random);
        distance += Math.hypot(state.x - before.x, state.z - before.z);
        for (const other of states.filter((other) => other !== state)) {
          expect(Math.hypot(state.x - other.x, state.z - other.z)).toBeGreaterThanOrEqual(radius * 2 + PET_GAP - 1e-8);
        }
      });
      if (frame === 3000) expect([states[0].x, states[0].z]).toEqual([0, 0]);
    }
    expect(distance).toBeGreaterThan(75);
  });

  it("resumes from a long rest with a reachable destination immediately", () => {
    const state = createWander(5);
    Object.assign(state, { wait: 100, x: 0, z: 0, targetX: 0, targetZ: 0 });
    state.neighbors = [{ x: 0, z: 2.5, radius: 1.8 }];
    resumeWander(state, seededRandom(4));
    expect(state.wait).toBe(0);
    expect(Math.hypot(state.targetX, state.targetZ)).toBeGreaterThan(0.5);
    for (let frame = 0; frame < 300; frame += 1) stepWander(state, 1 / 60);
    expect(Math.hypot(state.x, state.z)).toBeGreaterThan(0.1);
  });
});
