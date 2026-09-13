import { describe, expect, it } from "vitest";
import { createWander, stepWander, type WanderObstacle } from "./wander";

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

describe("pet wandering", () => {
  it("starts outside furniture when the animated-foot clearance covers the center", () => {
    const obstacles = [{ minX: -2, maxX: 0.18, minZ: -0.14, maxZ: 3 }];
    const state = createWander(4.8, () => 0.8, obstacles);
    const inside = (x: number, z: number) => obstacles.some((o) => x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ);
    expect(inside(state.x, state.z)).toBe(false);
    expect(Math.hypot(state.x, state.z)).toBeLessThan(0.6);
    for (let frame = 0; frame < 1200; frame += 1) {
      stepWander(state, 1 / 60, () => 0.8);
      expect(inside(state.x, state.z)).toBe(false);
    }
  });

  it("starts in the center and visits multiple places while staying inside the room", () => {
    const random = seededRandom(23);
    const state = createWander(5, random);
    expect([state.x, state.z]).toEqual([0, 0]);
    let distance = 0;
    let pauses = 0;
    for (let frame = 0; frame < 36000; frame += 1) {
      const previous = { x: state.x, z: state.z, wait: state.wait };
      stepWander(state, 1 / 60, random);
      distance += Math.hypot(state.x - previous.x, state.z - previous.z);
      if (!previous.wait && state.wait) pauses += 1;
      expect(Math.abs(state.x)).toBeLessThanOrEqual(state.bound);
      expect(Math.abs(state.z)).toBeLessThanOrEqual(state.bound);
      expect(Math.abs(state.targetX)).toBeLessThanOrEqual(state.bound);
      expect(Math.abs(state.targetZ)).toBeLessThanOrEqual(state.bound);
    }
    // Longer idle intervals reduce total travel while preserving movement.
    expect(distance).toBeGreaterThan(100);
    expect(pauses).toBeGreaterThan(10);
  });

  it("caps long frame gaps so returning to the tab does not teleport the pet", () => {
    const state = createWander(5);
    Object.assign(state, { wait: 0, targetX: 0, targetZ: 5 });
    stepWander(state, 30);
    expect(state.x).toBe(0);
    expect(state.z).toBeGreaterThan(0);
    expect(state.z).toBeLessThanOrEqual(0.08);
  });

  it("stops exactly at nearby destinations and rests before leaving again", () => {
    const state = createWander(5);
    Object.assign(state, { wait: 0, targetX: 0, targetZ: 0.01 });
    stepWander(state, 0.1, seededRandom(17));
    expect(state.x).toBe(0);
    expect(state.z).toBeCloseTo(0.01);
    expect(state.wait).toBeGreaterThan(0);
    const position = [state.x, state.z, state.yaw];
    const wait = state.wait;
    stepWander(state, 0.1);
    expect([state.x, state.z, state.yaw]).toEqual(position);
    expect(state.wait).toBeLessThan(wait);
  });

  it("turns along the short arc across the minus-pi/pi seam", () => {
    const state = createWander(5);
    const desiredYaw = -Math.PI + 0.15;
    Object.assign(state, {
      wait: 0,
      yaw: Math.PI - 0.15,
      targetX: Math.sin(desiredYaw) * 3,
      targetZ: Math.cos(desiredYaw) * 3,
    });
    stepWander(state, 0.02);
    // The shortest turn initially increases yaw toward +PI.
    expect(state.yaw).toBeGreaterThan(Math.PI - 0.15);
    expect([state.x, state.z]).toEqual([0, 0]);
    // Gentle stepping turns take longer than the old instant swivel.
    for (let frame = 0; frame < 24; frame += 1) stepWander(state, 0.02);
    expect(state.yaw).toBeCloseTo(desiredYaw);
    expect(state.z).toBeLessThan(0);
  });

  it("keeps zero-size rooms and invalid frame deltas stationary", () => {
    const blocked = createWander(0);
    const blockedStart = { ...blocked };
    stepWander(blocked, 1);
    expect(blocked).toEqual(blockedStart);
    const state = createWander(5);
    const start = { ...state };
    for (const dt of [0, -1, NaN, Infinity]) stepWander(state, dt);
    expect(state).toEqual(start);
  });

  it("favors long stationary intervals while retaining occasional walks", () => {
    const idle = createWander(4, () => 0.1);
    Object.assign(idle, { x: 0, z: 0, targetX: 0, targetZ: 0, wait: 0 });
    stepWander(idle, 1 / 60, () => 0.1);
    expect(idle.targetX).toBe(0);
    expect(idle.targetZ).toBe(0);
    expect(idle.wait).toBeGreaterThanOrEqual(2.8);

    const moving = createWander(4, () => 0.9);
    Object.assign(moving, { x: 0, z: 0, targetX: 0, targetZ: 0, wait: 0 });
    stepWander(moving, 1 / 60, () => 0.9);
    expect(Math.hypot(moving.targetX, moving.targetZ)).toBeGreaterThan(1);
    expect(moving.wait).toBeGreaterThanOrEqual(0.8);
    expect(moving.wait).toBeLessThanOrEqual(1.8);
  });

  it("can leave the center even when random repeatedly selects its current spot", () => {
    const state = createWander(4, () => 0.5);
    for (let frame = 0; frame < 300; frame += 1) {
      stepWander(state, 1 / 60, () => 0.5);
    }
    expect(Math.hypot(state.x, state.z)).toBeGreaterThan(1);
  });

  it("avoids crossing furniture throughout a long walk", () => {
    const obstacles: WanderObstacle[] = [
      { minX: 1.2, maxX: 2.8, minZ: -4, maxZ: 2 },
      { minX: -4, maxX: -1, minZ: 1, maxZ: 2.5 },
    ];
    const random = seededRandom(982);
    const state = createWander(5, random, obstacles);
    let distance = 0;
    for (let frame = 0; frame < 18000; frame += 1) {
      const previous = { x: state.x, z: state.z };
      stepWander(state, 1 / 60, random);
      distance += Math.hypot(state.x - previous.x, state.z - previous.z);
      // Check the movement segment, including its interior, against thick furniture.
      // Sample spacing is under 0.004 world units; furniture is at least 1 unit wide.
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const x = previous.x + (state.x - previous.x) * fraction;
        const z = previous.z + (state.z - previous.z) * fraction;
        for (const obstacle of obstacles) {
          const inside =
            x > obstacle.minX && x < obstacle.maxX &&
            z > obstacle.minZ && z < obstacle.maxZ;
          expect(inside).toBe(false);
        }
      }
      expect(Math.abs(state.x)).toBeLessThanOrEqual(5);
      expect(Math.abs(state.z)).toBeLessThanOrEqual(5);
    }
    expect(distance).toBeGreaterThan(45);
  });

  it("allows leaving a furniture edge but refuses to enter it", () => {
    const obstacle = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
    const state = createWander(5, seededRandom(14), [obstacle]);
    Object.assign(state, {
      x: -1,
      z: 0,
      targetX: -4,
      targetZ: 0,
      yaw: -Math.PI / 2,
      wait: 0,
    });
    stepWander(state, 0.1);
    expect(state.x).toBeLessThan(-1);

    Object.assign(state, {
      x: -1,
      targetX: 4,
      targetZ: 0,
      yaw: Math.PI / 2,
      wait: 0,
    });
    stepWander(state, 0.1, seededRandom(31));
    expect(state.x).toBe(-1);
    expect(state.wait).toBeGreaterThan(0);
    expect(state.targetX).toBeLessThanOrEqual(-1);
  });

  it("waits safely when furniture leaves no reachable destination", () => {
    const obstacles: WanderObstacle[] = [
      { minX: -5, maxX: -0.2, minZ: -5, maxZ: 5 },
      { minX: 0.2, maxX: 5, minZ: -5, maxZ: 5 },
      { minX: -5, maxX: 5, minZ: -5, maxZ: -0.2 },
      { minX: -5, maxX: 5, minZ: 0.2, maxZ: 5 },
    ];
    let calls = 0;
    const random = () => { calls += 1; return 0.8; };
    const state = createWander(5, random, obstacles);
    expect(calls).toBeLessThanOrEqual(48);
    expect([state.targetX, state.targetZ]).toEqual([0, 0]);
    state.wait = 0;
    calls = 0;
    stepWander(state, 0.1, random);
    expect(calls).toBeLessThanOrEqual(49);
    expect([state.x, state.z, state.targetX, state.targetZ]).toEqual([0, 0, 0, 0]);
    expect(state.wait).toBeGreaterThan(0);
  });
});
