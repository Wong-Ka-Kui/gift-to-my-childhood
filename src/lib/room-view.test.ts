import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, Vector3 } from "three";
import { createWallCutaway, DEFAULT_ROOM_POSITION, DEFAULT_ROOM_TARGET } from "./room-view";

function fixture() {
  const walls = [0, 16].flatMap(center => (["x", "z"] as const).flatMap(axis => ([-1, 1] as const).map(side => ({
    root: new Mesh(new BoxGeometry(), new MeshBasicMaterial()), axis, side, center,
  }))));
  const cutaway = createWallCutaway(walls);
  const camera = new OrthographicCamera();
  const aim = (target: Vector3, offset: Vector3) => {
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
  const opacities = () => walls.map(w => w.root.material.opacity);
  return { walls, cutaway, camera, aim, opacities };
}

describe("wall visibility during free rotation", () => {
  it("keeps the initial two walls at the default angle regardless of focus position", () => {
    const f = fixture();
    for (const target of [DEFAULT_ROOM_TARGET, new Vector3(0, .8, 0), new Vector3(16, .8, 0), new Vector3(-80, 20, -50)]) {
      f.aim(target, DEFAULT_ROOM_POSITION.clone().sub(DEFAULT_ROOM_TARGET));
      f.cutaway.update(f.camera);
      expect(f.opacities()).toEqual([1, 0, 1, 0, 1, 0, 1, 0]);
      expect(f.walls.filter(w => w.root.visible).length).toBe(4);
    }
    f.cutaway.dispose();
  });
  it("crossfades opposite walls continuously at side angles and restores them on return", () => {
    const f = fixture();
    const values: number[] = [];
    for (const degrees of [5, 2, 0, -2, -5]) {
      const angle = degrees * Math.PI / 180;
      f.aim(DEFAULT_ROOM_TARGET, new Vector3(Math.sin(angle) * 30, 20, Math.cos(angle) * 30));
      f.cutaway.update(f.camera);
      const [left, right, back, front] = f.opacities();
      values.push(left);
      expect(left + right).toBeCloseTo(1);
      expect(back).toBe(1);
      expect(front).toBe(0);
      expect(f.opacities().slice(4)).toEqual(f.opacities().slice(0, 4));
    }
    expect(values[0]).toBeCloseTo(1);
    expect(values[2]).toBeCloseTo(.5);
    expect(values[4]).toBeCloseTo(0);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    f.aim(DEFAULT_ROOM_TARGET, DEFAULT_ROOM_POSITION.clone().sub(DEFAULT_ROOM_TARGET));
    f.cutaway.update(f.camera);
    expect(f.opacities()).toEqual([1, 0, 1, 0, 1, 0, 1, 0]);
    f.cutaway.dispose();
  });
});
