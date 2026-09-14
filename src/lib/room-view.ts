import { MathUtils, Mesh, MOUSE, TOUCH, Vector3, type Material, type Object3D, type OrthographicCamera } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export const DEFAULT_ROOM_POSITION = new Vector3(24, 18, 9.5);
export const DEFAULT_ROOM_TARGET = new Vector3(0, .8, 0);

/** Mode changes flush damping and captured gestures, preserving the play camera. */
export function createRoomView(camera: OrthographicCamera, controls: OrbitControls, canvas: HTMLCanvasElement) {
  let inspecting = false;
  let previous = { position: camera.position.clone(), target: controls.target.clone(), zoom: camera.zoom };
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
  function configure(active: boolean) {
    controls.enableRotate = active;
    controls.enablePan = !active;
    controls.mouseButtons.LEFT = active ? MOUSE.ROTATE : MOUSE.PAN;
    controls.mouseButtons.RIGHT = active ? MOUSE.ROTATE : MOUSE.PAN;
    controls.touches.ONE = active ? TOUCH.ROTATE : TOUCH.PAN;
    // Disabling pan makes two-finger gestures zoom only in inspection mode.
    controls.touches.TWO = TOUCH.DOLLY_PAN;
    controls.rotateSpeed = .65;
    controls.minPolarAngle = active ? MathUtils.degToRad(15) : 0;
    controls.maxPolarAngle = active ? MathUtils.degToRad(70) : Math.PI;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    canvas.style.cursor = active ? "grab" : "";
  }
  configure(false);
  return {
    setInspect(active: boolean) {
      if (active === inspecting) return;
      settle();
      if (active) previous = { position: camera.position.clone(), target: controls.target.clone(), zoom: camera.zoom };
      configure(active);
      if (active) {
        camera.position.sub(controls.target).add(DEFAULT_ROOM_TARGET);
        controls.target.copy(DEFAULT_ROOM_TARGET);
      } else {
        camera.position.copy(previous.position);
        camera.zoom = previous.zoom;
        controls.target.copy(previous.target);
      }
      inspecting = active;
      camera.updateProjectionMatrix();
      controls.update();
    },
    reset() {
      settle();
      inspecting = false;
      configure(false);
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
export function createWallCutaway(walls: { root: Object3D; axis: "x" | "z" }[]) {
  const groups = walls.map(({ root, axis }) => {
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
    return { root, axis, materials, meshes };
  });
  const direction = new Vector3();
  return {
    update(camera: OrthographicCamera, enabled: boolean) {
      camera.getWorldDirection(direction).negate();
      for (const group of groups) {
        const opacity = enabled ? 1 - MathUtils.smoothstep(-direction[group.axis], -.04, .22) : 1;
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
