import type { WanderObstacle } from "./wander";
import type { PetFootprint } from "./pet-placement";

export type FloorPoint = { x: number; z: number };
export type FurnitureLayout = Record<string, FloorPoint>;
export type FurnitureFootprint =
  | { kind: "circle"; radius: number }
  | { kind: "rect"; minX: number; maxX: number; minZ: number; maxZ: number };
export type PlacedFurniture = { id: string; position: FloorPoint; footprint: FurnitureFootprint };
export const FURNITURE_GAP = 0.08;
// Leave space for the low skirting on the two back walls.
export const FLOOR_LIMITS = { minX: -5.80, maxX: 5.92, minZ: -5.80, maxZ: 5.92 };

export function furnitureObstacle(item: PlacedFurniture, position = item.position): WanderObstacle {
  const shape = item.footprint;
  if (shape.kind === "circle") return { minX: position.x - shape.radius, maxX: position.x + shape.radius, minZ: position.z - shape.radius, maxZ: position.z + shape.radius };
  return { minX: position.x + shape.minX, maxX: position.x + shape.maxX, minZ: position.z + shape.minZ, maxZ: position.z + shape.maxZ };
}

function circleTouchesRect(center: FloorPoint, radius: number, rect: WanderObstacle) {
  const x = Math.max(rect.minX, Math.min(rect.maxX, center.x));
  const z = Math.max(rect.minZ, Math.min(rect.maxZ, center.z));
  return Math.hypot(x - center.x, z - center.z) < radius;
}

function furnitureTouches(a: PlacedFurniture, b: PlacedFurniture) {
  if (a.footprint.kind === "circle" && b.footprint.kind === "circle") {
    return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) < a.footprint.radius + b.footprint.radius + FURNITURE_GAP;
  }
  if (a.footprint.kind === "circle") return circleTouchesRect(a.position, a.footprint.radius + FURNITURE_GAP, furnitureObstacle(b));
  if (b.footprint.kind === "circle") return circleTouchesRect(b.position, b.footprint.radius + FURNITURE_GAP, furnitureObstacle(a));
  const left = furnitureObstacle(a), right = furnitureObstacle(b);
  return left.minX < right.maxX + FURNITURE_GAP && left.maxX > right.minX - FURNITURE_GAP && left.minZ < right.maxZ + FURNITURE_GAP && left.maxZ > right.minZ - FURNITURE_GAP;
}

export function placementProblem(item: PlacedFurniture, position: FloorPoint, others: readonly PlacedFurniture[], pets: readonly PetFootprint[] = []): string | null {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) return "请放在房间地板上";
  const candidate = { ...item, position };
  const box = furnitureObstacle(candidate);
  if (box.minX < FLOOR_LIMITS.minX || box.maxX > FLOOR_LIMITS.maxX || box.minZ < FLOOR_LIMITS.minZ || box.maxZ > FLOOR_LIMITS.maxZ) return "超出地板或碰到墙壁";
  if (box.maxX > 4.25 && box.minZ < 1.2 && box.maxZ > -1.2) return "请留出门口的通道";
  if (others.some((other) => other.id !== item.id && furnitureTouches(candidate, other))) return "这里已有其他家具";
  // Match the conservative rectangle used by pet navigation, including leg reach.
  if (pets.some((pet) => pet.x >= box.minX - pet.radius - 0.1 && pet.x <= box.maxX + pet.radius + 0.1 && pet.z >= box.minZ - pet.radius - 0.1 && pet.z <= box.maxZ + pet.radius + 0.1)) return "请给宠物留出活动空间";
  return null;
}

export function expandedFurnitureObstacles(items: readonly PlacedFurniture[], radius: number): WanderObstacle[] {
  return items.map((item) => {
    const box = furnitureObstacle(item), padding = radius + 0.1;
    return { minX: box.minX - padding, maxX: box.maxX + padding, minZ: box.minZ - padding, maxZ: box.maxZ + padding };
  });
}
