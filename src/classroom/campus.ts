import { Box3, Group, Vector3 } from "three";
import { createRoomShell } from "../lib/room-shell";
import { createFurniture } from "../lib/furniture";
import type { FurnitureLayout } from "../lib/furniture-layout";
import type { WanderObstacle } from "../lib/wander";
import type { PetFootprint } from "../lib/pet-placement";
import { PET_GAP } from "../lib/pet-placement";
import { createClassroom, CLASSROOM_SIZE } from "./model";

export const BEDROOM_X = -7.25;
export const CLASSROOM_X = 7.25;

export function createCampus(layout: FurnitureLayout = {}) {
  const root = new Group(); root.name = "home-and-classroom";
  const bedroom = createRoomShell(); bedroom.name = "bedroom";
  const furniture = createFurniture(layout);
  bedroom.add(furniture.root);
  bedroom.position.x = BEDROOM_X;
  const classroom = createClassroom();
  // Independent foundations and walls, with more than three units of empty space.
  classroom.root.position.x = CLASSROOM_X;
  root.add(bedroom, classroom.root);
  root.updateMatrixWorld(true);
  const obstacles: WanderObstacle[] = [];
  for (const item of classroom.root.children) {
    if (!["desk", "chair", "lectern"].includes(item.userData.kind) && item.name !== "teaching-platform") continue;
    const bounds = new Box3().setFromObject(item);
    obstacles.push({ minX: bounds.min.x - CLASSROOM_X, maxX: bounds.max.x - CLASSROOM_X, minZ: bounds.min.z, maxZ: bounds.max.z });
  }
  return {
    root, bedroom, classroom, obstacles,
    walls: [
      { root: bedroom.getObjectByName("room-wall-x")!, axis: "x" as const },
      { root: bedroom.getObjectByName("room-wall-z")!, axis: "z" as const },
      { root: furniture.window, axis: "x" as const },
      ...classroom.walls,
    ],
  };
}

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

export const CAMPUS_VIEWS = {
  overview: { target: new Vector3(-.5, .8, 0), horizontal: 14.3, vertical: 7.9 },
  classroom: { target: new Vector3(CLASSROOM_X, 1, 0), horizontal: 7, vertical: 5.6 },
  bedroom: { target: new Vector3(BEDROOM_X, .8, 0), horizontal: 8.2, vertical: 6.8 },
};
export type CampusView = keyof typeof CAMPUS_VIEWS;
