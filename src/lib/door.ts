import { Group, type Object3D } from "three";

export function hingeDoor(wall: Group, parts: Object3D[], name: string, x: number, z: number) {
  const hinge = new Group(); hinge.name = name; hinge.position.set(x, 0, z);
  for (const part of parts) { part.position.sub(hinge.position); hinge.add(part); }
  wall.add(hinge);
  return hinge;
}
