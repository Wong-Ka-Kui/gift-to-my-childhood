import { MathUtils, Mesh, MOUSE, TOUCH, Vector3, type Material, type Object3D, type OrthographicCamera } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export const DEFAULT_ROOM_POSITION = new Vector3(21.5, 21, 34.8);
export const DEFAULT_ROOM_TARGET = new Vector3(10, .8, 1.8);

/** Always orbit; focusing or resetting flushes damping and captured gestures. */
export function createRoomView(camera: OrthographicCamera, controls: OrbitControls, canvas: HTMLCanvasElement) {
  const pointers = new Set<number>();
  const down = (event: PointerEvent) => pointers.add(event.pointerId);
  const up = (event: PointerEvent) => pointers.delete(event.pointerId);
  canvas.addEventListener("pointerdown", down, true);
  canvas.addEventListener("pointerup", up, true);
  canvas.addEventListener("pointercancel", up, true);

  function settle() {
    for (const pointerId of [...pointers]) canvas.dispatchEvent(new PointerEvent("pointercancel", { pointerId, bubbles: true }));
    pointers.clear();
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
    controls.enabled = true;
  }
  controls.enableRotate = true;
  controls.enablePan = false;
  controls.mouseButtons.LEFT = MOUSE.ROTATE;
  controls.mouseButtons.RIGHT = MOUSE.ROTATE;
  controls.touches.ONE = TOUCH.ROTATE;
  // With pan disabled, a two-finger gesture only changes zoom.
  controls.touches.TWO = TOUCH.DOLLY_PAN;
  controls.rotateSpeed = .65;
  controls.minPolarAngle = MathUtils.degToRad(15);
  controls.maxPolarAngle = MathUtils.degToRad(70);
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  canvas.style.cursor = "grab";
  return {
    focus(area: "all" | "bedroom" | "classroom") {
      settle();
      const target = area === "all" ? DEFAULT_ROOM_TARGET : new Vector3(area === "bedroom" ? 0 : 16, .8, 0);
      camera.position.copy(DEFAULT_ROOM_POSITION).sub(DEFAULT_ROOM_TARGET).add(target);
      controls.target.copy(target);
      camera.zoom = area === "all" ? 1 : 1.8;
      camera.updateProjectionMatrix();
      controls.update();
    },
    reset() {
      settle();
      camera.position.copy(DEFAULT_ROOM_POSITION);
      camera.zoom = 1;
      controls.target.copy(DEFAULT_ROOM_TARGET);
      camera.updateProjectionMatrix();
      controls.update();
    },
    dispose() {
      settle();
      canvas.removeEventListener("pointerdown", down, true);
      canvas.removeEventListener("pointerup", up, true);
      canvas.removeEventListener("pointercancel", up, true);
    },
  };
}

/** Clone materials, not geometry/textures, so each wall can fade independently. */
export function createWallCutaway(walls: { root: Object3D; axis: "x" | "z"; side?: -1 | 1; center?: number }[]) {
  const groups = walls.map(({ root, axis, side, center }) => {
    const materials = new Map<Material, Material>();
    const meshes: { mesh: Mesh; original: Material | Material[]; castShadow: boolean }[] = [];
    root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      meshes.push({ mesh: node, original: node.material, castShadow: node.castShadow });
      const copy = (source: Material) => {
        if (!materials.has(source)) materials.set(source, source.clone());
        return materials.get(source)!;
      };
      node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
    });
    const wallSide = side ?? -1;
    return { root, axis, side: wallSide, center: center ?? 0, opacity: wallSide === -1 ? 1 : 0, materials, meshes };
  });
  const direction = new Vector3();
  return {
    update(camera: OrthographicCamera) {
      camera.getWorldDirection(direction).negate();
      // Orthographic rays are parallel: wall visibility depends on viewing
      // direction, never camera position or which room is currently focused.
      direction.y = 0;
      direction.normalize();
      for (const group of groups) {
        const coordinate = direction[group.axis];
        // Fade opposing walls together only near an edge-on viewing angle.
        // The initial angle shows only the original two walls.
        const blendRange = Math.sin(MathUtils.degToRad(5));
        const blend = MathUtils.smoothstep(coordinate, -blendRange, blendRange);
        const targetOpacity = group.side === -1 ? blend : 1 - blend;
        group.opacity = targetOpacity;
        const opacity = targetOpacity;
        group.root.visible = opacity > .005;
        for (const [original, material] of group.materials) {
          const transparent = original.transparent || opacity < 1;
          if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
          material.opacity = original.opacity * opacity;
          material.depthWrite = original.depthWrite && opacity === 1;
        }
        for (const { mesh, castShadow } of group.meshes) mesh.castShadow = castShadow && opacity > .5;
      }
    },
    dispose() {
      for (const group of groups) {
        group.root.visible = true;
        for (const { mesh, original, castShadow } of group.meshes) { mesh.material = original; mesh.castShadow = castShadow; }
        group.materials.forEach((material) => material.dispose());
      }
    },
  };
}
