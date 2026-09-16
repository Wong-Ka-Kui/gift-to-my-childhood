import type { Object3D } from "three";

/** Raycaster includes invisible objects; interaction must follow the whole render hierarchy. */
export function isWorldVisible(object: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}
