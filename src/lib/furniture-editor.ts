import {
  BufferGeometry, CanvasTexture, LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial,
  Plane, PlaneGeometry, Raycaster, Vector2, Vector3,
  type Material, type OrthographicCamera, type Scene,
} from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { FurnitureItem } from "./furniture";
import { furnitureObstacle, placementProblem, type FurnitureLayout } from "./furniture-layout";
import type { PetFootprint } from "./pet-placement";

type PetBody = PetFootprint & { height: number };
type Options = {
  canvas: HTMLCanvasElement;
  camera: OrthographicCamera;
  scene: Scene;
  controls: OrbitControls;
  furniture: { root: import("three").Group; items: FurnitureItem[] };
  getPets: () => PetBody[];
  canEdit: () => boolean;
  onActive: (active: boolean) => void;
  onCommit: (layout: FurnitureLayout) => void;
};

type Press = { id: number; x: number; y: number; moved: boolean; kind: "first" | "activate" | "drop"; item: FurnitureItem };

export function createFurnitureEditor(options: Options) {
  const { canvas, camera, scene, controls, furniture } = options;
  const ray = new Raycaster(), pointer = new Vector2();
  const floor = new Plane(new Vector3(0, 1, 0), 0), floorPoint = new Vector3();
  const invalidMaterial = new MeshBasicMaterial({ color: "#f04444", transparent: true, opacity: 0.72, depthWrite: false, depthTest: false });
  const originals = new Map<Mesh, Material | Material[]>();
  const hint = document.createElement("div");
  hint.className = "furniture-feedback";
  hint.hidden = true;
  const message = document.createElement("span");
  message.setAttribute("role", "status");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "取消";
  hint.append(message, cancel);
  canvas.parentElement!.append(hint);
  let active: { item: FurnitureItem; offset: Vector3; problem: string | null; onFloor: boolean } | null = null;
  let press: Press | null = null;
  let tap: { id: string; time: number; x: number; y: number } | null = null;
  let lastFinish = -Infinity;
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = textureCanvas.height = 128;
  const ctx = textureCanvas.getContext("2d")!;
  const shadowMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false });
  const shadowTexture = new CanvasTexture(textureCanvas);
  shadowMaterial.map = shadowTexture;
  const shadow = new Mesh(new PlaneGeometry(1, 1), shadowMaterial);
  shadow.name = "furniture-placement-shadow";
  shadow.rotation.x = -Math.PI / 2;
  shadow.visible = false;
  const clippingPlanes = [
    new Plane(new Vector3(1, 0, 0), 6), new Plane(new Vector3(-1, 0, 0), 6),
    new Plane(new Vector3(0, 0, 1), 6), new Plane(new Vector3(0, 0, -1), 6),
  ];
  shadowMaterial.clippingPlanes = clippingPlanes;
  const outlineMaterial = new LineBasicMaterial({ color: "#4a937b", transparent: true, opacity: 0.9, depthWrite: false });
  outlineMaterial.clippingPlanes = clippingPlanes;
  const outline = new LineLoop(new BufferGeometry(), outlineMaterial);
  outline.name = "furniture-placement-outline";
  outline.visible = false;
  scene.add(shadow, outline);

  function setRay(event: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    camera.updateMatrixWorld();
    ray.setFromCamera(pointer, camera);
  }
  function projectFloor(event: MouseEvent) {
    setRay(event);
    return ray.ray.intersectPlane(floor, floorPoint);
  }
  function pick(event: MouseEvent): FurnitureItem | null {
    setRay(event);
    furniture.root.updateMatrixWorld(true);
    const hit = ray.intersectObject(furniture.root, true)[0];
    if (!hit) return null;
    // Match the room's lightweight pet hit sphere to respect foreground pets.
    for (const pet of options.getPets()) {
      const center = new Vector3(pet.x, pet.height * 0.5, pet.z);
      const along = center.clone().sub(ray.ray.origin).dot(ray.ray.direction);
      const distance2 = ray.ray.at(along, new Vector3()).distanceToSquared(center);
      const radius = pet.height * 0.42;
      if (along > 0 && distance2 <= radius * radius && along - Math.sqrt(radius * radius - distance2) < hit.distance) return null;
    }
    return furniture.items.find((item) => {
      let node = hit.object;
      while (node.parent && node !== item.group) node = node.parent;
      return node === item.group;
    }) ?? null;
  }
  function consume(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function capture(event: PointerEvent) { canvas.setPointerCapture(event.pointerId); }
  function release(id: number) { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); }
  function stopCamera() {
    // Flush pan damping before measuring the cursor's floor offset.
    const damping = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
    controls.enabled = false;
  }
  function tint(invalid: boolean) {
    for (const [mesh, material] of originals) mesh.material = invalid ? invalidMaterial : material;
  }
  function validate() {
    if (!active) return;
    const position = active.item.group.position;
    active.problem = active.onFloor ? placementProblem(active.item, position, furniture.items, options.getPets()) : "请放在房间地板上";
    tint(Boolean(active.problem));
    outlineMaterial.color.set(active.problem ? "#ec4941" : "#4a937b");
    shadowMaterial.color.set(active.problem ? "#dd5147" : "#36584d");
    const text = active.problem
      ? `${active.problem} · 红色位置不可放置`
      : `正在移动${active.item.label} · 点击或拖动松开放置`;
    if (message.textContent !== text) message.textContent = text;
  }
  function begin(item: FurnitureItem, event: MouseEvent) {
    if (!options.canEdit()) return false;
    stopCamera();
    if (!projectFloor(event)) { controls.enabled = true; return false; }
    clearTimeout(feedbackTimer);
    active = { item, offset: floorPoint.clone().sub(item.group.position), problem: null, onFloor: true };
    item.group.traverse((child) => { if (child instanceof Mesh) originals.set(child, child.material); });
    item.group.position.y = 0.22;
    const bounds = furnitureObstacle(item), width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    shadow.position.set(cx, 0.025, cz); shadow.scale.set(width + 0.16, depth + 0.16, 1);
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = "#ffffff"; ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 8;
    ctx.beginPath();
    if (item.footprint.kind === "circle") ctx.arc(64, 64, 53, 0, Math.PI * 2);
    else ctx.roundRect(10, 10, 108, 108, 8);
    ctx.fill(); shadowTexture.needsUpdate = true;
    const points = item.footprint.kind === "circle"
      ? Array.from({ length: 64 }, (_, i) => new Vector3(Math.cos(i * Math.PI / 32) * width / 2, 0.035, Math.sin(i * Math.PI / 32) * depth / 2))
      : [new Vector3(-width / 2, .035, -depth / 2), new Vector3(width / 2, .035, -depth / 2), new Vector3(width / 2, .035, depth / 2), new Vector3(-width / 2, .035, depth / 2)];
    outline.geometry.dispose(); outline.geometry = new BufferGeometry().setFromPoints(points);
    outline.position.set(cx, 0, cz);
    shadow.visible = outline.visible = true;
    hint.hidden = false; cancel.hidden = false; canvas.style.cursor = "grabbing";
    options.onActive(true); validate();
    return true;
  }
  function move(event: MouseEvent) {
    if (!active) return;
    const intersection = projectFloor(event);
    active.onFloor = Boolean(intersection);
    if (intersection) {
      const item = active.item;
      item.group.position.x = floorPoint.x - active.offset.x;
      item.group.position.z = floorPoint.z - active.offset.z;
      const box = furnitureObstacle(item, item.group.position);
      const x = (box.minX + box.maxX) / 2, z = (box.minZ + box.maxZ) / 2;
      // Clip the preview to the floor's extent instead of drawing on empty space.
      shadow.visible = outline.visible = box.maxX > -6 && box.minX < 6 && box.maxZ > -6 && box.minZ < 6;
      shadow.position.set(x, .025, z); outline.position.set(x, 0, z);
    }
    validate();
  }
  function finish(commit: boolean) {
    if (!active) return;
    validate();
    const { item, problem } = active;
    const accepted = commit && !problem;
    if (accepted) item.position = { x: item.group.position.x, z: item.group.position.z };
    item.group.position.set(item.position.x, 0, item.position.z);
    tint(false); originals.clear(); active = null;
    shadow.visible = outline.visible = false;
    const pointerId = press?.id;
    press = null; tap = null;
    if (pointerId !== undefined) release(pointerId);
    controls.enabled = true; canvas.style.cursor = ""; cancel.hidden = true;
    options.onActive(false);
    message.textContent = accepted ? `${item.label}已放置` : "已返回原来的位置";
    feedbackTimer = setTimeout(() => { hint.hidden = true; }, 1800);
    lastFinish = performance.now();
    if (accepted) options.onCommit(Object.fromEntries(furniture.items.map((entry) => [entry.id, { ...entry.position }])));
  }
  function down(event: PointerEvent) {
    if (active) {
      consume(event);
      if (event.button !== 0 || press) return;
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, kind: "drop", item: active.item };
      move(event); capture(event); return;
    }
    if (event.button !== 0 || press) return;
    const item = pick(event);
    if (!item) { tap = null; return; }
    consume(event);
    if (!options.canEdit()) return;
    const double = tap?.id === item.id && event.timeStamp - tap.time < 420 && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 24;
    if (double) {
      tap = null;
      if (!begin(item, event)) return;
    } else stopCamera();
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, kind: double ? "activate" : "first", item };
    capture(event);
  }
  function pointerMove(event: PointerEvent) {
    if (!active && !press) return;
    consume(event);
    if (press && event.pointerId !== press.id) return;
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) { press.moved = true; tap = null; }
    if (active) move(event);
  }
  function up(event: PointerEvent) {
    if (!press || press.id !== event.pointerId) return;
    consume(event);
    const ended = press;
    if (event.type !== "pointerup") {
      if (active) finish(false);
      else { press = null; tap = null; controls.enabled = true; release(ended.id); }
      return;
    }
    if (active) {
      if (ended.kind === "activate" && !ended.moved) { press = null; release(ended.id); }
      else { move(event); finish(true); }
    } else {
      press = null; controls.enabled = true; release(ended.id);
      tap = ended.moved ? null : { id: ended.item.id, time: event.timeStamp, x: event.clientX, y: event.clientY };
    }
  }
  function doubleClick(event: MouseEvent) {
    if (active || performance.now() - lastFinish < 150) { consume(event); return; }
    const item = pick(event);
    if (item) { consume(event); tap = null; begin(item, event); }
  }
  function cancelEdit() {
    if (active) finish(false);
    else if (press) { const id = press.id; press = null; tap = null; release(id); controls.enabled = true; }
  }
  const keydown = (event: KeyboardEvent) => { if (event.key === "Escape" && active) { consume(event); cancelEdit(); } };
  const visibility = () => { if (document.hidden) cancelEdit(); };
  cancel.addEventListener("click", cancelEdit);
  canvas.addEventListener("pointerdown", down, true);
  canvas.addEventListener("pointermove", pointerMove, true);
  canvas.addEventListener("pointerup", up, true);
  canvas.addEventListener("pointercancel", up, true);
  canvas.addEventListener("lostpointercapture", up, true);
  canvas.addEventListener("dblclick", doubleClick, true);
  window.addEventListener("keydown", keydown);
  window.addEventListener("blur", cancelEdit);
  document.addEventListener("visibilitychange", visibility);
  return {
    get active() { return Boolean(active); },
    update: validate,
    dispose() {
      cancelEdit(); clearTimeout(feedbackTimer);
      hint.remove(); shadow.removeFromParent(); outline.removeFromParent();
      shadow.geometry.dispose(); shadowMaterial.dispose(); shadowTexture.dispose(); outline.geometry.dispose(); outlineMaterial.dispose(); invalidMaterial.dispose();
      canvas.removeEventListener("pointerdown", down, true);
      canvas.removeEventListener("pointermove", pointerMove, true);
      canvas.removeEventListener("pointerup", up, true);
      canvas.removeEventListener("pointercancel", up, true);
      canvas.removeEventListener("lostpointercapture", up, true);
      canvas.removeEventListener("dblclick", doubleClick, true);
      window.removeEventListener("keydown", keydown); window.removeEventListener("blur", cancelEdit); document.removeEventListener("visibilitychange", visibility);
    },
  };
}
