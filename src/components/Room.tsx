import { useEffect, useRef } from "react";
import {
  AmbientLight,
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MathUtils,
  OrthographicCamera,
  PCFSoftShadowMap,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
  SRGBColorSpace,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { disposeObject, loadModel } from "../lib/model";
import { createWander, resumeWander, stepWander, type WanderState } from "../lib/wander";
import { MAX_PETS, type PetRecord } from "../lib/pets";
import { PET_GAP } from "../lib/pet-placement";
import { createRoomShell, createBackdrop } from "../lib/room-shell";
import { createFurniture, type FurnitureItem } from "../lib/furniture";
import { createFurnitureEditor } from "../lib/furniture-editor";
import type { FurnitureLayout } from "../lib/furniture-layout";
import { CARE_TICK_MS, CLEANABLE_RADIUS, type CareTick, type CleanableItem } from "../lib/home-items";
import { isWorldVisible } from "../lib/visibility";
import { createCleanableModel } from "../lib/cleanable-model";
import { capturePetPortrait } from "../lib/pet-portrait";
import { createRoomView, createWallCutaway, DEFAULT_ROOM_POSITION, DEFAULT_ROOM_TARGET } from "../lib/room-view";
import { createPetMotion, type PetMotion } from "../lib/pet-motion";
import { createClassroom } from "../classroom/model";
import { findClassroomSpot } from "../classroom/campus";
import type { WanderObstacle } from "../lib/wander";
const CLASSROOM_OFFSET = 16;
const CLASSROOM_SCALE = 1.25;

type PetRuntime = {
  id: string;
  name: string;
  mover: Group;
  motion: PetMotion;
  wander: WanderState;
  radius: number;
  label: HTMLDivElement;
  walking: boolean;
  manualHeading: number | null;
};
type Runtime = {
  scene: Scene;
  renderer: WebGLRenderer;
  cleanables: Map<string, { item: CleanableItem; model: Group; button: HTMLButtonElement }>;
  camera: OrthographicCamera;
  view: ReturnType<typeof createRoomView>;
  render: () => void;
  pets: Map<string, PetRuntime>;
  loading: Set<string>;
  disposed: boolean;
  furniture: FurnitureItem[];
  classroom: Group;
  classroomObstacles: WanderObstacle[];
};

function disposePet(pet: PetRuntime) {
  pet.mover.removeFromParent();
  pet.label.remove();
  pet.motion.dispose();
  disposeObject(pet.mover);
}

function petObstacles(current: Runtime, radius: number) {
  return [...current.classroomObstacles.map(o => ({ minX: o.minX-radius-.12, maxX: o.maxX+radius+.12, minZ: o.minZ-radius-.12, maxZ: o.maxZ+radius+.12 })),
    { minX: -10, maxX: 10, minZ: 4-radius-.22, maxZ: 10 },
    { minX: -10, maxX: 10, minZ: -10, maxZ: -4+radius+.22 }, ...Array.from(current.cleanables.values(), ({ item }) => ({
    minX: item.x - CLASSROOM_OFFSET - CLEANABLE_RADIUS - radius - .1, maxX: item.x - CLASSROOM_OFFSET + CLEANABLE_RADIUS + radius + .1,
    minZ: item.z - CLEANABLE_RADIUS - radius - .1, maxZ: item.z + CLEANABLE_RADIUS + radius + .1,
  }))];
}

function updateNeighbors(pet: PetRuntime, current: Runtime) {
  pet.wander.neighbors = Array.from(current.pets.values())
    .filter((other) => other !== pet)
    .map((other) => ({ x: other.wander.x, z: other.wander.z, radius: pet.radius + other.radius + PET_GAP }));
}

export default function Room({
  pets,
  initialLayout,
  cleanables,
  paused,
  inspecting,
  viewReset,
  focusArea,
  onCareTick,
  onClean,
  onPortrait,
  onFurnitureEditing,
  onFurnitureLayout,
  onReady,
  onError,
  onPetError,
}: {
  pets: readonly PetRecord[];
  initialLayout: FurnitureLayout;
  cleanables: readonly CleanableItem[];
  paused: boolean;
  inspecting: boolean;
  viewReset: number;
  focusArea: "all" | "bedroom" | "classroom";
  onCareTick: (tick: CareTick) => void;
  onClean: (id: string) => Promise<void>;
  onPortrait: (id: string, portrait: string) => void;
  onFurnitureEditing: (active: boolean) => void;
  onFurnitureLayout: (layout: FurnitureLayout) => void;
  onReady: (id: string) => void;
  onError: (message: string) => void;
  onPetError: (id: string, message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const startingLayout = useRef(initialLayout);
  const callbacks = useRef({ paused, inspecting, onCareTick, onClean, onPortrait });
  callbacks.current = { paused, inspecting, onCareTick, onClean, onPortrait };

  useEffect(() => {
    const container = host.current!;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true });
    } catch {
      onError("无法启动 3D 场景，请开启浏览器硬件加速。");
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.75;
    renderer.shadowMap.enabled = true;
    renderer.localClippingEnabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "宠物房间");
    container.appendChild(renderer.domElement);
    const scene = new Scene();
    const backdrop = createBackdrop();
    scene.background = backdrop;
    const camera = new OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
    // View predominantly along one wall, placing the rear corner to the right.
    camera.position.copy(DEFAULT_ROOM_POSITION);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minZoom = 0.65;
    controls.maxZoom = 2.4;
    controls.target.copy(DEFAULT_ROOM_TARGET);
    controls.update();
    const view = createRoomView(camera, controls, renderer.domElement);
    scene.add(new AmbientLight(0xffffff, 0.85));
    scene.add(new HemisphereLight("#f4fcff", "#fff0d5", 0.95));
    const sun = new DirectionalLight(0xfff7e8, 1.45);
    sun.position.set(6, 16, 10);
    sun.target.position.set(6, 0, 0);
    scene.add(sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -17;
    sun.shadow.camera.right = 17;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.normalBias = 0.025;
    sun.shadow.bias = -0.0001;
    sun.shadow.radius = 5;
    scene.add(sun);
    const room = createRoomShell();
    const furniture = createFurniture(startingLayout.current);
    room.add(furniture.root);
    scene.add(room);
    const classroom = createClassroom();
    classroom.root.scale.setScalar(CLASSROOM_SCALE);
    const classroomObstacles: WanderObstacle[] = [];
    for (const item of classroom.root.children) {
      if (!["desk", "chair", "lectern"].includes(item.userData.kind) && item.name !== "teaching-platform") continue;
      const b = new Box3().setFromObject(item);
      classroomObstacles.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z });
    }
    classroom.root.position.x = CLASSROOM_OFFSET;
    scene.add(classroom.root);
    const classroomFixtures = [...classroom.root.children];
    const cutaway = createWallCutaway([
      { root: room.getObjectByName("room-wall-x")!, axis: "x", side: -1, center: 0 },
      { root: room.getObjectByName("room-wall-z")!, axis: "z", side: -1, center: 0 },
      { root: room.getObjectByName("room-wall-x-back")!, axis: "x", side: 1, center: 0 },
      { root: room.getObjectByName("room-wall-z-back")!, axis: "z", side: 1, center: 0 },
      { root: furniture.window, axis: "x", side: -1, center: 0 },
      { root: classroom.walls[0].root, axis: "x", side: -1, center: CLASSROOM_OFFSET },
      { root: classroom.walls[1].root, axis: "z", side: -1, center: 0 },
      { root: classroom.root.getObjectByName("classroom-door-wall")!, axis: "x", side: 1, center: CLASSROOM_OFFSET },
      { root: classroom.root.getObjectByName("classroom-rear-window-wall")!, axis: "z", side: 1, center: 0 },
    ]);
    const labelPosition = new Vector3();
    const itemPosition = new Vector3();
    const itemRay = new Raycaster();
    const itemPointer = new Vector2();
    const occlusionSphere = new Sphere();
    const occlusionHit = new Vector3();
    let lastOcclusionCheck = -Infinity;
    const render = () => {
      cutaway.update(camera, callbacks.current.inspecting);
      renderer.render(scene, camera);
      const checkOcclusion = performance.now() - lastOcclusionCheck > 180;
      if (checkOcclusion) lastOcclusionCheck = performance.now();

      for (const { item, button } of current.cleanables.values()) {
        itemPosition.set(item.x, .24, item.z).project(camera);
        const hidden = Math.abs(itemPosition.x) > 1 || Math.abs(itemPosition.y) > 1 || Math.abs(itemPosition.z) > 1;
        if (!hidden && checkOcclusion) {
          itemPointer.set(itemPosition.x, itemPosition.y); itemRay.setFromCamera(itemPointer, camera);
          const point = new Vector3(item.x, .24, item.z);
          itemRay.far = Math.max(0, point.distanceTo(itemRay.ray.origin) - .3);
          let occluded = itemRay.intersectObjects([furniture.root, ...classroomFixtures], true).some(hit => isWorldVisible(hit.object));
          // Pet models can contain millions of triangles. Match their interaction
          // spheres instead of raycasting all those triangles for each floor item.
          if (!occluded) for (const pet of current.pets.values()) {
            occlusionSphere.center.set(pet.wander.x + CLASSROOM_OFFSET, pet.motion.height * .5, pet.wander.z);
            occlusionSphere.radius = pet.motion.height * .42;
            if (itemRay.ray.intersectSphere(occlusionSphere, occlusionHit) && itemRay.ray.origin.distanceTo(occlusionHit) < itemRay.far) { occluded = true; break; }
          }
          button.dataset.occluded = String(occluded);
        }
        button.hidden = hidden || button.dataset.occluded === "true";
        button.disabled = callbacks.current.paused || callbacks.current.inspecting || furnitureEditor.active || button.dataset.busy === "true";
        button.style.transform = `translate(${(itemPosition.x + 1) / 2 * container.clientWidth}px, ${(1 - itemPosition.y) / 2 * container.clientHeight}px) translate(-50%, -50%)`;
      }
      for (const pet of current.pets.values()) {
          const label = pet.label;
          labelPosition.set(pet.wander.x + CLASSROOM_OFFSET, pet.motion.height + 0.15, pet.wander.z).project(camera);
          label.hidden = Math.abs(labelPosition.x) > 1 || Math.abs(labelPosition.y) > 1 || Math.abs(labelPosition.z) > 1;
          const x = (labelPosition.x + 1) / 2 * container.clientWidth;
          const y = (1 - labelPosition.y) / 2 * container.clientHeight;
          label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
    };
    const current: Runtime = { scene, renderer, cleanables: new Map(), camera, view, render, pets: new Map(), loading: new Set(), disposed: false, furniture: furniture.items, classroom: classroom.root, classroomObstacles };
    runtime.current = current;

    // Dragging the pet rotates its horizontal facing. Blank-space drags remain
    // available to OrbitControls for camera panning.
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const hitBounds = new Sphere();
    const intersection = new Vector3();
    let gesture: { pet: PetRuntime; pointer: number; startX: number; startY: number; lastX: number; dragging: boolean } | null = null;
    let lastTap: { id: string; time: number; x: number; y: number } | null = null;
    let lastToggle: { id: string; time: number } | null = null;
    let lastDragTime = -Infinity;
    let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
    const canvas = renderer.domElement;
    const hitPet = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      let nearest: PetRuntime | null = null;
      let nearestDistance = Infinity;
      for (const pet of current.pets.values()) {
        hitBounds.center.set(pet.wander.x + CLASSROOM_OFFSET, pet.motion.height * 0.5, pet.wander.z);
        hitBounds.radius = pet.motion.height * 0.42;
        if (raycaster.ray.intersectSphere(hitBounds, intersection)) {
          const distance = raycaster.ray.origin.distanceToSquared(intersection);
          if (distance < nearestDistance) { nearestDistance = distance; nearest = pet; }
        }
      }
      return nearest;
    };
    const toggleWalking = (pet: PetRuntime, time: number) => {
      tickCare();
      pet.walking = !pet.walking;
      pet.manualHeading = null;
      pet.wander.speed = 0;
      if (pet.walking) {
        updateNeighbors(pet, current);
        resumeWander(pet.wander);
      }
      lastToggle = { id: pet.id, time };
      if (feedback.current) feedback.current.textContent = `${pet.name}${pet.walking ? "开始活动" : "已停止"}`;
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => { if (feedback.current) feedback.current.textContent = ""; }, 1600);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (callbacks.current.paused || callbacks.current.inspecting || event.button !== 0 || gesture) return;
      const pet = hitPet(event);
      if (!pet) { lastTap = null; return; }
      gesture = { pet, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, dragging: false };
      controls.enabled = false;
      canvas.setPointerCapture?.(event.pointerId);
      event.stopPropagation();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      const { pet } = gesture;
      if (!gesture.dragging && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 5) {
        gesture.dragging = true;
        lastTap = null;
        pet.manualHeading = pet.wander.yaw;
        pet.wander.targetX = pet.wander.x;
        pet.wander.targetZ = pet.wander.z;
        pet.wander.wait = 1.2;
        pet.wander.speed = 0;
      }
      if (gesture.dragging) pet.manualHeading! += (event.clientX - gesture.lastX) * 0.015;
      gesture.lastX = event.clientX;
      event.preventDefault();
      event.stopPropagation();
    };
    const stopPetRotation = (event: PointerEvent) => {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      const completed = gesture;
      gesture = null;
      controls.enabled = true;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (completed.dragging) { lastDragTime = event.timeStamp; lastTap = null; }
      else if (event.type === "pointerup") {
        if (lastTap?.id === completed.pet.id && event.timeStamp - lastTap.time < 400 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 24) {
          toggleWalking(completed.pet, event.timeStamp);
          lastTap = null;
        } else lastTap = { id: completed.pet.id, time: event.timeStamp, x: event.clientX, y: event.clientY };
      } else lastTap = null;
      event.stopPropagation();
    };
    const onDoubleClick = (event: MouseEvent) => {
      const pet = hitPet(event);
      if (callbacks.current.paused || callbacks.current.inspecting || !pet || event.timeStamp - lastDragTime < 400) return;
      // Pointer-up handles mouse double taps and touch. Native dblclick is a
      // fallback, not a second toggle of the same gesture.
      if (!(lastToggle?.id === pet.id && event.timeStamp - lastToggle.time < 100)) toggleWalking(pet, event.timeStamp);
      lastTap = null;
      event.preventDefault();
      event.stopPropagation();
    };
    const furnitureEditor = createFurnitureEditor({
      canvas, camera, scene, controls, furniture,
      getPets: () => Array.from(current.pets.values(), (pet) => ({ x: pet.wander.x + CLASSROOM_OFFSET, z: pet.wander.z, radius: pet.radius, height: pet.motion.height })),
      canEdit: () => !callbacks.current.paused && !callbacks.current.inspecting && !gesture && !current.loading.size,
      getCleanables: () => Array.from(current.cleanables.values(), ({ item }) => ({ ...item, radius: CLEANABLE_RADIUS })),
      onActive: (active) => {
        lastTap = null;
        if (active) for (const pet of current.pets.values()) pet.wander.speed = 0;
        onFurnitureEditing(active);
      },
      onCommit: (layout) => {
        for (const pet of current.pets.values()) {
          pet.wander.obstacles = petObstacles(current, pet.radius);
          pet.wander.targetX = pet.wander.x;
          pet.wander.targetZ = pet.wander.z;
          pet.wander.speed = 0;
          pet.wander.wait = 0.8;
        }
        onFurnitureLayout(layout);
      },
    });
    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointermove", onPointerMove, true);
    canvas.addEventListener("pointerup", stopPetRotation, true);
    canvas.addEventListener("pointercancel", stopPetRotation, true);
    canvas.addEventListener("lostpointercapture", stopPetRotation, true);
    canvas.addEventListener("dblclick", onDoubleClick, true);

    let careTime = Date.now();
    let wasVisible = !document.hidden;
    const tickCare = () => {
      const now = Date.now(), from = careTime;
      careTime = now;
      if (!wasVisible || callbacks.current.paused || furnitureEditor.active || current.loading.size) return;
      callbacks.current.onCareTick({
        from, to: now,
        pets: Array.from(current.pets.values(), (pet) => ({ id: pet.id, x: pet.wander.x + CLASSROOM_OFFSET, z: pet.wander.z, radius: pet.radius, yaw: pet.wander.yaw, active: pet.walking && gesture?.pet !== pet })),
        obstacles: current.classroomObstacles.map(o => ({...o,minX:o.minX+CLASSROOM_OFFSET,maxX:o.maxX+CLASSROOM_OFFSET})),
        area: { centerX: CLASSROOM_OFFSET, halfWidth: 5.6, halfDepth: 4.4 },
      });
    };
    const careVisibility = () => { tickCare(); wasVisible = !document.hidden; careTime = Date.now(); };
    const careTimer = setInterval(tickCare, CARE_TICK_MS);
    document.addEventListener("visibilitychange", careVisibility);
    window.addEventListener("pagehide", tickCare);
    let previousTime: number | null = null;
    renderer.setAnimationLoop((time) => {
      const delta =
        previousTime === null
          ? 0
          : Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      if (controls.enabled) controls.update();
      furnitureEditor.update();
      for (const pet of current.pets.values()) {
        const frameDelta = document.hidden ? 0 : delta;
        if (furnitureEditor.active || callbacks.current.paused) { pet.wander.speed = 0; }
        else if (pet.manualHeading !== null) {
          const turn = Math.atan2(Math.sin(pet.manualHeading - pet.wander.yaw), Math.cos(pet.manualHeading - pet.wander.yaw));
          pet.wander.yaw += MathUtils.clamp(turn, -0.85 * frameDelta, 0.85 * frameDelta);
          if (gesture?.pet !== pet && Math.abs(turn) < 0.015) pet.manualHeading = null;
        } else if (pet.walking && gesture?.pet !== pet) {
          updateNeighbors(pet, current);
          stepWander(pet.wander, frameDelta);
        }
        pet.mover.position.set(pet.wander.x, 0, pet.wander.z);
        pet.mover.rotation.y = pet.wander.yaw;
        pet.motion.update(frameDelta, pet.wander);
      }
      render();
    });
    function resize() {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      const aspect = width / height;
      const span = Math.max(10.2, 17 / aspect);
      camera.left = -span * aspect;
      camera.right = span * aspect;
      camera.top = span;
      camera.bottom = -span;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      render();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => {
      clearInterval(careTimer);
      document.removeEventListener("visibilitychange", careVisibility);
      window.removeEventListener("pagehide", tickCare);
      for (const entry of current.cleanables.values()) { entry.button.remove(); entry.model.removeFromParent(); disposeObject(entry.model); }
      current.cleanables.clear();
      view.dispose();
      cutaway.dispose();
      furnitureEditor.dispose();
      runtime.current = null;
      current.disposed = true;
      current.loading.clear();
      for (const pet of current.pets.values()) disposePet(pet);
      current.pets.clear();
      clearTimeout(feedbackTimer);
      renderer.setAnimationLoop(null);
      observer.disconnect();
      disposeObject(room);
      disposeObject(classroom.root);
      backdrop.dispose();
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      controls.dispose();
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      canvas.removeEventListener("pointermove", onPointerMove, true);
      canvas.removeEventListener("pointerup", stopPetRotation, true);
      canvas.removeEventListener("pointercancel", stopPetRotation, true);
      canvas.removeEventListener("lostpointercapture", stopPetRotation, true);
      canvas.removeEventListener("dblclick", onDoubleClick, true);
      renderer.domElement.remove();
    };
  }, [onError, onFurnitureEditing, onFurnitureLayout]);

  useEffect(() => {
    runtime.current?.view.setInspect(inspecting);
  }, [inspecting]);

  useEffect(() => {
    runtime.current?.view.focus(focusArea);
  }, [focusArea]);

  const lastViewReset = useRef(viewReset);
  useEffect(() => {
    if (viewReset !== lastViewReset.current) {
      lastViewReset.current = viewReset;
      runtime.current?.view.reset();
    }
  }, [viewReset]);

  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    const ids = new Set(cleanables.map((item) => item.id));
    for (const [id, entry] of current.cleanables) if (!ids.has(id)) {
      entry.button.remove(); entry.model.removeFromParent(); disposeObject(entry.model); current.cleanables.delete(id);
    }
    for (const item of cleanables) {
      if (current.cleanables.has(item.id)) continue;
      const model = createCleanableModel(item);
      const button = document.createElement("button");
      button.type = "button"; button.className = "cleanable-target";
      button.setAttribute("aria-label", `清扫${item.kind === "poop" ? "便便" : "纸团"}，获得 5 金币`);
      button.title = "点击清扫 · +5 金币";
      button.innerHTML = '<span aria-hidden="true">✦ +5</span>';
      let press: { x: number; y: number } | null = null;
      let dragged = false;
      button.addEventListener("pointerdown", (event) => { press = { x: event.clientX, y: event.clientY }; dragged = false; button.setPointerCapture(event.pointerId); });
      button.addEventListener("pointermove", (event) => { if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) dragged = true; });
      button.addEventListener("pointerup", () => { press = null; });
      button.addEventListener("pointercancel", () => { press = null; dragged = true; });
      button.addEventListener("click", async (event) => {
        if ((event.detail > 0 && dragged) || button.disabled || callbacks.current.paused || callbacks.current.inspecting) return;
        button.dataset.busy = "true"; button.disabled = true;
        try { await callbacks.current.onClean(item.id); }
        finally { button.dataset.busy = "false"; button.disabled = false; }
      });
      current.cleanables.set(item.id, { item, model, button });
      current.scene.add(model); host.current!.append(button);
    }
    for (const pet of current.pets.values()) {
      pet.wander.obstacles = petObstacles(current, pet.radius);
      pet.wander.targetX = pet.wander.x; pet.wander.targetZ = pet.wander.z; pet.wander.speed = 0;
    }
  }, [cleanables]);

  useEffect(() => {
    if (!runtime.current) return;
    const current = runtime.current;
    const ids = new Set(pets.map((pet) => pet.id));
    for (const [id, pet] of current.pets) {
      if (!ids.has(id)) { disposePet(pet); current.pets.delete(id); }
    }
    for (const id of current.loading) if (!ids.has(id)) current.loading.delete(id);
    for (const record of pets) {
      if (current.pets.has(record.id) || current.loading.has(record.id)) continue;
      if (current.pets.size + current.loading.size >= MAX_PETS) {
        onPetError(record.id, "房间最多可以放置 3 只宠物。");
        continue;
      }
      current.loading.add(record.id);
      let motion: PetMotion | null = null;
      loadModel(record.asset)
      .then((model) => {
        if (current.disposed || !current.loading.has(record.id)) {
          disposeObject(model.root);
          return;
        }
        const size = new Box3()
          .setFromObject(model.root)
          .getSize(new Vector3());
        // A rotation-safe radius keeps the whole model inside the walls and edges.
        motion = createPetMotion(model);
        if (!record.portrait) {
          try { callbacks.current.onPortrait(record.id, capturePetPortrait(current.renderer, motion.root, record.profile.facingYaw)); }
          catch { /* A thumbnail failure must not prevent a saved pet from loading. */ }
        }
        const radius = Math.hypot(size.x, size.z) / 2 + motion.clearance;
        const bound = Math.max(0.1, 5 - radius - .22);
        const obstacles = petObstacles(current, radius);
        const others = Array.from(current.pets.values(), (pet) => ({ x: pet.wander.x, z: pet.wander.z, radius: pet.radius }));
        const spawnObstacles = [...current.classroomObstacles, ...Array.from(current.cleanables.values(), ({item}) => ({minX:item.x-CLASSROOM_OFFSET-.38, maxX:item.x-CLASSROOM_OFFSET+.38, minZ:item.z-.38,maxZ:item.z+.38}))];
        const spawn = findClassroomSpot(radius, spawnObstacles, others, current.pets.size);
        if (!spawn) throw new Error("房间暂时没有足够的空位，请稍后重新导入。");
        const mover = new Group();
        mover.add(motion.root);
        motion.root.traverse((child) => {
          if (child instanceof Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        const label = document.createElement("div");
        label.className = "pet-name-tag";
        label.textContent = record.profile.name;
        label.hidden = true;
        host.current!.appendChild(label);
        const pet: PetRuntime = {
          id: record.id,
          name: record.profile.name,
          label,
          radius,
          walking: true,
          manualHeading: null,
          mover,
          motion,
          wander: createWander(bound, Math.random, obstacles, spawn),
        };
        // Preserve the preview's angle relative to the viewer, not the room's axes.
        const towardViewer = current.camera.getWorldDirection(new Vector3()).negate();
        pet.wander.yaw = Math.atan2(towardViewer.x, towardViewer.z) + record.profile.facingYaw;
        pet.wander.wait = 3;
        mover.position.set(pet.wander.x, 0, pet.wander.z);
        mover.rotation.y = pet.wander.yaw;
        motion.update(0, pet.wander);
        current.pets.set(record.id, pet);
        current.loading.delete(record.id);
        current.classroom.add(mover);
        current.render();
        onReady(record.id);
      })
      .catch((error) => {
        if (motion && !current.pets.has(record.id)) { motion.dispose(); disposeObject(motion.root); }
        if (!current.disposed && current.loading.delete(record.id))
          onPetError(record.id, error instanceof Error ? error.message : "模型读取失败。");
      });
    }
  }, [pets, onReady, onPetError]);
  return <div ref={host} className="room-canvas"><div ref={feedback} className="room-feedback" role="status" aria-live="polite" /></div>;
}
