import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { isWorldVisible } from "./visibility";

describe("cleanup occlusion", () => {
  it("ignores hidden walls even when their visible child meshes are hit", () => {
    const wall = new Group();
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const trim = new Group();
    wall.add(trim); trim.add(mesh); wall.visible = false;
    wall.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0, 0, 3), new Vector3(0, 0, -1));
    const hits = ray.intersectObject(wall, true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some(hit => isWorldVisible(hit.object))).toBe(false);
    wall.visible = true;
    expect(hits.some(hit => isWorldVisible(hit.object))).toBe(true);
    mesh.visible = false;
    expect(hits.some(hit => isWorldVisible(hit.object))).toBe(false);
    mesh.geometry.dispose(); mesh.material.dispose();
  });
});
