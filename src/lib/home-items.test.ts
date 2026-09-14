import { describe, expect, it } from "vitest";
import { Box3 } from "three";
import { createCleanableModel } from "./cleanable-model";
import { disposeObject } from "./model";
import { advanceHomeCare, CARE_TICK_MS, CLEAN_REWARD, cleanHomeItem, createHomeCare, findCleanableSpot, MAX_CLEANABLES, PET_ACTIVE_MS, type CareTick, type CleanableItem } from "./home-items";

const pet = { id: "frog", x: 0, z: 0, radius: .6, yaw: 0, active: true };
const tick: CareTick = { from: 1000, to: 1000 + CARE_TICK_MS, pets: [pet], obstacles: [] };
const item: CleanableItem = { id: "a", kind: "trash", x: 3, z: 3, createdAt: 0 };

describe("home care", () => {
  it("releases a pile at two accumulated active hours, preserving the remainder before it", () => {
    const state = createHomeCare(); state.activeMsByPet.frog = PET_ACTIVE_MS - CARE_TICK_MS - 1;
    const before = advanceHomeCare(state, tick);
    expect(before.items).toHaveLength(0);
    expect(before.activeMsByPet.frog).toBe(PET_ACTIVE_MS - 1);
    const after = advanceHomeCare(before, { ...tick, from: tick.to, to: tick.to + CARE_TICK_MS });
    expect(after.items[0]).toMatchObject({ kind: "poop", petId: "frog" });
    expect(after.activeMsByPet.frog).toBe(0);
    expect(Math.hypot(after.items[0].x, after.items[0].z)).toBeGreaterThan(pet.radius + .28);
  });
  it("does not age stopped pets or let later imports inherit another pet's activity", () => {
    const state = createHomeCare(); state.activeMsByPet.frog = 12000;
    const next = advanceHomeCare(state, { ...tick, pets: [{ ...pet, active: false }, { ...pet, id: "new", x: 2 }] });
    expect(next.activeMsByPet).toEqual({ frog: 12000, new: CARE_TICK_MS });
  });
  it("does not turn closed-page time into active hours and ignores duplicate/overlapping tab ticks", () => {
    const next = advanceHomeCare(createHomeCare(), { ...tick, to: tick.from + PET_ACTIVE_MS * 4 });
    expect(next.activeMsByPet.frog).toBeLessThanOrEqual(CARE_TICK_MS + 1000);
    expect(advanceHomeCare(next, tick)).toBe(next);
    const first = advanceHomeCare(createHomeCare(), tick);
    const overlap = advanceHomeCare(first, { ...tick, from: tick.from + 1000, to: tick.to + 1000 });
    expect(overlap.activeMsByPet.frog).toBe(CARE_TICK_MS + 1000);
  });
  it("spawns paper at a random interval and restarts its timer", () => {
    const state = { ...createHomeCare(), trashRemainingMs: 1000 };
    const next = advanceHomeCare(state, tick, () => .8);
    expect(next.items[0].kind).toBe("trash");
    expect(next.trashRemainingMs).toBeGreaterThanOrEqual(180000);
    expect(next.trashRemainingMs).toBeLessThanOrEqual(360000);
  });
  it("avoids furniture, existing piles, pets and floor edges, even with repeated random samples", () => {
    const obstacles = [{ minX: -2, maxX: 2, minZ: -2, maxZ: 2 }];
    const point = findCleanableSpot({ ...tick, obstacles }, [item], pet, () => .5)!;
    expect(point).not.toBeNull();
    expect(Math.abs(point.x)).toBeLessThanOrEqual(5.4);
    expect(Math.abs(point.z)).toBeLessThanOrEqual(5.4);
    expect(Math.abs(point.x) > 2.38 || Math.abs(point.z) > 2.38).toBe(true);
    expect(Math.hypot(point.x - item.x, point.z - item.z)).toBeGreaterThan(.74);
  });
  it("never places a pile around the pet's current navigation box, including diagonal facings", () => {
    for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 16) {
      const currentPet = { ...pet, yaw };
      const point = findCleanableSpot({ ...tick, pets: [currentPet] }, [], currentPet, () => .5)!;
      const padding = pet.radius + .28 + .1;
      expect(Math.abs(point.x - pet.x) > padding || Math.abs(point.z - pet.z) > padding).toBe(true);
    }
  });
  it.each(["poop", "trash"] as const)("keeps the entire %s model above the floor", (kind) => {
    const model = createCleanableModel({ ...item, kind });
    expect(new Box3().setFromObject(model).min.y).toBeGreaterThanOrEqual(0);
    disposeObject(model);
  });
  it("keeps due activity until space is available instead of spawning inside furniture", () => {
    const state = { ...createHomeCare(), activeMsByPet: { frog: PET_ACTIVE_MS }, trashRemainingMs: 0 };
    const next = advanceHomeCare(state, { ...tick, obstacles: [{ minX: -6, maxX: 6, minZ: -6, maxZ: 6 }] });
    expect(next.items).toHaveLength(0); expect(next.activeMsByPet.frog).toBe(PET_ACTIVE_MS);
  });
  it("caps accumulated clutter and resumes spawning after a clean", () => {
    const state = { ...createHomeCare(), trashRemainingMs: 0, items: Array.from({ length: MAX_CLEANABLES }, (_, i) => ({ ...item, id: String(i) })) };
    const next = advanceHomeCare(state, tick);
    expect(next.items).toHaveLength(MAX_CLEANABLES);
    const cleaned = cleanHomeItem(next, "0");
    expect(advanceHomeCare(cleaned, { ...tick, from: tick.to, to: tick.to + CARE_TICK_MS }).items).toHaveLength(MAX_CLEANABLES);
  });
  it("rewards each item exactly once and preserves other items and progress", () => {
    const state = { ...createHomeCare(), items: [item, { ...item, id: "b", kind: "poop" as const }] };
    const cleaned = cleanHomeItem(state, item.id);
    expect(cleaned.coins).toBe(CLEAN_REWARD);
    expect(cleaned.items.map((x) => x.id)).toEqual(["b"]);
    expect(cleanHomeItem(cleaned, item.id)).toBe(cleaned);
    expect(cleanHomeItem(cleaned, "b").coins).toBe(CLEAN_REWARD * 2);
    expect(state.items).toHaveLength(2);
  });
});
