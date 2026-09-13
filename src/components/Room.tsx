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
  MOUSE,
  OrthographicCamera,
  PCFSoftShadowMap,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
  SRGBColorSpace,
  TOUCH,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { disposeObject, loadModel } from "../lib/model";
import { createWander, resumeWander, stepWander, type WanderState } from "../lib/wander";
import { MAX_PETS, type PetRecord } from "../lib/pets";
import { findPetSpawn, PET_GAP } from "../lib/pet-placement";
import { createRoomShell, createBackdrop, ROOM_SIZE } from "../lib/room-shell";
import { createFurniture, FURNITURE_OBSTACLES } from "../lib/furniture";
import { createPetMotion, type PetMotion } from "../lib/pet-motion";

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
  camera: OrthographicCamera;
  render: () => void;
  pets: Map<string, PetRuntime>;
  loading: Set<string>;
  disposed: boolean;
};

function disposePet(pet: PetRuntime) {
  pet.mover.removeFromParent();
  pet.label.remove();
  pet.motion.dispose();
  disposeObject(pet.mover);
}

function updateNeighbors(pet: PetRuntime, current: Runtime) {
  pet.wander.neighbors = Array.from(current.pets.values())
    .filter((other) => other !== pet)
    .map((other) => ({ x: other.wander.x, z: other.wander.z, radius: pet.radius + other.radius + PET_GAP }));
}

export default function Room({
  pets,
  onReady,
  onError,
  onPetError,
}: {
  pets: readonly PetRecord[];
  onReady: (id: string) => void;
  onError: (message: string) => void;
  onPetError: (id: string, message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const feedback = useRef<HTMLDivElement>(null);

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
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "宠物房间");
    container.appendChild(renderer.domElement);
    const scene = new Scene();
    const backdrop = createBackdrop();
    scene.background = backdrop;
    const camera = new OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
    // View predominantly along one wall, placing the rear corner to the right.
    camera.position.set(24, 18, 9.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    // Keep the isometric room angle fixed: users can pan and zoom, but never orbit.
    controls.enableRotate = false;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    // A primary-button drag (and one-finger touch) pans the room directly.
    controls.mouseButtons.LEFT = MOUSE.PAN;
    controls.touches.ONE = TOUCH.PAN;
    controls.minZoom = 0.65;
    controls.maxZoom = 2.4;
    controls.target.set(0, 0.8, 0);
    controls.update();
    scene.add(new AmbientLight(0xffffff, 0.85));
    scene.add(new HemisphereLight("#f4fcff", "#fff0d5", 0.95));
    const sun = new DirectionalLight(0xfff7e8, 1.45);
    sun.position.set(3, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.normalBias = 0.025;
    sun.shadow.bias = -0.0001;
    sun.shadow.radius = 5;
    scene.add(sun);
    const room = createRoomShell();
    room.add(createFurniture());
    scene.add(room);
    const labelPosition = new Vector3();
    const render = () => {
      renderer.render(scene, camera);
      for (const pet of current.pets.values()) {
          const label = pet.label;
          labelPosition.set(pet.wander.x, pet.motion.height + 0.15, pet.wander.z).project(camera);
          label.hidden = Math.abs(labelPosition.x) > 1 || Math.abs(labelPosition.y) > 1 || Math.abs(labelPosition.z) > 1;
          const x = (labelPosition.x + 1) / 2 * container.clientWidth;
          const y = (1 - labelPosition.y) / 2 * container.clientHeight;
          label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
    };
    const current: Runtime = { scene, camera, render, pets: new Map(), loading: new Set(), disposed: false };
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
        hitBounds.center.set(pet.wander.x, pet.motion.height * 0.5, pet.wander.z);
        hitBounds.radius = pet.motion.height * 0.42;
        if (raycaster.ray.intersectSphere(hitBounds, intersection)) {
          const distance = raycaster.ray.origin.distanceToSquared(intersection);
          if (distance < nearestDistance) { nearestDistance = distance; nearest = pet; }
        }
      }
      return nearest;
    };
    const toggleWalking = (pet: PetRuntime, time: number) => {
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
      if (event.button !== 0 || gesture) return;
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
      if (!pet || event.timeStamp - lastDragTime < 400) return;
      // Pointer-up handles mouse double taps and touch. Native dblclick is a
      // fallback, not a second toggle of the same gesture.
      if (!(lastToggle?.id === pet.id && event.timeStamp - lastToggle.time < 100)) toggleWalking(pet, event.timeStamp);
      lastTap = null;
      event.preventDefault();
      event.stopPropagation();
    };
    canvas.addEventListener("pointerdown", onPointerDown, true);
    canvas.addEventListener("pointermove", onPointerMove, true);
    canvas.addEventListener("pointerup", stopPetRotation, true);
    canvas.addEventListener("pointercancel", stopPetRotation, true);
    canvas.addEventListener("lostpointercapture", stopPetRotation, true);
    canvas.addEventListener("dblclick", onDoubleClick, true);

    let previousTime: number | null = null;
    renderer.setAnimationLoop((time) => {
      const delta =
        previousTime === null
          ? 0
          : Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      controls.update();
      for (const pet of current.pets.values()) {
        const frameDelta = document.hidden ? 0 : delta;
        if (pet.manualHeading !== null) {
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
      const span = Math.max(6.95, 8.2 / aspect);
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
      runtime.current = null;
      current.disposed = true;
      current.loading.clear();
      for (const pet of current.pets.values()) disposePet(pet);
      current.pets.clear();
      clearTimeout(feedbackTimer);
      renderer.setAnimationLoop(null);
      observer.disconnect();
      disposeObject(room);
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
  }, [onError]);

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
        const radius = Math.hypot(size.x, size.z) / 2 + motion.clearance;
        const bound = Math.max(0.1, ROOM_SIZE / 2 - radius - 0.4);
        const obstacles = FURNITURE_OBSTACLES.map((obstacle) => ({
          minX: obstacle.minX - radius - 0.1,
          maxX: obstacle.maxX + radius + 0.1,
          minZ: obstacle.minZ - radius - 0.1,
          maxZ: obstacle.maxZ + radius + 0.1,
        }));
        const others = Array.from(current.pets.values(), (pet) => ({ x: pet.wander.x, z: pet.wander.z, radius: pet.radius }));
        const spawn = findPetSpawn(bound, obstacles, radius, others, current.pets.size === 0);
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
        current.scene.add(mover);
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
