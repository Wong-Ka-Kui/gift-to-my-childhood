import { describe, expect, it } from "vitest";
import { expandedFurnitureObstacles, furnitureObstacle, placementProblem, type PlacedFurniture } from "./furniture-layout";
import { createWander, stepWander } from "./wander";

const table: PlacedFurniture = { id: "table", position: { x: -2, z: 1.1 }, footprint: { kind: "circle", radius: 1.09 } };
const stool: PlacedFurniture = { id: "stool", position: { x: -0.35, z: 1.5 }, footprint: { kind: "circle", radius: .45 } };
const bed: PlacedFurniture = { id: "bed", position: { x: -4.37, z: -3.42 }, footprint: { kind: "rect", minX: -1.18, maxX: 1.51, minZ: -1.73, maxZ: 1.73 } };
const items = [table, stool, bed];

describe("furniture placement", () => {
  it("keeps the default layout valid, including round stools beside the table", () => {
    for (const item of items) expect(placementProblem(item, item.position, items)).toBeNull();
    expect(placementProblem(stool, { x: -1.4, z: 1.1 }, items)).toContain("家具");
    expect(placementProblem(stool, { x: -.8, z: 2.3 }, items)).toBeNull();
  });
  it("checks asymmetric bed bounds, both back walls and all four floor edges", () => {
    expect(furnitureObstacle(bed).maxX).toBeCloseTo(-2.86);
    for (const p of [{ x: -6, z: 0 }, { x: 6, z: 0 }, { x: 0, z: -6 }, { x: 0, z: 6 }, { x: Infinity, z: 0 }]) expect(placementProblem(stool, p, items)).not.toBeNull();
    expect(placementProblem(bed, { x: 4.5, z: 0 }, items)).toContain("地板");
  });
  it("blocks rectangle/circle and rectangle/rectangle collisions", () => {
    expect(placementProblem(table, bed.position, items)).toContain("家具");
    const cabinet: PlacedFurniture = { ...bed, id: "cabinet" };
    expect(placementProblem(cabinet, bed.position, items)).toContain("家具");
    expect(placementProblem(cabinet, { x: 3, z: 0 }, items)).toBeNull();
  });
  it("reserves pets' animated clearance and never mutates committed positions", () => {
    const original = structuredClone(stool.position);
    const p = { x: 2, z: 2 };
    expect(placementProblem(stool, p, items, [{ ...p, radius: .8 }])).toContain("宠物");
    expect(placementProblem(stool, { x: 4, z: 2 }, items, [{ ...p, radius: .8 }])).toBeNull();
    expect(stool.position).toEqual(original);
  });
  it("makes wandering replan against the new furniture location", () => {
    const walker = createWander(5, () => .8, [], { x: 0, z: 0 });
    Object.assign(walker, { targetX: 4, targetZ: 0, yaw: Math.PI / 2, wait: 0 });
    walker.obstacles = expandedFurnitureObstacles([{ ...table, position: { x: 2.5, z: 0 } }], .5);
    stepWander(walker, .05, () => .8);
    expect(walker.x).toBe(0);
    const block = walker.obstacles[0];
    for (let frame = 0; frame < 6000; frame++) {
      stepWander(walker, 1 / 60);
      expect(walker.x > block.minX && walker.x < block.maxX && walker.z > block.minZ && walker.z < block.maxZ).toBe(false);
    }
  });
});
